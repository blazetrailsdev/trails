import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { performance } from "node:perf_hooks";
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
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  // Builds a User class with the union of attributes used across these tests.
  // Per-test attribute differences in Rails are immaterial for these tests
  // (sqlite ignores unread columns); a single shared class halves the LOC
  // here without changing behavior.
  const makeUser = () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("token", "string");
        this.attribute("email", "string");
        this.attribute("password_digest", "string");
        this.attribute("auth_token_digest", "string");
        this.attribute("recovery_password_digest", "string");
        this.adapter = adapter;
      }
    }
    hasSecurePassword(User, { validations: false });
    return User as typeof User & {
      authenticateBy(attrs: unknown): Promise<InstanceType<typeof User> | null>;
    };
  };

  const PASSWORD = "mUc3m00RsqyRe";

  const createUser = async (extra: Record<string, unknown> = {}) => {
    const User = makeUser();
    const user = new User({ token: "abc123", ...extra });
    (user as any).password = PASSWORD;
    await user.save();
    return { User, user };
  };

  // Rails: test "authenticate_by authenticates when password is correct"
  it("authenticate_by authenticates when password is correct", async () => {
    const { User, user } = await createUser();
    const found = await User.authenticateBy({ token: user.token, password: PASSWORD });
    expect(found).not.toBeNull();
    expect(found?.id).toBe(user.id);
    expect(found?.token).toBe(user.token);
  });

  // Rails: test "authenticate_by does not authenticate when password is incorrect"
  it("authenticate_by does not authenticate when password is incorrect", async () => {
    const { User, user } = await createUser();
    const found = await User.authenticateBy({ token: user.token, password: "wrong" });
    expect(found).toBeNull();
  });

  // Rails: test "authenticate_by short circuits when password is nil"
  it("authenticate_by short circuits when password is nil", async () => {
    const User = makeUser();
    expect(await User.authenticateBy({ token: "abc123", password: null })).toBeNull();
  });

  // Rails: test "authenticate_by short circuits when password is an empty string"
  it("authenticate_by short circuits when password is an empty string", async () => {
    const User = makeUser();
    expect(await User.authenticateBy({ token: "abc123", password: "" })).toBeNull();
  });

  // Rails: test "authenticate_by finds record using multiple attributes"
  it("authenticate_by finds record using multiple attributes", async () => {
    const { User, user } = await createUser({ email: "test@example.com" });
    const found = await User.authenticateBy({
      token: user.token,
      email: user.email,
      password: PASSWORD,
    });
    expect(found?.id).toBe(user.id);

    const notFound = await User.authenticateBy({
      token: user.token,
      email: "wrong@example.com",
      password: PASSWORD,
    });
    expect(notFound).toBeNull();
  });

  // Rails: test "authenticate_by authenticates using multiple passwords"
  it("authenticate_by authenticates using multiple passwords", async () => {
    const User = makeUser();
    hasSecurePassword(User, "recovery_password", { validations: false });
    const RECOVERY = "recovery-secret";
    const user = new User({ token: "abc123" });
    (user as any).password = PASSWORD;
    (user as any).recovery_password = RECOVERY;
    await user.save();

    const ok = await User.authenticateBy({
      token: user.token,
      password: PASSWORD,
      recovery_password: RECOVERY,
    });
    expect(ok?.id).toBe(user.id);

    expect(
      await User.authenticateBy({
        token: user.token,
        password: "wrong",
        recovery_password: RECOVERY,
      }),
    ).toBeNull();
    expect(
      await User.authenticateBy({
        token: user.token,
        password: PASSWORD,
        recovery_password: "wrong",
      }),
    ).toBeNull();
  });

  // Rails: test "authenticate_by takes the same amount of time regardless
  // of whether record is found" — both the not-found path and the
  // found-but-wrong-password path must run the password hash so a timing
  // attacker can't distinguish them. Compare elapsed times relative to
  // each other rather than against an absolute threshold (which is flaky
  // across hardware): the not-found run should not be substantially
  // shorter than the wrong-password run.
  // Mirrors Rails' `new(passwords)` BCrypt trigger at secure_password.rb:55.
  it("authenticate_by takes the same amount of time regardless of whether record is found", async () => {
    const { User, user } = await createUser();

    const t0 = performance.now();
    expect(await User.authenticateBy({ token: user.token, password: "wrong" })).toBeNull();
    const wrongPasswordMs = performance.now() - t0;

    const t1 = performance.now();
    expect(await User.authenticateBy({ token: "no-such-token", password: PASSWORD })).toBeNull();
    const notFoundMs = performance.now() - t1;

    // The not-found path should be at least ~30% as long as the
    // wrong-password path (both hash; a no-op short-circuit would be
    // orders of magnitude faster).
    expect(notFoundMs).toBeGreaterThan(wrongPasswordMs * 0.3);
  });

  // Rails: test "authenticate_by requires at least one password"
  it("authenticate_by requires at least one password", async () => {
    const User = makeUser();
    await expect(User.authenticateBy({ token: "abc123" })).rejects.toThrow(
      "One or more password arguments are required",
    );
  });

  // Rails: test "authenticate_by requires at least one attribute"
  it("authenticate_by requires at least one attribute", async () => {
    const User = makeUser();
    await expect(User.authenticateBy({ password: "abc123" })).rejects.toThrow(
      "One or more finder arguments are required",
    );
  });

  it("authenticate_by treats undefined identifier values as missing (not IS NULL)", async () => {
    const User = makeUser();
    // `undefined` would otherwise flow through PredicateBuilder as `IS NULL`
    // and could authenticate a record whose token is actually NULL.
    await expect(User.authenticateBy({ token: undefined, password: PASSWORD })).rejects.toThrow(
      "One or more finder arguments are required",
    );
  });

  // Rails: test "authenticate_by accepts any object that implements to_h"
  it("authenticate_by accepts any object that implements to_h", async () => {
    const { User, user } = await createUser();
    const found = await User.authenticateBy({
      toH: () => ({ token: user.token, password: PASSWORD }),
    });
    expect(found?.id).toBe(user.id);

    const notFound = await User.authenticateBy({
      toH: () => ({ token: "wrong", password: PASSWORD }),
    });
    expect(notFound).toBeNull();
  });
});
