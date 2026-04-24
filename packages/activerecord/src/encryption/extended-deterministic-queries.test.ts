import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import {
  AdditionalValue,
  EncryptedQuery,
  ExtendedDeterministicQueries,
  ExtendedEncryptableType,
  RelationQueries,
} from "./extended-deterministic-queries.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Scheme } from "./scheme.js";
import { NullEncryptor } from "./null-encryptor.js";
import { Configurable } from "./configurable.js";
import { installExtendedQueriesIfConfigured } from "./install.js";
import { ExtendedDeterministicUniquenessValidator } from "./extended-deterministic-uniqueness-validator.js";
import { UniquenessValidator } from "../validations.js";
import { Base } from "../base.js";
import { Relation } from "../relation.js";
import { createTestAdapter } from "../test-adapter.js";

// 32 bytes (base64-encoded) for AES-256-GCM. Cipher decodes the key from
// base64, so we pad a known repeating byte to 32 bytes and encode. Shared
// across the five Book model classes so they round-trip the same rows.
const TEST_KEY = Buffer.alloc(32, "x").toString("base64");

/**
 * Shared fixture for the Rails port of ExtendedDeterministicQueriesTest.
 * Mirrors Rails' `models/book_encrypted.rb`: one `books` table, five model
 * classes pointing at it with different encryption configurations.
 *
 * Config mutation and prototype patching are handled in the describe
 * block's beforeAll/afterAll; setupBooks() only builds fresh classes
 * and an adapter per test.
 */
function setupBooks() {
  const adapter = createTestAdapter();

  class UnencryptedBook extends Base {
    static {
      this._tableName = "books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.adapter = adapter;
    }
  }
  class EncryptedBook extends Base {
    static {
      this._tableName = "books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.adapter = adapter;
      this.encrypts("name", { deterministic: true, key: TEST_KEY });
    }
  }
  class EncryptedBookWithDowncaseName extends Base {
    static {
      this._tableName = "books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.adapter = adapter;
      this.encrypts("name", { deterministic: true, downcase: true, key: TEST_KEY });
    }
  }
  class EncryptedBookWithUnencryptedDataOptedOut extends Base {
    static {
      this._tableName = "books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.adapter = adapter;
      this.encrypts("name", { deterministic: true, supportUnencryptedData: false, key: TEST_KEY });
    }
  }
  class EncryptedBookWithUnencryptedDataOptedIn extends Base {
    static {
      this._tableName = "books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.adapter = adapter;
      this.encrypts("name", { deterministic: true, supportUnencryptedData: true, key: TEST_KEY });
    }
  }

  return {
    adapter,
    UnencryptedBook,
    EncryptedBook,
    EncryptedBookWithDowncaseName,
    EncryptedBookWithUnencryptedDataOptedOut,
    EncryptedBookWithUnencryptedDataOptedIn,
  };
}

