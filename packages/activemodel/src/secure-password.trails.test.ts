import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Model } from "./index.js";
import { hasSecurePassword, SecurePassword } from "./secure-password.js";

let savedMinCost: boolean;

beforeEach(() => {
  savedMinCost = SecurePassword.minCost;
  SecurePassword.minCost = true;
});

afterEach(() => {
  SecurePassword.minCost = savedMinCost;
});

describe("SecurePasswordTrailsTest", () => {
  it("password= dispatches through the public password_digest writer", () => {
    const seen: unknown[] = [];

    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("password_digest", "string");
      }
    }
    hasSecurePassword(User, "password", {});

    class OverridingUser extends User {}
    Object.defineProperty(OverridingUser.prototype, "password_digest", {
      get(this: Model) {
        return this._readAttribute("password_digest");
      },
      set(this: Model, value: unknown) {
        seen.push(value);
        this._writeAttribute("password_digest", value);
      },
      configurable: true,
    });

    const u = new OverridingUser({ name: "test" });
    (u as any).password = "secret";

    expect(seen.length).toBe(1);
    expect(String(seen[0])).toMatch(/^\$2[aby]\$/);
  });

  it("password_confirmation is not an attribute", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("password_digest", "string");
      }
    }
    hasSecurePassword(User, "password", {});

    expect(User._defaultAttributes().isKey("passwordConfirmation")).toBe(false);

    const u = new User({ name: "test" });
    (u as any).passwordConfirmation = "secret";
    expect((u as any).passwordConfirmation).toBe("secret");
    expect(Object.keys(u.attributes)).not.toContain("passwordConfirmation");
  });
});
