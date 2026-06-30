import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { Base } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";
// Side-effect: registers encryptionHooks so Base.encrypts() is wired up.
import "./encryption.js";
import { EncryptedAttributeType } from "./encryption/encrypted-attribute-type.js";
import { Configurable } from "./encryption/configurable.js";
import { Decryption as DecryptionError } from "./encryption/errors.js";
import type { EncryptorLike } from "./encryption/encryptor.js";

class TestEncryptor implements EncryptorLike {
  constructor(private readonly map: Record<string, string>) {}
  encrypt(clearText: string): string {
    return this.map[clearText] ?? clearText;
  }
  decrypt(encryptedText: string): string {
    for (const [clear, cipher] of Object.entries(this.map)) {
      if (cipher === encryptedText) return clear;
    }
    throw new DecryptionError(`No match for ${encryptedText}`);
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

// -- Phase 2000: Core --

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema(TEST_SCHEMA);
});

describe("encrypts()", () => {
  it("encrypts and decrypts attributes transparently", async () => {
    class EncryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.encrypts("name");
      }
    }

    const book = await EncryptedBook.create({ name: "123-45-6789" });
    // Reading returns plaintext (decrypted) value
    expect(book.name).toBe("123-45-6789");

    // The serialized value (for DB) should be encrypted
    const dbValues = book._attributes.valuesForDatabase();
    expect(dbValues.name).not.toBe("123-45-6789");
  });

  it("persists encrypted value to database and decrypts on load", async () => {
    class EncryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.encrypts("name");
      }
    }

    const created = await EncryptedBook.create({ name: "my-secret-data" });
    const loaded = await EncryptedBook.find(created.id);
    expect(loaded.name).toBe("my-secret-data");
  });

  it("supports custom encryptor", async () => {
    const customEncryptor = {
      encrypt: (v: string) => `ENC:${v}`,
      decrypt: (v: string) => v.replace(/^ENC:/, ""),
    };
    class EncryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.encrypts("name", { encryptor: customEncryptor });
      }
    }

    const book = await EncryptedBook.create({ name: "abc123" });
    expect(book.name).toBe("abc123");
    // Serialized value should use custom encryptor
    const dbValues = book._attributes.valuesForDatabase();
    expect(dbValues.name).toBe("ENC:abc123");
  });

  it("wires scheme options (deterministic, downcase) through to the attribute type", async () => {
    class EncryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.encrypts("name", { deterministic: true, downcase: true });
      }
    }

    // Trigger construction so applyPendingEncryptions runs.
    new EncryptedBook();
    const def = (EncryptedBook as any)._attributeDefinitions.get("name");
    expect(def.type).toBeInstanceOf(EncryptedAttributeType);
    expect(def.type.deterministic).toBe(true);
    expect(def.type.scheme.downcase).toBe(true);
  });

  it("registers encrypted attributes on the class", async () => {
    class EncryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.encrypts("name");
      }
    }

    expect((EncryptedBook as any)._encryptedAttributes.has("name")).toBe(true);
  });
});

describe("Base.encrypts() — global previous schemes via config.previous", () => {
  let savedPreviousSchemes: typeof Configurable.config.previousSchemes;

  beforeEach(() => {
    savedPreviousSchemes = [...Configurable.config.previousSchemes];
    Configurable.config.previousSchemes = [];
  });

  afterEach(() => {
    Configurable.config.previousSchemes = savedPreviousSchemes;
  });

  it("config.previous schemes are applied to Base.encrypts() attribute types", () => {
    Configurable.config.previous = [
      { encryptor: new TestEncryptor({ legacy: "legacy_cipher" }) } as any,
    ];

    class EncryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.encrypts("name", { encryptor: new TestEncryptor({ current: "current_cipher" }) });
      }
    }
    new EncryptedBook();
    const type = (EncryptedBook as any)._attributeDefinitions.get("name")
      ?.type as EncryptedAttributeType;
    expect(type.previousTypes).toHaveLength(1);

    // legacy ciphertext falls back to previous scheme
    expect(type.deserialize("legacy_cipher")).toBe("legacy");
  });

  it("deterministic-incompatible global previous schemes are excluded", () => {
    Configurable.config.previous = [
      { encryptor: new TestEncryptor({ det: "det_cipher" }), deterministic: true } as any,
    ];

    class EncryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.encrypts("name", { encryptor: new TestEncryptor({ current: "current_cipher" }) });
      }
    }
    new EncryptedBook();
    const type = (EncryptedBook as any)._attributeDefinitions.get("name")
      ?.type as EncryptedAttributeType;
    // non-deterministic attribute: deterministic global scheme is incompatible
    expect(type.previousTypes).toHaveLength(0);
  });
});
