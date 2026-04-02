import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

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
});
