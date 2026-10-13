import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { Module } from "@blazetrails/ruby-compat";
import { prepend } from "@blazetrails/ruby-compat/include";
import {
  AdditionalValue,
  EncryptedQuery,
  ExtendedDeterministicQueries,
  ExtendedEncryptableType,
  RelationQueries,
} from "./extended-deterministic-queries.js";
import { NullEncryptor } from "./null-encryptor.js";
import { NoMethodError } from "@blazetrails/activemodel";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Scheme } from "./scheme.js";
import { Encryption } from "../encryption.js";
import { deterministicEncryptedAttributes } from "./encryptable-record.js";

import { YAMLColumn } from "../coders/yaml-column.js";
import "../encryption.js";
import { Base } from "../base.js";
import { Relation } from "../relation.js";
import { Psych } from "@blazetrails/ruby-compat/psych";

fixtures([], { useTransactionalTests: false });

const TEST_KEY = Buffer.alloc(32, "x").toString("base64");
const PREVIOUS_KEY = Buffer.alloc(32, "y").toString("base64");

function buildSerializedBook({ previousSchemes = false, coder = JSON as unknown } = {}) {
  class EncryptedSerializedBook extends Base {
    static {
      this._tableName = "books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.encrypts("name", {
        deterministic: true,
        key: TEST_KEY,
        supportUnencryptedData: false,
        ...(previousSchemes
          ? { previousSchemes: [new Scheme({ deterministic: true, key: PREVIOUS_KEY })] }
          : {}),
      });
      this.serialize("name", { coder });
    }
  }
  return EncryptedSerializedBook;
}

