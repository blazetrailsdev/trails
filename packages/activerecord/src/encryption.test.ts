import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { Base } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupFixtures } from "./test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
// Side-effect: registers encryptionHooks so Base.encrypts() is wired up.
import "./encryption.js";
import { EncryptedAttributeType } from "./encryption/encrypted-attribute-type.js";
import { Configurable } from "./encryption/configurable.js";
import { Decryption as DecryptionError } from "./encryption/errors.js";
import type { EncryptorLike } from "./encryption/encryptor.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import {
  EncryptedBook,
  EncryptedBookWithDowncaseName,
} from "./test-helpers/models/book-encrypted.js";

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

setupFixtures();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({ encrypted_books: canonicalSchema.encrypted_books });
});

describe("encrypts()", () => {
  it("encrypts and decrypts attributes transparently", async () => {
    // Inline (not the canonical EncryptedBook) because this suite deliberately
    // omits configureEncryption(); default non-deterministic encryption needs no
    // key config, whereas EncryptedBook's `deterministic: true` requires a
    // configured deterministicKey.
    class Book extends Base {
      static _tableName = "encrypted_books";
      static {
        this.attribute("id", "integer");
        this.attribute("original_name", "string");
        this.attribute("name", "string");
        this.encrypts("name");
      }
    }

    const book = await Book.create({ original_name: "Alice", name: "123-45-6789" });
    // Reading returns plaintext (decrypted) value
    expect(book.name).toBe("123-45-6789");

    // The serialized value (for DB) should be encrypted
    const dbValues = book._attributes.valuesForDatabase();
    expect(dbValues.name).not.toBe("123-45-6789");
  });

  it("persists encrypted value to database and decrypts on load", async () => {
    // Inline (see the note above): default non-deterministic encryption avoids
    // EncryptedBook's deterministicKey requirement in a suite without config.
    class Book extends Base {
      static _tableName = "encrypted_books";
      static {
        this.attribute("id", "integer");
        this.attribute("original_name", "string");
        this.attribute("name", "string");
        this.encrypts("name");
      }
    }

    const created = await Book.create({ original_name: "Alice", name: "my-secret-data" });
    const loaded = await Book.find(created.id);
    expect(loaded.name).toBe("my-secret-data");
  });

  it("supports custom encryptor", async () => {
    const customEncryptor = {
      encrypt: (v: string) => `ENC:${v}`,
      decrypt: (v: string) => v.replace(/^ENC:/, ""),
    };
    class Book extends Base {
      static _tableName = "encrypted_books";
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.encrypts("name", { encryptor: customEncryptor });
      }
    }

    const book = await Book.create({ name: "abc123" });
    expect(book.name).toBe("abc123");
    // Serialized value should use custom encryptor
    const dbValues = book._attributes.valuesForDatabase();
    expect(dbValues.name).toBe("ENC:abc123");
  });

  it("wires scheme options (deterministic, downcase) through to the attribute type", async () => {
    // Canonical model: `encrypts :name, deterministic: true, downcase: true`
    // (vendor/rails/activerecord/test/models/book_encrypted.rb).
    const Book = EncryptedBookWithDowncaseName;

    // Trigger construction so applyPendingEncryptions runs.
    new Book();
    const def = (Book as any)._attributeDefinitions.get("name");
    expect(def.type).toBeInstanceOf(EncryptedAttributeType);
    expect(def.type.deterministic).toBe(true);
    expect(def.type.scheme.downcase).toBe(true);
  });

  it("registers encrypted attributes on the class", async () => {
    // Canonical model: `encrypts :name` registers it in _encryptedAttributes.
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

    class Book extends Base {
      static _tableName = "encrypted_books";
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.encrypts("name", { encryptor: new TestEncryptor({ current: "current_cipher" }) });
      }
    }
    new Book();
    const type = (Book as any)._attributeDefinitions.get("name")?.type as EncryptedAttributeType;
    expect(type.previousTypes).toHaveLength(1);

    // legacy ciphertext falls back to previous scheme
    expect(type.deserialize("legacy_cipher")).toBe("legacy");
  });

  it("deterministic-incompatible global previous schemes are excluded", () => {
    Configurable.config.previous = [
      { encryptor: new TestEncryptor({ det: "det_cipher" }), deterministic: true } as any,
    ];

    class Book extends Base {
      static _tableName = "encrypted_books";
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.encrypts("name", { encryptor: new TestEncryptor({ current: "current_cipher" }) });
      }
    }
    new Book();
    const type = (Book as any)._attributeDefinitions.get("name")?.type as EncryptedAttributeType;
    // non-deterministic attribute: deterministic global scheme is incompatible
    expect(type.previousTypes).toHaveLength(0);
  });
});