describe("ActiveRecord::Encryption::ExtendedDeterministicQueriesTest", () => {
  let books: ReturnType<typeof setupBooks>;

  // Snapshot global state up front and restore it after the whole
  // block. Configurable.config and Relation/Base/EncryptedAttributeType
  // prototypes are shared across the Vitest worker; leaving them
  // mutated would make sibling test files order-dependent.
  const savedConfig = {
    extendQueries: Configurable.config.extendQueries,
    supportUnencryptedData: Configurable.config.supportUnencryptedData,
    keyDerivationSalt: Configurable.config.keyDerivationSalt,
    primaryKey: Configurable.config.primaryKey,
    deterministicKey: Configurable.config.deterministicKey,
  };
  const savedMethods: {
    where?: Function;
    exists?: Function;
    scopeForCreate?: Function;
    findBy?: Function;
    serialize?: Function;
  } = {};

  beforeAll(() => {
    Configurable.config.extendQueries = true;
    Configurable.config.supportUnencryptedData = true;
    Configurable.config.keyDerivationSalt = "test-salt";
    Configurable.config.primaryKey = "test-primary-key";
    Configurable.config.deterministicKey = "test-deterministic-key";

    savedMethods.where = Relation.prototype.where;
    savedMethods.exists = (Relation.prototype as any).exists;
    savedMethods.scopeForCreate = (Relation.prototype as any).scopeForCreate;
    savedMethods.findBy = (Base as any).findBy;
    savedMethods.serialize = EncryptedAttributeType.prototype.serialize;

    installExtendedQueriesIfConfigured();
  });

  afterAll(() => {
    Relation.prototype.where = savedMethods.where as typeof Relation.prototype.where;
    (Relation.prototype as any).exists = savedMethods.exists;
    (Relation.prototype as any).scopeForCreate = savedMethods.scopeForCreate;
    (Base as any).findBy = savedMethods.findBy;
    EncryptedAttributeType.prototype.serialize =
      savedMethods.serialize as typeof EncryptedAttributeType.prototype.serialize;
    (ExtendedDeterministicQueries as any)._installed = false;
    ExtendedDeterministicUniquenessValidator.resetSupport(UniquenessValidator);

    Configurable.config.extendQueries = savedConfig.extendQueries;
    Configurable.config.supportUnencryptedData = savedConfig.supportUnencryptedData;
    Configurable.config.keyDerivationSalt = savedConfig.keyDerivationSalt;
    Configurable.config.primaryKey = savedConfig.primaryKey;
    Configurable.config.deterministicKey = savedConfig.deterministicKey;
  });

  beforeEach(() => {
    books = setupBooks();
  });

  it("Finds records when data is unencrypted", async () => {
    const { UnencryptedBook, EncryptedBook } = books;
    await UnencryptedBook.create({ name: "Dune" });
    expect(await EncryptedBook.findBy({ name: "Dune" })).not.toBeNull();
    expect(await EncryptedBook.where("id > 0").findBy({ name: "Dune" })).not.toBeNull();
  });

  it("Finds records when data is encrypted", async () => {
    const { EncryptedBook } = books;
    await EncryptedBook.create({ name: "Dune" });
    expect(await EncryptedBook.findBy({ name: "Dune" })).not.toBeNull();
    expect(await EncryptedBook.where("id > 0").findBy({ name: "Dune" })).not.toBeNull();
  });

  it("Works well with downcased attributes", async () => {
    const { EncryptedBookWithDowncaseName } = books;
    await EncryptedBookWithDowncaseName.create({ name: "Dune" });
    expect(await EncryptedBookWithDowncaseName.findBy({ name: "DUNE" })).not.toBeNull();
  });

  it("Works well with string attribute names", async () => {
    const { UnencryptedBook, EncryptedBook } = books;
    await UnencryptedBook.create({ name: "Dune" });
    expect(await EncryptedBook.findBy({ name: "Dune" })).not.toBeNull();
  });

  it("find_or_create_by works", async () => {
    const { EncryptedBook } = books;
    await EncryptedBook.findOrCreateBy({ name: "Dune" });
    expect(await EncryptedBook.findBy({ name: "Dune" })).not.toBeNull();

    await EncryptedBook.findOrCreateBy({ name: "Dune" });
    expect(await EncryptedBook.findBy({ name: "Dune" })).not.toBeNull();
    expect(await EncryptedBook.where({ name: "Dune" }).count()).toBe(1);
  });

  it("does not mutate arguments", async () => {
    const { EncryptedBook } = books;
    const props = { name: "Dune" };
    const record = await EncryptedBook.findOrInitializeBy(props);
    expect((record as any).name).toBe("Dune");
    expect(props.name).toBe("Dune");
  });

  it("where(...).first_or_create works", async () => {
    const { EncryptedBook } = books;
    await EncryptedBook.where({ name: "Dune" }).firstOrCreate();
    expect(await EncryptedBook.exists({ name: "Dune" })).toBe(true);
  });

  it("exists?(...) works", async () => {
    const { EncryptedBook } = books;
    await EncryptedBook.create({ name: "Dune" });
    expect(await EncryptedBook.exists({ name: "Dune" })).toBe(true);
  });

  it("If support_unencrypted_data is opted out at the attribute level, cannot find unencrypted data", async () => {
    const { UnencryptedBook, EncryptedBookWithUnencryptedDataOptedOut } = books;
    await UnencryptedBook.create({ name: "Dune" });
    expect(await EncryptedBookWithUnencryptedDataOptedOut.findBy({ name: "Dune" })).toBeNull();
    expect(
      await EncryptedBookWithUnencryptedDataOptedOut.where("id > 0").findBy({ name: "Dune" }),
    ).toBeNull();
  });

  it("If support_unencrypted_data is opted out at the attribute level, can find encrypted data", async () => {
    const { EncryptedBook, EncryptedBookWithUnencryptedDataOptedOut } = books;
    await EncryptedBook.create({ name: "Dune" });
    expect(await EncryptedBookWithUnencryptedDataOptedOut.findBy({ name: "Dune" })).not.toBeNull();
    expect(
      await EncryptedBookWithUnencryptedDataOptedOut.where("id > 0").findBy({ name: "Dune" }),
    ).not.toBeNull();
  });

  it("If support_unencrypted_data is opted in at the attribute level, can find unencrypted data", async () => {
    const { UnencryptedBook, EncryptedBookWithUnencryptedDataOptedIn } = books;
    await UnencryptedBook.create({ name: "Dune" });
    expect(await EncryptedBookWithUnencryptedDataOptedIn.findBy({ name: "Dune" })).not.toBeNull();
    expect(
      await EncryptedBookWithUnencryptedDataOptedIn.where("id > 0").findBy({ name: "Dune" }),
    ).not.toBeNull();
  });

  it("If support_unencrypted_data is opted in at the attribute level, can find encrypted data", async () => {
    const { EncryptedBook, EncryptedBookWithUnencryptedDataOptedIn } = books;
    await EncryptedBook.create({ name: "Dune" });
    expect(await EncryptedBookWithUnencryptedDataOptedIn.findBy({ name: "Dune" })).not.toBeNull();
    expect(
      await EncryptedBookWithUnencryptedDataOptedIn.where("id > 0").findBy({ name: "Dune" }),
    ).not.toBeNull();
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

  it("toString returns the string value", () => {
    const type = makeType();
    const av = new AdditionalValue("hello", type);
    expect(String(av)).toBe(String(av.value));
  });

  it("[Symbol.toPrimitive] with number hint returns the numeric value", () => {
    const type = makeType();
    const av = new AdditionalValue("42", type);
    expect(+av).toBe(42);
  });
});

describe("ActiveRecord::Encryption::ExtendedDeterministicQueries::EncryptedQuery#processArguments", () => {
  // Use a deterministic scheme with a previous scheme so expansion
  // actually produces AdditionalValue wrappers we can assert on.
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
      _encryptedAttributes: new Set(["email"]),
      _attributeDefinitions: new Map([["email", { type }]]),
    };
  }

  it("short-circuits when checkForAdditionalValues=true and the last array element is an AdditionalValue", () => {
    // Rails: `return value if check_for_additional_values && value.last.is_a?(AdditionalValue)`.
    // Prevents a chained `.where()` on the same relation from re-expanding
    // an already-expanded condition into AV-of-AV.
    const model = modelWithDeterministicEmail();
    const type = (model._attributeDefinitions.get("email") as any).type as EncryptedAttributeType;
    const already = [new AdditionalValue("x", type)];
    const out = EncryptedQuery.processArguments(model, [{ email: already }], true) as [
      Record<string, unknown>,
    ];
    expect(out[0].email).toBe(already);
  });

  it("does not short-circuit when checkForAdditionalValues=false (findBy path always expands)", () => {
    const model = modelWithDeterministicEmail();
    const type = (model._attributeDefinitions.get("email") as any).type as EncryptedAttributeType;
    const already = [new AdditionalValue("x", type)];
    const [out] = EncryptedQuery.processArguments(model, [{ email: already }], false) as [
      Record<string, unknown[]>,
    ];
    // Without short-circuit, the AV is re-expanded (wrapped in a fresh AV).
    expect(out.email.length).toBeGreaterThan(already.length);
  });

  it("preserves in-place AdditionalValue elements when checkForAdditionalValues=true", () => {
    // Rails: within flat_map, `each_value` that is already an AV passes
    // through untouched instead of running through additional_values_for.
    const model = modelWithDeterministicEmail();
    const type = (model._attributeDefinitions.get("email") as any).type as EncryptedAttributeType;
    const av = new AdditionalValue("x", type);
    // Mix: a plaintext AND an AV that isn't last — so the whole-array
    // short-circuit doesn't apply, but the per-element check should.
    const [out] = EncryptedQuery.processArguments(model, [{ email: [av, "y"] }], true) as [
      Record<string, unknown[]>,
    ];
    expect(out.email[0]).toBe(av);
  });
});

