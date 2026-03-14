import { describe, it, expect, beforeEach } from "vitest";
import { Base, hasSecurePassword } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

// -- Helpers --

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// -- Phase 2000: Core --

describe("secure_password", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("hashes password on save and authenticates", async () => {
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.attribute("password_digest", "string");
    User.adapter = adapter;
    hasSecurePassword(User, { validations: false });

    const user = new User({ name: "Alice" });
    (user as any).password = "secret123";
    await user.save();

    const digest = user.readAttribute("password_digest") as string;
    expect(digest).toBeTruthy();
    expect(digest).toContain(":");

    // authenticate returns record on success
    const result = (user as any).authenticate("secret123");
    expect(result).toBe(user);

    // authenticate returns false on failure
    const badResult = (user as any).authenticate("wrong");
    expect(badResult).toBe(false);
  });

  it("validates password presence on create", async () => {
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("password_digest", "string");
    User.adapter = adapter;
    hasSecurePassword(User);

    const user = new User({});
    const saved = await user.save();
    expect(saved).toBe(false);
    expect(user.errors.fullMessages).toContain("Password can't be blank");
  });

  it("validates password confirmation mismatch", async () => {
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("password_digest", "string");
    User.adapter = adapter;
    hasSecurePassword(User);

    const user = new User({});
    (user as any).password = "secret123";
    (user as any).passwordConfirmation = "different";
    const saved = await user.save();
    expect(saved).toBe(false);
    expect(user.errors.fullMessages.some((m: string) => m.includes("doesn't match Password"))).toBe(
      true,
    );
  });
});

describe("SecurePassword (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  // Rails: test "authenticate with correct password"
  it("authenticate returns the user on success", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("password_digest", "string");
        this.adapter = adapter;
      }
    }
    hasSecurePassword(User, { validations: false });

    const user = new User({ name: "Alice" });
    (user as any).password = "mUc3m00RsqyRe";
    await user.save();

    expect((user as any).authenticate("mUc3m00RsqyRe")).toBe(user);
  });

  // Rails: test "authenticate with wrong password"
  it("authenticate returns false on failure", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("password_digest", "string");
        this.adapter = adapter;
      }
    }
    hasSecurePassword(User, { validations: false });

    const user = new User({});
    (user as any).password = "mUc3m00RsqyRe";
    await user.save();

    expect((user as any).authenticate("wrong")).toBe(false);
  });

  // Rails: test "validates password presence on create"
  it("requires password on create when validations enabled", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("password_digest", "string");
        this.adapter = adapter;
      }
    }
    hasSecurePassword(User);

    const user = new User({});
    expect(await user.save()).toBe(false);
    expect(user.errors.fullMessages).toContain("Password can't be blank");
  });

  // Rails: test "password confirmation"
  it("validates password confirmation", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("password_digest", "string");
        this.adapter = adapter;
      }
    }
    hasSecurePassword(User);

    const user = new User({});
    (user as any).password = "secret";
    (user as any).passwordConfirmation = "nomatch";
    expect(await user.save()).toBe(false);
    expect(user.errors.fullMessages.some((m: string) => m.includes("doesn't match"))).toBe(true);
  });
});
