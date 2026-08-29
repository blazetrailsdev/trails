import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { ExtendedDeterministicQueries, AdditionalValue } from "./extended-deterministic-queries.js";
import { NoMethodError } from "@blazetrails/activemodel";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Scheme } from "./scheme.js";
import { Configurable } from "./configurable.js";
import { installExtendedQueriesIfConfigured } from "./install.js";
import {
  ExtendedDeterministicUniquenessValidator,
  EncryptedUniquenessValidator,
} from "./extended-deterministic-uniqueness-validator.js";
import { UniquenessValidator } from "../validations.js";
import { YAMLColumn } from "../coders/yaml-column.js";
import { encryptedTypeOf } from "./encryptable-record.js";
import "../encryption.js";
import { Base } from "../base.js";
import { Relation } from "../relation.js";
import { DisallowedClass } from "../coders/yaml-column.js";

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
    extendQueries: Configurable.config.extendQueries,
    supportUnencryptedData: Configurable.config.supportUnencryptedData,
    keyDerivationSalt: Configurable.config.keyDerivationSalt,
    primaryKey: Configurable.config.primaryKey,
    deterministicKey: Configurable.config.deterministicKey,
  };
  const relProto = Relation.prototype as unknown as Record<string, unknown>;
  const baseStatics = Base as unknown as Record<string, unknown>;
  const savedMethods: Record<string, unknown> = {};

  beforeAll(async () => {
    Configurable.config.extendQueries = true;
    Configurable.config.supportUnencryptedData = true;
    Configurable.config.keyDerivationSalt = "test-salt";
    Configurable.config.primaryKey = "test-primary-key";
    Configurable.config.deterministicKey = "test-deterministic-key";

    savedMethods.where = relProto.where;
    savedMethods.exists = relProto.exists;
    savedMethods.scopeForCreate = relProto.scopeForCreate;
    savedMethods.findBy = baseStatics.findBy;
    savedMethods.serialize = EncryptedAttributeType.prototype.serialize;

    installExtendedQueriesIfConfigured();

    EncryptedSerializedBook = buildSerializedBook();
    PreviousSchemeSerializedBook = buildSerializedBook({ previousSchemes: true });
    PreviousSchemeYamlBook = buildSerializedBook({ previousSchemes: true, coder: YAMLColumn });
    await EncryptedSerializedBook.where("1=1");
  });

  fixtures([]);

  afterAll(() => {
    relProto.where = savedMethods.where;
    relProto.exists = savedMethods.exists;
    relProto.scopeForCreate = savedMethods.scopeForCreate;
    baseStatics.findBy = savedMethods.findBy;
    EncryptedAttributeType.prototype.serialize =
      savedMethods.serialize as typeof EncryptedAttributeType.prototype.serialize;
    (ExtendedDeterministicQueries as unknown as Record<string, unknown>)._installed = false;
    ExtendedDeterministicUniquenessValidator.resetSupport(UniquenessValidator);

    Configurable.config.extendQueries = savedConfig.extendQueries;
    Configurable.config.supportUnencryptedData = savedConfig.supportUnencryptedData;
    Configurable.config.keyDerivationSalt = savedConfig.keyDerivationSalt;
    Configurable.config.primaryKey = savedConfig.primaryKey;
    Configurable.config.deterministicKey = savedConfig.deterministicKey;
  });

  it("finds records by plaintext when a deterministic attribute is serialized after encryption", async () => {
    await EncryptedSerializedBook.create({ name: "Dune" });
    expect(await EncryptedSerializedBook.findBy({ name: "Dune" })).not.toBeNull();
    expect(await EncryptedSerializedBook.where("id > 0").findBy({ name: "Dune" })).not.toBeNull();
    expect(await EncryptedSerializedBook.exists({ name: "Dune" })).toBe(true);
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
    const prevType = encryptedTypeOf(PreviousSchemeSerializedBook.typeForAttribute("name"))!
      .previousTypes[0];
    const av = new AdditionalValue("Dune", prevType);
    expect(() => fullType.serialize(av)).toThrow(NoMethodError);
  });

  it("raises Psych::DisallowedClass when a previous-scheme candidate reaches the YAML coder", async () => {
    await expect(PreviousSchemeYamlBook.findBy({ name: "Dune" })).rejects.toThrow(DisallowedClass);
    await expect(PreviousSchemeYamlBook.where({ name: "Dune" }).first()).rejects.toThrow(
      DisallowedClass,
    );

    const fullType = PreviousSchemeYamlBook.typeForAttribute("name") as {
      serialize(v: unknown): unknown;
    };
    const prevType = encryptedTypeOf(PreviousSchemeYamlBook.typeForAttribute("name"))!
      .previousTypes[0];
    const av = new AdditionalValue("Dune", prevType);
    expect(() => fullType.serialize(av)).toThrow(DisallowedClass);
    expect(() => fullType.serialize(av)).toThrow(/Tried to dump unspecified class/);
  });

  it("uniqueness ciphertext generation serializes through the full resolved type", () => {
    const fullType = PreviousSchemeSerializedBook.typeForAttribute("name") as {
      serialize(v: unknown): unknown;
    };
    expect(fullType).not.toBeInstanceOf(EncryptedAttributeType);

    const candidates = EncryptedUniquenessValidator.allCiphertextsFor(
      PreviousSchemeSerializedBook,
      "name",
      "Dune",
    );
    expect(candidates[0]).toBe("Dune");
    expect(candidates.length).toBeGreaterThan(1);
    const arelAttr = (
      PreviousSchemeSerializedBook as unknown as {
        arelTable: { get(name: string): { typeCaster: unknown } };
      }
    ).arelTable.get("name");
    const caster = arelAttr.typeCaster as { serialize(v: unknown): unknown };
    expect(caster.serialize("Dune")).toEqual(fullType.serialize("Dune"));
  });
});
