import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Scheme } from "./scheme.js";
import { Configurable } from "./configurable.js";
import { Decryption } from "./errors.js";
import type { EncryptorLike } from "./encryptor.js";
import { encrypts } from "./encryptable-record.js";
import type { SchemeOptions } from "./scheme.js";
import { installExtendedQueriesIfConfigured } from "./install.js";
import { ExtendedDeterministicQueries } from "./extended-deterministic-queries.js";
import { ExtendedDeterministicUniquenessValidator } from "./extended-deterministic-uniqueness-validator.js";
import { Relation } from "../relation.js";
import { Base } from "../index.js";
import { UniquenessValidator } from "../validations.js";
import {
  freshAdapter,
  configureEncryption,
  AUTHOR_NAME_LIMIT,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  makeEncryptedAuthor,
  makeKeyProvider,
  withoutEncryption,
} from "./test-helpers.js";
import { fixtures } from "../test-fixtures.js";

fixtures([]);

class TestEncryptor implements EncryptorLike {
  constructor(private readonly map: Record<string, string>) {}

  encrypt(clearText: string): string {
    return this.map[clearText] ?? clearText;
  }

  decrypt(encryptedText: string): string {
    for (const [clear, cipher] of Object.entries(this.map)) {
      if (cipher === encryptedText) return clear;
    }
    throw new Decryption(`Couldn't find a match for ${encryptedText}`);
  }

  isEncrypted(text: string): boolean {
    try {
      this.decrypt(text);
      return true;
    } catch {
      return false;
    }
  }

  isBinary(): boolean {
    return false;
  }
}

function makeType(
  encryptor: EncryptorLike,
  previousSchemes: Scheme[] = [],
): EncryptedAttributeType {
  return new EncryptedAttributeType({ scheme: new Scheme({ encryptor, previousSchemes }) });
}