describe("ActiveRecord::Encryption::ExtendedDeterministicQueriesTest (trails extras)", () => {
  let EncryptedSerializedBook: ReturnType<typeof buildSerializedBook>;
  let PreviousSchemeSerializedBook: ReturnType<typeof buildSerializedBook>;
  let PreviousSchemeYamlBook: ReturnType<typeof buildSerializedBook>;

  const savedConfig = {
    extendQueries: Encryption.config.extendQueries,
    supportUnencryptedData: Encryption.config.supportUnencryptedData,
    keyDerivationSalt: Encryption.config.keyDerivationSalt,
    primaryKey: Encryption.config.primaryKey,
    deterministicKey: Encryption.config.deterministicKey,
  };
  const relProto = Relation.prototype as unknown as Record<string, unknown>;
  const baseStatics = Base as unknown as Record<string, unknown>;
  const savedMethods: Record<string, unknown> = {};

  beforeAll(async () => {
    Encryption.config.extendQueries = true;
    Encryption.config.supportUnencryptedData = true;
    Encryption.config.keyDerivationSalt = "test-salt";
    Encryption.config.primaryKey = "test-primary-key";
    Encryption.config.deterministicKey = "test-deterministic-key";

    savedMethods.where = relProto.where;
    savedMethods.isExists = relProto.isExists;
    savedMethods.scopeForCreate = relProto.scopeForCreate;
    savedMethods.findBy = baseStatics.findBy;
    savedMethods.serialize = EncryptedAttributeType.prototype.serialize;

    ExtendedDeterministicQueries.installSupport();

    EncryptedSerializedBook = buildSerializedBook();
    PreviousSchemeSerializedBook = buildSerializedBook({ previousSchemes: true });
    PreviousSchemeYamlBook = buildSerializedBook({ previousSchemes: true, coder: YAMLColumn });
    await EncryptedSerializedBook.where("1=1");
  });

  fixtures([], { useTransactionalTests: true });

  afterAll(() => {
    relProto.where = savedMethods.where;
    relProto.isExists = savedMethods.isExists;
    relProto.scopeForCreate = savedMethods.scopeForCreate;
    baseStatics.findBy = savedMethods.findBy;
    EncryptedAttributeType.prototype.serialize =
      savedMethods.serialize as typeof EncryptedAttributeType.prototype.serialize;

    Encryption.config.extendQueries = savedConfig.extendQueries;
    Encryption.config.supportUnencryptedData = savedConfig.supportUnencryptedData;
    Encryption.config.keyDerivationSalt = savedConfig.keyDerivationSalt;
    Encryption.config.primaryKey = savedConfig.primaryKey;
    Encryption.config.deterministicKey = savedConfig.deterministicKey;
  });

  it("finds records by plaintext when a deterministic attribute is serialized after encryption", async () => {
    await EncryptedSerializedBook.create({ name: "Dune" });
    expect(await EncryptedSerializedBook.findBy({ name: "Dune" })).not.toBeNull();
    expect(await EncryptedSerializedBook.where("id > 0").findBy({ name: "Dune" })).not.toBeNull();
    expect(await EncryptedSerializedBook.isExists({ name: "Dune" })).toBe(true);
  });

  it("raises NoMethodError when a previous-scheme candidate reaches the serialized coder", async () => {
    await expect(PreviousSchemeSerializedBook.findBy({ name: "Dune" })).rejects.toThrow(
      NoMethodError,
    );
    await expect(PreviousSchemeSerializedBook.where({ name: "Dune" }).first()).rejects.toThrow(
      NoMethodError,
    );

    const fullType = PreviousSchemeSerializedBook.typeForAttribute("name") as {
      serialize(v: unknown): unknown;
    };
    const prevType = (
      PreviousSchemeSerializedBook.typeForAttribute("name") as unknown as EncryptedAttributeType
    ).previousTypes[0];
    const av = new AdditionalValue("Dune", prevType);
    expect(() => fullType.serialize(av)).toThrow(NoMethodError);
  });

  it("raises Psych::DisallowedClass when a previous-scheme candidate reaches the YAML coder", async () => {
    await expect(async () => PreviousSchemeYamlBook.findBy({ name: "Dune" })).rejects.toThrow(
      Psych.DisallowedClass,
    );
    expect(() => PreviousSchemeYamlBook.where({ name: "Dune" })).toThrow(Psych.DisallowedClass);

    const fullType = PreviousSchemeYamlBook.typeForAttribute("name") as {
      serialize(v: unknown): unknown;
    };
    const prevType = (
      PreviousSchemeYamlBook.typeForAttribute("name") as unknown as EncryptedAttributeType
    ).previousTypes[0];
    const av = new AdditionalValue("Dune", prevType);
    expect(() => fullType.serialize(av)).toThrow(Psych.DisallowedClass);
    expect(() => fullType.serialize(av)).toThrow(/Tried to dump unspecified class/);
  });

  it("AdditionalValue in where clause survives toSql without throwing", () => {
    class EncryptedBook extends Base {
      static {
        this._tableName = "books";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.encrypts("name", { deterministic: true, key: TEST_KEY });
      }
    }
    const relation = EncryptedBook.where({ name: "Agile Web Development" });
    const sql = relation.toSql();
    expect(typeof sql).toBe("string");
    expect(sql).toMatch(/WHERE/i);
  });
});

describe("EncryptedQuery.processArguments (trails extras)", () => {
  it("stringifies Array and Symbol keys of a Map hash and expands deterministic values", async () => {
    const { EncryptedQuery } = await import("./extended-deterministic-queries.js");
    const { NullEncryptor } = await import("./null-encryptor.js");
    const prev = new Scheme({ deterministic: true, encryptor: new NullEncryptor() });
    const type = new EncryptedAttributeType({
      scheme: new Scheme({
        deterministic: true,
        encryptor: new NullEncryptor(),
        previousSchemes: [prev],
      }),
    });
    const owner = {
      encryptedAttributes: new Set(["email"]),
      typeForAttribute: () => type,
      deterministicEncryptedAttributes,
    };
    const args: unknown[] = [
      new Map<unknown, unknown>([
        [["id", 1], [[1, 2]]],
        ["email", "a@x"],
      ]),
    ];
    EncryptedQuery.processArguments(owner, args, true);
    const hash = args[0] as Map<unknown, unknown>;
    const keys = [...hash.keys()];
    expect(keys[0]).toEqual(["id", "1"]);
    const email = hash.get("email") as unknown[];
    expect(email[0]).toBe("a@x");
    expect(email[1]).toBeInstanceOf(AdditionalValue);
  });
});