describe("ActiveRecord::Encryption::ExtendedDeterministicQueries::ExtendedEncryptableType", () => {
  it("passes AdditionalValue through without re-serializing", () => {
    const type = makeType();
    const av = new AdditionalValue("hello", type);
    const serialize = (v: unknown) => `serialized(${v})`;
    expect(ExtendedEncryptableType.serialize(serialize, av)).toBe(av.value);
  });

  it("delegates to originalSerialize for non-AdditionalValue", () => {
    const serialize = (v: unknown) => `serialized(${v})`;
    expect(ExtendedEncryptableType.serialize(serialize, "hello")).toBe("serialized(hello)");
  });
});

describe("ActiveRecord::Encryption::ExtendedDeterministicQueries::RelationQueries#scopeForCreate", () => {
  it("unwraps AdditionalValues from whereValuesHash() to produce the current-scheme ciphertext", () => {
    const type = makeType(true);
    const prevType = makeType(true);
    const avCurrent = new AdditionalValue("plain@example.com", type);
    const avPrev = new AdditionalValue("plain@example.com", prevType);

    const model = {
      _encryptedAttributes: new Set(["email"]),
      _attributeDefinitions: new Map([["email", { type }]]),
    };
    const relation = {
      model,
      whereValuesHash: () => ({ email: [avCurrent, avPrev] }),
    };

    const result = RelationQueries.scopeForCreate(() => ({}), relation);
    // scope_for_create keeps the AV reference so serialize unwraps to
    // ciphertext on save without re-encrypting (our cast->toString
    // path would otherwise double-encrypt a plaintext-unwrapped value).
    expect(result.email).toBe(avCurrent);
  });

  it("leaves attributes alone when whereValuesHash has no matching entry", () => {
    const type = makeType(true);
    const model = {
      _encryptedAttributes: new Set(["email"]),
      _attributeDefinitions: new Map([["email", { type }]]),
    };
    const relation = { model, whereValuesHash: () => ({}) };

    const result = RelationQueries.scopeForCreate(() => ({ email: "plain@example.com" }), relation);
    expect(result.email).toBe("plain@example.com");
  });

  it("skips non-deterministic encrypted attributes", () => {
    const type = makeType(false);
    const av = new AdditionalValue("enc", type);
    const model = {
      _encryptedAttributes: new Set(["body"]),
      _attributeDefinitions: new Map([["body", { type }]]),
    };
    const relation = { model, whereValuesHash: () => ({ body: [av] }) };

    const result = RelationQueries.scopeForCreate(() => ({}), relation);
    expect(result.body).toBeUndefined();
  });

  it("ignores scalar (non-array) where values", () => {
    const type = makeType(true);
    const model = {
      _encryptedAttributes: new Set(["email"]),
      _attributeDefinitions: new Map([["email", { type }]]),
    };
    const relation = {
      model,
      whereValuesHash: () => ({ email: "plain@example.com" }),
    };
    const result = RelationQueries.scopeForCreate(() => ({}), relation);
    expect(result.email).toBeUndefined();
  });

  it("reads IN-array values from a real Relation via whereValuesHash() (integration)", () => {
    const adapter = createTestAdapter();
    class Contact extends Base {
      static {
        this._tableName = "contacts";
        this.attribute("id", "integer");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }
    const rel = Contact.all().where({ email: ["a@x", "b@x"] });
    expect(rel.whereValuesHash()).toEqual({ email: ["a@x", "b@x"] });
    // scope_for_create filters the IN array out (Rails: equality_only=true).
    expect(rel.scopeForCreate()).toEqual({});
  });

  it("unwraps AdditionalValue trailers end-to-end on a real Relation", () => {
    const adapter = createTestAdapter();
    const type = makeType(true);
    const prevType = makeType(true);

    class Contact extends Base {
      static {
        this._tableName = "contacts";
        this.attribute("id", "integer");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }
    (Contact as any)._encryptedAttributes = new Set(["email"]);
    const defs = (Contact as any)._attributeDefinitions as Map<string, { type: unknown }>;
    defs.set("email", { type });

    const avCurrent = new AdditionalValue("plain@example.com", type);
    const avPrev = new AdditionalValue("plain@example.com", prevType);
    const rel = Contact.all().where({ email: [avCurrent, avPrev] });

    const hash = rel.whereValuesHash();
    expect(Array.isArray(hash.email)).toBe(true);
    expect((hash.email as unknown[])[0]).toBeInstanceOf(AdditionalValue);
    expect(((hash.email as AdditionalValue[])[0] as AdditionalValue).value).toBe(avCurrent.value);

    const scope = RelationQueries.scopeForCreate(() => ({}), rel);
    expect(scope.email).toBeInstanceOf(AdditionalValue);
    expect((scope.email as AdditionalValue).value).toBe(avCurrent.value);
  });
});

describe("ActiveRecord::Encryption::ExtendedDeterministicQueries.installSupport", () => {
  // Use isolated classes / prototype clones so patches don't bleed into
  // the other test files running in the same process.
  function isolatedTargets() {
    class FakeRelation {
      _modelClass: any;
      constructor(model: any) {
        this._modelClass = model;
      }
      get model() {
        return this._modelClass;
      }
      where(conditions: Record<string, unknown>) {
        (this as any)._lastWhere = conditions;
        return this;
      }
      async exists(conditions: Record<string, unknown>) {
        (this as any)._lastExists = conditions;
        return true;
      }
      scopeForCreate() {
        return { fromOriginal: true } as Record<string, unknown>;
      }
      whereValuesHash() {
        return (this as any)._wheres ?? {};
      }
    }
    class FakeBase {
      static findBy(conditions: Record<string, unknown>) {
        (this as any)._lastFindBy = conditions;
        return "hit";
      }
    }
    class FakeEat extends EncryptedAttributeType {}
    return { Relation: FakeRelation, Base: FakeBase, EncryptedAttributeType: FakeEat };
  }

  function withFreshInstaller<T>(fn: () => T): T {
    (ExtendedDeterministicQueries as any)._installed = false;
    try {
      return fn();
    } finally {
      (ExtendedDeterministicQueries as any)._installed = false;
    }
  }

  it("patches Relation.prototype.where to run processArguments", () => {
    withFreshInstaller(() => {
      const targets = isolatedTargets();
      ExtendedDeterministicQueries.installSupport(targets as any);

      const prev = new Scheme({ deterministic: true, encryptor: new NullEncryptor() });
      const type = new EncryptedAttributeType({
        scheme: new Scheme({
          deterministic: true,
          encryptor: new NullEncryptor(),
          previousSchemes: [prev],
        }),
      });
      const model = {
        _encryptedAttributes: new Set(["email"]),
        _attributeDefinitions: new Map([["email", { type }]]),
      };
      const rel = new (targets.Relation as any)(model);
      rel.where({ email: "a@x" });
      const captured = rel._lastWhere.email as unknown[];
      expect(Array.isArray(captured)).toBe(true);
      // See allCiphertextsFor: our expansion puts AV(current) at [0] (not
      // plaintext like Rails) because our PredicateBuilder bypasses
      // EncryptedAttributeType.serialize for raw scalars in IN arrays.
      expect(captured[0]).toBeInstanceOf(AdditionalValue);
      expect((captured[0] as AdditionalValue).value).toBeDefined();
      expect(captured[1]).toBeInstanceOf(AdditionalValue);
    });
  });

  it("patches Relation.prototype.scopeForCreate to copy the AdditionalValue[0] marker into scope", () => {
    withFreshInstaller(() => {
      const targets = isolatedTargets();
      ExtendedDeterministicQueries.installSupport(targets as any);

      const type = new EncryptedAttributeType({
        scheme: new Scheme({ deterministic: true, encryptor: new NullEncryptor() }),
      });
      const av = new AdditionalValue("plain@x", type);
      const model = {
        _encryptedAttributes: new Set(["email"]),
        _attributeDefinitions: new Map([["email", { type }]]),
      };
      const rel = new (targets.Relation as any)(model);
      rel._wheres = { email: [av] };
      expect(rel.scopeForCreate()).toEqual({ fromOriginal: true, email: av });
    });
  });

  it("patches Base.findBy to run processArguments with checkForAdditionalValues=false", () => {
    withFreshInstaller(() => {
      const targets = isolatedTargets();
      ExtendedDeterministicQueries.installSupport(targets as any);

      const prev = new Scheme({ deterministic: true, encryptor: new NullEncryptor() });
      const type = new EncryptedAttributeType({
        scheme: new Scheme({
          deterministic: true,
          encryptor: new NullEncryptor(),
          previousSchemes: [prev],
        }),
      });
      class Contact extends (targets.Base as any) {
        static _encryptedAttributes = new Set(["email"]);
        static _attributeDefinitions = new Map([["email", { type }]]);
      }
      (Contact as any).findBy({ email: "x" });
      const captured = (Contact as any)._lastFindBy.email as unknown[];
      expect(Array.isArray(captured)).toBe(true);
      expect(captured[0]).toBeInstanceOf(AdditionalValue);
      expect(captured[1]).toBeInstanceOf(AdditionalValue);
    });
  });

  it("patches EncryptedAttributeType.prototype.serialize to passthrough AdditionalValue", () => {
    withFreshInstaller(() => {
      const targets = isolatedTargets();
      ExtendedDeterministicQueries.installSupport(targets as any);

      const type = new (targets.EncryptedAttributeType as typeof EncryptedAttributeType)({
        scheme: new Scheme({ deterministic: true, encryptor: new NullEncryptor() }),
      });
      const av = new AdditionalValue("plain", type);
      expect(type.serialize(av)).toBe(av.value);
      // Non-AdditionalValue still flows through the original serialize path.
      expect(typeof type.serialize("raw")).toBe("string");
    });
  });

  it("is idempotent — second call is a no-op", () => {
    withFreshInstaller(() => {
      const targets = isolatedTargets();
      const originalWhere = targets.Relation.prototype.where;
      ExtendedDeterministicQueries.installSupport(targets as any);
      const firstPatched = targets.Relation.prototype.where;
      ExtendedDeterministicQueries.installSupport(targets as any);
      const secondPatched = targets.Relation.prototype.where;
      expect(firstPatched).not.toBe(originalWhere);
      expect(secondPatched).toBe(firstPatched);
      expect(ExtendedDeterministicQueries.installed).toBe(true);
    });
  });
});

describe("installExtendedQueriesIfConfigured", () => {
  it("is a no-op when Configurable.config.extendQueries is false", async () => {
    const { Configurable } = await import("./configurable.js");
    const { installExtendedQueriesIfConfigured } = await import("./install.js");
    const prev = Configurable.config.extendQueries;
    Configurable.config.extendQueries = false;
    try {
      // Simulate a fresh process.
      (ExtendedDeterministicQueries as any)._installed = false;
      const installed = installExtendedQueriesIfConfigured();
      expect(installed).toBe(false);
      expect(ExtendedDeterministicQueries.installed).toBe(false);
    } finally {
      Configurable.config.extendQueries = prev;
      (ExtendedDeterministicQueries as any)._installed = false;
    }
  });

  it("installs the patches onto the real Relation/Base/EncryptedAttributeType when extendQueries=true", async () => {
    const { Configurable } = await import("./configurable.js");
    const { installExtendedQueriesIfConfigured } = await import("./install.js");

    const origWhere = Relation.prototype.where;
    const origExists = (Relation.prototype as any).exists;
    const origScopeForCreate = (Relation.prototype as any).scopeForCreate;
    const origFindBy = (Base as any).findBy;
    const origSerialize = EncryptedAttributeType.prototype.serialize;

    const prev = Configurable.config.extendQueries;
    Configurable.config.extendQueries = true;
    (ExtendedDeterministicQueries as any)._installed = false;
    try {
      const installed = installExtendedQueriesIfConfigured();
      expect(installed).toBe(true);
      expect(Relation.prototype.where).not.toBe(origWhere);
      expect((Base as any).findBy).not.toBe(origFindBy);
      expect(EncryptedAttributeType.prototype.serialize).not.toBe(origSerialize);
    } finally {
      // Restore every patched entrypoint — leaving exists/scopeForCreate
      // patched would make sibling tests in the same Vitest process
      // order-dependent.
      Relation.prototype.where = origWhere;
      (Relation.prototype as any).exists = origExists;
      (Relation.prototype as any).scopeForCreate = origScopeForCreate;
      (Base as any).findBy = origFindBy;
      EncryptedAttributeType.prototype.serialize = origSerialize;
      (ExtendedDeterministicQueries as any)._installed = false;
      ExtendedDeterministicUniquenessValidator.resetSupport(UniquenessValidator);
      Configurable.config.extendQueries = prev;
    }
  });
});