describe("ActiveRecord::Encryption::EncryptionSchemesTest", () => {
  let savedSupportUnencryptedData: boolean;
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;

  beforeAll(async () => {
    await freshAdapter();
  });

  beforeEach(() => {
    savedSupportUnencryptedData = Configurable.config.supportUnencryptedData;
    configSnapshot = snapshotEncryptionConfig();
    configureEncryption();
  });

  afterEach(() => {
    Configurable.config.supportUnencryptedData = savedSupportUnencryptedData;
    restoreEncryptionConfig(configSnapshot);
  });

  it("can decrypt encrypted_value encrypted with a different encryption scheme", async () => {
    Configurable.config.supportUnencryptedData = false;
    const prevKeyProvider = makeKeyProvider("prev-key-for-schemes-test-32bytes!!");
    Configurable.config.previous = [{ keyProvider: prevKeyProvider }] as SchemeOptions[];
    const Author = makeEncryptedAuthor(await freshAdapter());
    new Author();
    const author = await Author.create({ name: "david" });
    const currentType = Author.typeForAttribute("name") as EncryptedAttributeType;
    const prevType = currentType.previousTypes[0];
    expect(prevType).toBeDefined();
    const oldCiphertext = prevType.serialize("dhh") as string;
    await withoutEncryption(async () => {
      await author.updateColumns({ name: oldCiphertext });
    });
    const reloaded = await Author.find(author.id);
    expect(reloaded.name).toBe("dhh");
    expect(reloaded.encryptedAttribute("name")).toBe(true);
  });

  it("when defining previous encryption schemes, you still get Decryption errors when using invalid clear values", async () => {
    Configurable.config.supportUnencryptedData = false;
    Configurable.config.previous = [
      { keyProvider: makeKeyProvider("prev-key-for-decryption-error-32b!") },
    ] as SchemeOptions[];
    const Author = makeEncryptedAuthor(await freshAdapter());
    new Author();
    const author = await withoutEncryption(() => Author.create({ name: "unencrypted author" }));
    const reloaded = await Author.find(author.id);
    expect(() => reloaded.name).toThrow(Decryption);
  });

  it("use a custom encryptor", async () => {
    const adp = await freshAdapter();
    const EncryptedAuthor1 = class extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adp;
        this.encrypts("name", { encryptor: new TestEncryptor({ "1": "2" }) });
      }
    } as any;
    new EncryptedAuthor1();
    const author = await EncryptedAuthor1.create({ name: "1" });
    expect(author.name).toBe("1");
    const reloaded = await EncryptedAuthor1.find(author.id);
    expect(reloaded.name).toBe("1");
    expect(reloaded.encryptedAttribute("name")).toBe(true);
  });

  it("support previous contexts", async () => {
    Configurable.config.supportUnencryptedData = true;
    const adp = await freshAdapter();
    const EncryptedAuthor2 = class extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adp;
        this.encrypts("name", {
          encryptor: new TestEncryptor({ "2": "3" }),
          previousSchemes: [new Scheme({ encryptor: new TestEncryptor({ "1": "2" }) })],
        });
      }
    } as any;
    new EncryptedAuthor2();
    const author = await EncryptedAuthor2.create({ name: "2" });
    expect(author.name).toBe("2");
    const found = await EncryptedAuthor2.findBy({ name: "2" });
    expect(found).not.toBeNull();
    const authorReloaded = await EncryptedAuthor2.find(author.id);
    expect(authorReloaded.encryptedAttribute("name")).toBe(true);
    const RawModel = class extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adp;
      }
    } as any;
    new RawModel();
    const rawRecord = await RawModel.find(author.id);
    await rawRecord.update({ name: "1" });
    const reloaded = await EncryptedAuthor2.find(author.id);
    expect(reloaded.name).toBe("1");
    const foundByPlaintext = await EncryptedAuthor2.findBy({ name: "1" });
    expect(foundByPlaintext).not.toBeNull();
    expect(reloaded.encryptedAttribute("name")).toBe(false);
  });

  it("use global previous schemes to decrypt data encrypted with previous schemes", () => {
    Configurable.config.supportUnencryptedData = false;

    const prev1Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy1: "legacy_cipher_1" }),
    });
    const prev2Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy2: "legacy_cipher_2" }),
    });
    const type = makeType(new TestEncryptor({ current: "current_cipher" }), [
      prev1Scheme,
      prev2Scheme,
    ]);

    expect(type.previousTypes).toHaveLength(2);
    const [previousType1, previousType2] = type.previousTypes;

    const ciphertext1 = previousType1.serialize("legacy1") as string;
    expect(type.deserialize(ciphertext1)).toBe("legacy1");

    const ciphertext2 = previousType2.serialize("legacy2") as string;
    expect(type.deserialize(ciphertext2)).toBe("legacy2");
  });

  it("use global previous schemes to decrypt data encrypted with previous schemes with unencrypted data", () => {
    Configurable.config.supportUnencryptedData = true;

    const prev1Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy1: "legacy_cipher_1" }),
    });
    const prev2Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy2: "legacy_cipher_2" }),
    });
    const type = makeType(new TestEncryptor({ current: "current_cipher" }), [
      prev1Scheme,
      prev2Scheme,
    ]);

    expect(type.previousTypes).toHaveLength(3);
    const [previousType1, previousType2] = type.previousTypes;

    const ciphertext1 = previousType1.serialize("legacy1") as string;
    expect(type.deserialize(ciphertext1)).toBe("legacy1");

    const ciphertext2 = previousType2.serialize("legacy2") as string;
    expect(type.deserialize(ciphertext2)).toBe("legacy2");
  });

  it("returns ciphertext all the previous schemes fail to decrypt and support for unencrypted data is on", () => {
    Configurable.config.supportUnencryptedData = true;

    const prev1Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy1: "legacy_cipher_1" }),
    });
    const prev2Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy2: "legacy_cipher_2" }),
    });
    const type = makeType(new TestEncryptor({ current: "current_cipher" }), [
      prev1Scheme,
      prev2Scheme,
    ]);

    expect(type.deserialize("some ciphertext")).toBe("some ciphertext");
  });

  it("raise decryption error when all the previous schemes fail to decrypt", () => {
    Configurable.config.supportUnencryptedData = false;

    const prev1Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy1: "legacy_cipher_1" }),
    });
    const prev2Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy2: "legacy_cipher_2" }),
    });
    const type = makeType(new TestEncryptor({ current: "current_cipher" }), [
      prev1Scheme,
      prev2Scheme,
    ]);

    expect(() => type.deserialize("some invalid ciphertext")).toThrow(Decryption);
  });

  it("deterministic encryption is fixed by default: it will always use the oldest scheme to encrypt data", () => {
    Configurable.config.supportUnencryptedData = false;
    const oldEncryptor = new TestEncryptor({ alice: "alice_old_cipher" });
    const currentEncryptor = new TestEncryptor({ alice: "alice_new_cipher" });
    const oldScheme = new Scheme({ encryptor: oldEncryptor, deterministic: true });
    const type = new EncryptedAttributeType({
      scheme: new Scheme({
        encryptor: currentEncryptor,
        deterministic: true,
        previousSchemes: [oldScheme],
      }),
    });
    const cipher = type.serialize("alice") as string;
    expect(cipher).toBe("alice_old_cipher");
    expect(type.deserialize(cipher)).toBe("alice");
  });

  it("don't use global previous schemes with a different deterministic nature", async () => {
    Configurable.config.supportUnencryptedData = false;
    Configurable.config.deterministicKey = "12345";
    Configurable.config.previousSchemes = [];
    Configurable.config.previous = [
      { downcase: true, deterministic: false } as SchemeOptions,
      { downcase: false, deterministic: true } as SchemeOptions,
    ];

    const adp = await freshAdapter();
    const encryptedAuthorClass = class extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string", { limit: AUTHOR_NAME_LIMIT });
        this.adapter = adp;
        this.encrypts("name", { deterministic: true, downcase: false });
      }
    } as any;
    new encryptedAuthorClass();

    const author = await encryptedAuthorClass.create({ name: "STEPHEN KING" });
    expect(author.name).toBe("STEPHEN KING");
  });

  it("deterministic encryption will use the newest encryption scheme to encrypt data when setting it to { fixed: false }", () => {
    Configurable.config.supportUnencryptedData = false;
    const oldEncryptor = new TestEncryptor({ alice: "alice_old_cipher" });
    const currentEncryptor = new TestEncryptor({ alice: "alice_new_cipher" });
    const oldScheme = new Scheme({ encryptor: oldEncryptor, deterministic: true });
    const type = new EncryptedAttributeType({
      scheme: new Scheme({
        encryptor: currentEncryptor,
        deterministic: { fixed: false },
        previousSchemes: [oldScheme],
      }),
    });
    const cipher = type.serialize("alice") as string;
    expect(cipher).toBe("alice_new_cipher");
    expect(type.deserialize(cipher)).toBe("alice");
  });

  it("use global previous schemes when performing queries", async () => {
    Configurable.config.supportUnencryptedData = false;
    const savedExtendQueries = Configurable.config.extendQueries;

    const savedMethods = {
      where: Relation.prototype.where,
      exists: (Relation.prototype as any).exists,
      scopeForCreate: (Relation.prototype as any).scopeForCreate,
      findBy: (Base as any).findBy,
      serialize: EncryptedAttributeType.prototype.serialize,
    };

    Configurable.config.extendQueries = true;
    installExtendedQueriesIfConfigured();
    try {
      const prevEncryptor = new TestEncryptor({ alice: "alice_prev_cipher" });
      const currentEncryptor = new TestEncryptor({ alice: "alice_cur_cipher" });

      Configurable.config.previousSchemes = [];
      Configurable.config.previous = [
        { encryptor: prevEncryptor, deterministic: true } as SchemeOptions,
      ];

      const adp = await freshAdapter();
      const Author = class extends Base {
        static {
          this._tableName = "authors";
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adp;
          this.encrypts("name", {
            encryptor: currentEncryptor,
            deterministic: { fixed: false },
          });
        }
      } as any;
      new Author();

      const Raw = class extends Base {
        static {
          this._tableName = "authors";
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adp;
        }
      } as any;
      new Raw();
      await Raw.create({ name: "alice_prev_cipher" });

      const found = await Author.findBy({ name: "alice" });
      expect(found).not.toBeNull();
      expect(found!.name).toBe("alice");
    } finally {
      Relation.prototype.where = savedMethods.where;
      (Relation.prototype as any).exists = savedMethods.exists;
      (Relation.prototype as any).scopeForCreate = savedMethods.scopeForCreate;
      (Base as any).findBy = savedMethods.findBy;
      EncryptedAttributeType.prototype.serialize = savedMethods.serialize;
      (ExtendedDeterministicQueries as any)._installed = false;
      ExtendedDeterministicUniquenessValidator.resetSupport(UniquenessValidator);
      Configurable.config.extendQueries = savedExtendQueries;
    }
  });

  it("don't use global previous schemes with a different deterministic nature when performing queries", async () => {
    Configurable.config.supportUnencryptedData = false;
    Configurable.config.deterministicKey = "12345";
    const savedExtendQueries = Configurable.config.extendQueries;

    const savedMethods = {
      where: Relation.prototype.where,
      exists: (Relation.prototype as any).exists,
      scopeForCreate: (Relation.prototype as any).scopeForCreate,
      findBy: (Base as any).findBy,
      serialize: EncryptedAttributeType.prototype.serialize,
    };

    Configurable.config.extendQueries = true;
    installExtendedQueriesIfConfigured();
    try {
      Configurable.config.previousSchemes = [];
      Configurable.config.previous = [
        { downcase: true, deterministic: false } as SchemeOptions,
        { downcase: false, deterministic: true } as SchemeOptions,
      ];

      const adp = await freshAdapter();
      const encryptedAuthorClass = class extends Base {
        static {
          this._tableName = "authors";
          this.attribute("id", "integer");
          this.attribute("name", "string", { limit: AUTHOR_NAME_LIMIT });
          this.adapter = adp;
          this.encrypts("name", { deterministic: true, downcase: false });
        }
      } as any;
      new encryptedAuthorClass();
      const author = await encryptedAuthorClass.create({ name: "STEPHEN KING" });
      const found = await encryptedAuthorClass.findBy({ name: "STEPHEN KING" });
      expect(found).not.toBeNull();
      expect(String(found!.id)).toBe(String(author.id));
      expect(await encryptedAuthorClass.findBy({ name: "stephen king" })).toBeNull();
    } finally {
      Relation.prototype.where = savedMethods.where;
      (Relation.prototype as any).exists = savedMethods.exists;
      (Relation.prototype as any).scopeForCreate = savedMethods.scopeForCreate;
      (Base as any).findBy = savedMethods.findBy;
      EncryptedAttributeType.prototype.serialize = savedMethods.serialize;
      (ExtendedDeterministicQueries as any)._installed = false;
      ExtendedDeterministicUniquenessValidator.resetSupport(UniquenessValidator);
      Configurable.config.extendQueries = savedExtendQueries;
    }
  });
});