function makeType(deterministic = true): EncryptedAttributeType {
  return new EncryptedAttributeType({
    scheme: new Scheme({ deterministic, encryptor: new NullEncryptor() }),
  });
}

describe("ActiveRecord::Encryption::ExtendedDeterministicQueries::AdditionalValue", () => {
  it("stores the serialized value", () => {
    const type = makeType();
    const av = new AdditionalValue("hello", type);
    expect(av.type).toBe(type);
    expect(av.value).toBe("hello");
  });
});

describe("ActiveRecord::Encryption::ExtendedDeterministicQueries::EncryptedQuery#processArguments", () => {
  function modelWithDeterministicEmail() {
    const prev = new Scheme({ deterministic: true, encryptor: new NullEncryptor() });
    const type = new EncryptedAttributeType({
      scheme: new Scheme({
        deterministic: true,
        encryptor: new NullEncryptor(),
        previousSchemes: [prev],
      }),
    });
    return {
      encryptedAttributes: new Set(["email"]),
      typeForAttribute: () => type,
      deterministicEncryptedAttributes,
    };
  }

  it("short-circuits when checkForAdditionalValues=true and the last array element is an AdditionalValue", () => {
    const model = modelWithDeterministicEmail();
    const type = model.typeForAttribute();
    const already = [new AdditionalValue("x", type)];
    const out = EncryptedQuery.processArguments(model, [{ email: already }], true) as [
      Record<string, unknown>,
    ];
    expect(out[0].email).toBe(already);
  });

  it("does not short-circuit when checkForAdditionalValues=false (findBy path always expands)", () => {
    const model = modelWithDeterministicEmail();
    const type = model.typeForAttribute();
    const already = [new AdditionalValue("x", type)];
    const [out] = EncryptedQuery.processArguments(model, [{ email: already }], false) as [
      Record<string, unknown[]>,
    ];
    expect(out.email.length).toBeGreaterThan(already.length);
  });

  it("preserves in-place AdditionalValue elements when checkForAdditionalValues=true", () => {
    const model = modelWithDeterministicEmail();
    const type = model.typeForAttribute();
    const av = new AdditionalValue("x", type);
    const [out] = EncryptedQuery.processArguments(model, [{ email: [av, "y"] }], true) as [
      Record<string, unknown[]>,
    ];
    expect(out.email[0]).toBe(av);
  });
});

function prepended(
  mod: Module,
  methods: Record<string, unknown>,
): { serialize(value: unknown): unknown; scopeForCreate(): Record<string, unknown> } {
  class Host {}
  Object.assign(Host.prototype, methods);
  prepend(Host, mod);
  return new Host() as unknown as ReturnType<typeof prepended>;
}

describe("ActiveRecord::Encryption::ExtendedDeterministicQueries::ExtendedEncryptableType", () => {
  it("passes AdditionalValue through without re-serializing", () => {
    const type = makeType();
    const av = new AdditionalValue("hello", type);
    const serialize = (v: unknown) => `serialized(${v})`;
    expect(prepended(ExtendedEncryptableType, { serialize }).serialize(av)).toBe(av.value);
  });

  it("delegates to originalSerialize for non-AdditionalValue", () => {
    const serialize = (v: unknown) => `serialized(${v})`;
    expect(prepended(ExtendedEncryptableType, { serialize }).serialize("hello")).toBe(
      "serialized(hello)",
    );
  });
});

