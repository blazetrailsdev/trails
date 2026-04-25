import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./index.js";
import { hasSecurePassword } from "./secure-password.js";
import { setTokenForSecret } from "./generates-token-for.js";
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

    const digest = user.password_digest as string;
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

describe("password reset token", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = createTestAdapter();
    setTokenForSecret("test-reset-token-secret");
  });

  afterEach(() => {
    setTokenForSecret(null);
  });

  it("generates a password_reset_token on the instance", async () => {
    // Mirrors Rails secure_password.rb:162-178 — generates_token_for
    // :"password_reset", expires_in: 15.minutes, plus instance accessor.
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
    (user as any).password = "securepassword";
    await user.save();

    const token = (user as any).passwordResetToken;
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("findByPasswordResetToken resolves a valid token", async () => {
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
    (user as any).password = "securepassword";
    await user.save();

    const token = (user as any).passwordResetToken;
    const found = await (User as any).findByPasswordResetToken(token);
    expect(found).not.toBeNull();
    expect(found.id).toBe(user.id);
  });

  it("token is invalidated when password changes", async () => {
    // Rails embeds BCrypt::Password#version so the token becomes stale when
    // the digest changes (secure_password.rb generator block). Our impl
    // embeds a SHA-256 hash of the digest (first 16 hex chars) as the version
    // — it changes whenever the digest changes without leaking digest bytes.
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
    (user as any).password = "originalpassword";
    await user.save();

    const oldToken = (user as any).passwordResetToken;

    // Change the password — digest changes, token version becomes stale.
    (user as any).password = "newpassword";
    await user.save();

    const found = await (User as any).findByPasswordResetToken(oldToken);
    expect(found).toBeNull();
  });

  it("findByPasswordResetToken still resolves after saving without changing password", async () => {
    // A no-op save (no password= setter called) must not rehash the digest with
    // a new salt — doing so would invalidate outstanding reset tokens.
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
    (user as any).password = "securepassword";
    await user.save();

    const token = (user as any).passwordResetToken;

    // Save again without touching password — digest must be unchanged.
    await user.save();

    const found = await (User as any).findByPasswordResetToken(token);
    expect(found).not.toBeNull();
    expect(found.id).toBe(user.id);
  });

  it("resetToken: false suppresses token generation", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("password_digest", "string");
        this.adapter = adapter;
      }
    }
    hasSecurePassword(User, { resetToken: false });
    const user = new User({});
    expect((user as any).passwordResetToken).toBeUndefined();
  });
});

describe("SecurePasswordTest", () => {
  it.skip("authenticate_by authenticates when password is correct", () => {});
  it.skip("authenticate_by does not authenticate when password is incorrect", () => {});
  it.skip("authenticate_by takes the same amount of time regardless of whether record is found", () => {});
  it.skip("authenticate_by short circuits when password is nil", () => {});
  it.skip("authenticate_by short circuits when password is an empty string", () => {});
  it.skip("authenticate_by finds record using multiple attributes", () => {});
  it.skip("authenticate_by authenticates using multiple passwords", () => {});
  it.skip("authenticate_by requires at least one password", () => {});
  it.skip("authenticate_by requires at least one attribute", () => {});
  it.skip("authenticate_by accepts any object that implements to_h", () => {});
});