describe("global previous schemes wiring — config.previous → EncryptableRecord.encrypts", () => {
  let savedSupportUnencryptedData: boolean;
  let savedPreviousSchemes: typeof Configurable.config.previousSchemes;

  beforeEach(() => {
    savedSupportUnencryptedData = Configurable.config.supportUnencryptedData;
    savedPreviousSchemes = [...Configurable.config.previousSchemes];
    Configurable.config.previousSchemes = [];
  });

  afterEach(() => {
    Configurable.config.supportUnencryptedData = savedSupportUnencryptedData;
    Configurable.config.previousSchemes = savedPreviousSchemes;
  });

  it("config.previous schemes are merged into the attribute type's previousTypes", async () => {
    Configurable.config.supportUnencryptedData = false;
    Configurable.config.previous = [
      { encryptor: new TestEncryptor({ legacy1: "legacy_cipher_1" }) } as SchemeOptions,
      { encryptor: new TestEncryptor({ legacy2: "legacy_cipher_2" }) } as SchemeOptions,
    ];

    const modelClass = class extends Base {
      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    } as any;
    modelClass.adapter = await freshAdapter();
    encrypts.call(modelClass, "name", {
      encryptor: new TestEncryptor({ current: "current_cipher" }),
    });

    const type = modelClass.typeForAttribute("name") as unknown as EncryptedAttributeType;
    expect(type.previousTypes).toHaveLength(2);

    const ciphertext1 = type.previousTypes[0].serialize("legacy1") as string;
    expect(type.deserialize(ciphertext1)).toBe("legacy1");

    const ciphertext2 = type.previousTypes[1].serialize("legacy2") as string;
    expect(type.deserialize(ciphertext2)).toBe("legacy2");
  });

  it("only compatible global previous schemes are applied (matching deterministic nature)", async () => {
    Configurable.config.supportUnencryptedData = false;
    Configurable.config.previous = [
      {
        encryptor: new TestEncryptor({ legacy_det: "cipher_det" }),
        deterministic: true,
      } as SchemeOptions,
      { encryptor: new TestEncryptor({ legacy_non: "cipher_non" }) } as SchemeOptions,
    ];

    const modelClass = class extends Base {
      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    } as any;
    modelClass.adapter = await freshAdapter();
    encrypts.call(modelClass, "name", {
      encryptor: new TestEncryptor({ current: "current_cipher" }),
    });

    const type = modelClass.typeForAttribute("name") as unknown as EncryptedAttributeType;
    expect(type.previousTypes).toHaveLength(1);
    expect(type.deserialize("cipher_non")).toBe("legacy_non");
  });
});
