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
    // Reading returns decrypted value
    expect(user.readAttribute("ssn")).toBe("123-45-6789");

    // The raw stored value should be encrypted (base64)
    const raw = user._attributes.get("ssn");
    expect(raw).not.toBe("123-45-6789");
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
    expect(loaded.readAttribute("secret")).toBe("my-secret-data");
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
    expect(user.readAttribute("token")).toBe("abc123");
    expect(user._attributes.get("token")).toBe("ENC:abc123");
  });
});