describe("ActiveRecord::Encryption::ExtendedDeterministicQueries::RelationQueries#scopeForCreate", () => {
  it("unwraps AdditionalValues from whereValuesHash() to produce the current-scheme ciphertext", () => {
    const type = makeType(true);
    const prevType = makeType(true);
    const avCurrent = new AdditionalValue("plain@example.com", type);
    const avPrev = new AdditionalValue("plain@example.com", prevType);

    const model = {
      encryptedAttributes: new Set(["email"]),
      typeForAttribute: () => type,
      deterministicEncryptedAttributes,
    };
    const relation = {
      model,
      whereValuesHash: () => ({ email: [avCurrent, avPrev] }),
    };

    const result = prepended(RelationQueries, {
      ...relation,
      scopeForCreate: () => ({}),
    }).scopeForCreate();
    expect(result.email).toBe(avCurrent);
  });

  it("leaves attributes alone when whereValuesHash has no matching entry", () => {
    const type = makeType(true);
    const model = {
      encryptedAttributes: new Set(["email"]),
      typeForAttribute: () => type,
      deterministicEncryptedAttributes,
    };
    const relation = { model, whereValuesHash: () => ({}) };

    const result = prepended(RelationQueries, {
      ...relation,
      scopeForCreate: () => ({ email: "plain@example.com" }),
    }).scopeForCreate();
    expect(result.email).toBe("plain@example.com");
  });

  it("skips non-deterministic encrypted attributes", () => {
    const type = makeType(false);
    const av = new AdditionalValue("enc", type);
    const model = {
      encryptedAttributes: new Set(["body"]),
      typeForAttribute: () => type,
      deterministicEncryptedAttributes,
    };
    const relation = { model, whereValuesHash: () => ({ body: [av] }) };

    const result = prepended(RelationQueries, {
      ...relation,
      scopeForCreate: () => ({}),
    }).scopeForCreate();
    expect(result.body).toBeUndefined();
  });

  it("ignores scalar (non-array) where values", () => {
    const type = makeType(true);
    const model = {
      encryptedAttributes: new Set(["email"]),
      typeForAttribute: () => type,
      deterministicEncryptedAttributes,
    };
    const relation = {
      model,
      whereValuesHash: () => ({ email: "plain@example.com" }),
    };
    const result = prepended(RelationQueries, {
      ...relation,
      scopeForCreate: () => ({}),
    }).scopeForCreate();
    expect(result.email).toBeUndefined();
  });

  it("reads IN-array values from a real Relation via whereValuesHash() (integration)", () => {
    class Contact extends Base {
      static {
        this._tableName = "contacts";
        this.attribute("id", "integer");
        this.attribute("email", "string");
      }
    }
    const rel = Contact.all().where({ email: ["a@x", "b@x"] });
    expect(rel.whereValuesHash()).toEqual({ email: ["a@x", "b@x"] });
    expect(rel.scopeForCreate()).toEqual({});
  });

  it("unwraps AdditionalValue trailers end-to-end on a real Relation", () => {
    const type = makeType(true);
    const prevType = makeType(true);

    class Contact extends Base {
      static {
        this._tableName = "contacts";
        this.attribute("id", "integer");
        this.attribute("email", "string");
      }
    }
    const contact = Contact as unknown as {
      encryptedAttributes: Set<string>;
      decorateAttributes(names: string[], decorator: () => unknown): void;
    };
    contact.encryptedAttributes = new Set(["email"]);
    contact.decorateAttributes(["email"], () => type);

    const avCurrent = new AdditionalValue("plain@example.com", type);
    const avPrev = new AdditionalValue("plain@example.com", prevType);
    const rel = Contact.all().where({ email: [avCurrent, avPrev] });

    const hash = rel.whereValuesHash();
    expect(Array.isArray(hash.email)).toBe(true);
    expect((hash.email as unknown[])[0]).toBeInstanceOf(AdditionalValue);
    expect((hash.email as AdditionalValue[])[0].value).toBe(avCurrent.value);

    const scope = prepended(RelationQueries, {
      model: rel.model,
      whereValuesHash: () => rel.whereValuesHash(),
      scopeForCreate: () => ({}),
    }).scopeForCreate();
    expect(scope.email).toBeInstanceOf(AdditionalValue);
    expect((scope.email as AdditionalValue).value).toBe(avCurrent.value);
  });
});

describe("ActiveRecord::Encryption::ExtendedDeterministicQueries.installSupport", () => {
  it("is idempotent — second call is a no-op", () => {
    ExtendedDeterministicQueries.installSupport();
    const firstPatched = Relation.prototype.where;
    const firstSerialize = EncryptedAttributeType.prototype.serialize;
    ExtendedDeterministicQueries.installSupport();
    expect(Relation.prototype.where).toBe(firstPatched);
    expect(EncryptedAttributeType.prototype.serialize).toBe(firstSerialize);
  });
});
