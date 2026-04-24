import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
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

// -- Helpers --

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// -- Phase 2000: Core --

describe("encrypts()", () => {
  it("encrypts and decrypts attributes transparently", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("ssn", "string");
        this.adapter = adapter;
        this.encrypts("ssn");
      }
    }

    const user = await User.create({ name: "Alice", ssn: "123-45-6789" });
    // Reading returns plaintext (decrypted) value
    expect(user.ssn).toBe("123-45-6789");

    // The serialized value (for DB) should be encrypted
    const dbValues = user._attributes.valuesForDatabase();
    expect(dbValues.ssn).not.toBe("123-45-6789");
  });

  it("persists encrypted value to database and decrypts on load", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("secret", "string");
        this.adapter = adapter;
        this.encrypts("secret");
      }
    }

    await User.create({ name: "Alice", secret: "my-secret-data" });
    const loaded = await User.find(1);
    expect(loaded.secret).toBe("my-secret-data");
  });

  it("supports custom encryptor", async () => {
    const adapter = freshAdapter();
    const customEncryptor = {
      encrypt: (v: string) => `ENC:${v}`,
      decrypt: (v: string) => v.replace(/^ENC:/, ""),
    };
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("token", "string");
        this.adapter = adapter;
        this.encrypts("token", { encryptor: customEncryptor });
      }
    }

    const user = await User.create({ token: "abc123" });
    expect(user.token).toBe("abc123");
    // Serialized value should use custom encryptor
    const dbValues = user._attributes.valuesForDatabase();
    expect(dbValues.token).toBe("ENC:abc123");
  });

  it("wires scheme options (deterministic, downcase) through to the attribute type", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("email", "string");
        this.adapter = adapter;
        this.encrypts("email", { deterministic: true, downcase: true });
      }
    }

    // Trigger construction so applyPendingEncryptions runs.
    new User();
    const def = (User as any)._attributeDefinitions.get("email");
    expect(def.type).toBeInstanceOf(EncryptedAttributeType);
    expect(def.type.deterministic).toBe(true);
    expect(def.type.scheme.downcase).toBe(true);
  });

  it("registers encrypted attributes on the class", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("ssn", "string");
        this.adapter = adapter;
        this.encrypts("ssn");
      }
    }

    expect((User as any)._encryptedAttributes.has("ssn")).toBe(true);
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

    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("email", "string");
        this.adapter = adapter;
        this.encrypts("email", { encryptor: new TestEncryptor({ current: "current_cipher" }) });
      }
    }
    new User();
    const type = (User as any)._attributeDefinitions.get("email")?.type as EncryptedAttributeType;
    expect(type.previousTypes).toHaveLength(1);

    // legacy ciphertext falls back to previous scheme
    expect(type.deserialize("legacy_cipher")).toBe("legacy");
  });

  it("deterministic-incompatible global previous schemes are excluded", () => {
    Configurable.config.previous = [
      { encryptor: new TestEncryptor({ det: "det_cipher" }), deterministic: true } as any,
    ];

    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("email", "string");
        this.adapter = adapter;
        this.encrypts("email", { encryptor: new TestEncryptor({ current: "current_cipher" }) });
      }
    }
    new User();
    const type = (User as any)._attributeDefinitions.get("email")?.type as EncryptedAttributeType;
    // non-deterministic attribute: deterministic global scheme is incompatible
    expect(type.previousTypes).toHaveLength(0);
  });
});
