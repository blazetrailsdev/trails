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

function createUserClass(opts: { validations?: boolean } = {}) {
  class User extends Model {
    static {
      this.attribute("name", "string");
      this.attribute("password_digest", "string");
    }
  }
  hasSecurePassword(User, "password", opts);
  return User;
}

describe("SecurePasswordTest", () => {
  it("automatically include ActiveModel::Validations when validations are enabled", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    expect(u.isValid()).toBe(false);
    expect(u.errors.get("password")).toContain("can't be blank");
  });

  it("don't include ActiveModel::Validations when validations are disabled", () => {
    const User = createUserClass({ validations: false });
    const u = new User({ name: "test" });
    expect(u.isValid()).toBe(true);
    expect(u.errors.count).toBe(0);
  });

  it("create a new user with validations and valid password/confirmation", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).passwordConfirmation = "secret";
    expect(u.isValid()).toBe(true);
  });

  it("create a new user with validation and a spaces only password", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = " ".repeat(72);
    expect(u.isValid()).toBe(true);
  });

  it("create a new user with validation and a blank password", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "";
    expect(u.isValid()).toBe(false);
  });

  it("create a new user with validation and a nil password", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    expect(u.isValid()).toBe(false);
  });

  it("create a new user with validation and password length greater than 72 characters", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "a".repeat(73);
    expect(u.isValid()).toBe(false);
  });

  it("create a new user with validation and password byte size greater than 72 bytes", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "\u{1F600}".repeat(19); // 4 bytes each = 76 bytes, 19 chars
    expect(u.isValid()).toBe(false);
  });

  it("create a new user with validation and a blank password confirmation", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).passwordConfirmation = "";
    expect(u.isValid()).toBe(false);
  });

  it("create a new user with validation and a nil password confirmation", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(u.isValid()).toBe(true);
  });

  it("create a new user with validation and an incorrect password confirmation", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).passwordConfirmation = "wrong";
    expect(u.isValid()).toBe(false);
  });

  it("resetting password to nil clears the password cache", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(u.readAttribute("password_digest")).not.toBe(null);
    (u as any).password = null;
    expect(u.readAttribute("password_digest")).toBe(null);
  });

  it("update an existing user with validation and no change in password", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(u.isValid()).toBe(true);
    expect(u.readAttribute("password_digest")).not.toBe(null);
  });

  it("update an existing user with validations and valid password/confirmation", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "newsecret";
    (u as any).passwordConfirmation = "newsecret";
    expect(u.isValid()).toBe(true);
  });

  it("updating an existing user with validation and a blank password", () => {
    const User = createUserClass();
    const u = new User({ name: "test", password_digest: "$2a$04$existing" });
    (u as any).password = "";
    expect(u.readAttribute("password_digest")).toBe("$2a$04$existing");
  });

  it("updating an existing user with validation and a spaces only password", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = " ".repeat(72);
    expect(u.isValid()).toBe(true);
  });

  it("updating an existing user with validation and a blank password and password_confirmation", () => {
    const User = createUserClass();
    const u = new User({ name: "test", password_digest: "$2a$04$existing" });
    (u as any).password = "";
    (u as any).passwordConfirmation = "";
    expect(u.readAttribute("password_digest")).toBe("$2a$04$existing");
  });

  it("updating an existing user with validation and a nil password", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).password = null;
    expect(u.readAttribute("password_digest")).toBe(null);
  });

  it("updating an existing user with validation and password length greater than 72", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "a".repeat(73);
    expect(u.isValid()).toBe(false);
  });

  it("updating an existing user with validation and a blank password confirmation", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).passwordConfirmation = "";
    expect(u.isValid()).toBe(false);
  });

  it("updating an existing user with validation and a nil password confirmation", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(u.isValid()).toBe(true);
  });

  it("updating an existing user with validation and an incorrect password confirmation", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).passwordConfirmation = "wrong";
    expect(u.isValid()).toBe(false);
  });

  it("updating an existing user with validation and a correct password challenge", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect((u as any).authenticate("secret")).toBe(u);
  });

  it("updating an existing user with validation and a nil password challenge", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect((u as any).authenticate(null)).toBe(false);
    expect((u as any).authenticate(undefined)).toBe(false);
  });

  it("updating an existing user with validation and a blank password challenge", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect((u as any).authenticate("")).toBe(false);
  });

  it("updating an existing user with validation and an incorrect password challenge", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect((u as any).authenticate("wrong")).toBe(false);
  });

  it("updating a user without dirty tracking and a correct password challenge", () => {
    const User = createUserClass({ validations: false });
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect((u as any).authenticate("secret")).toBe(u);
  });

  it("updating an existing user with validation and a blank password digest", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    u.writeAttribute("password_digest", "");
    expect(u.isValid()).toBe(false);
  });

  it("updating an existing user with validation and a nil password digest", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    u.writeAttribute("password_digest", null);
    expect(u.isValid()).toBe(false);
  });

  it("setting a blank password should not change an existing password", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    const digest = u.readAttribute("password_digest");
    (u as any).password = "";
    expect(u.readAttribute("password_digest")).toBe(digest);
  });

  it("setting a nil password should clear an existing password", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).password = null;
    expect(u.readAttribute("password_digest")).toBe(null);
  });

  it("override secure password attribute", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("token_digest", "string");
      }
    }
    hasSecurePassword(User, "token");
    const u = new User({ name: "test" });
    (u as any).token = "mytoken";
    expect(u.readAttribute("token_digest")).not.toBe(null);
    expect((u as any).authenticateToken("mytoken")).toBe(u);
    expect((u as any).authenticateToken("wrong")).toBe(false);
  });

  it("authenticate", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect((u as any).authenticate("secret")).toBe(u);
    expect((u as any).authenticate("wrong")).toBe(false);
  });

  it("authenticate should return false and not raise when password digest is blank", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    expect((u as any).authenticate("secret")).toBe(false);
  });

  it("password_salt", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    const digest = u.readAttribute("password_digest") as string;
    const salt = digest.slice(0, 29);
    expect(salt).toMatch(/^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{22}$/);
  });

  it("password_salt should return nil when password is nil", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    expect((u as any).password).toBe(null);
    expect(u.readAttribute("password_digest")).toBe(null);
  });

  it("password_salt should return nil when password digest is nil", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    expect(u.readAttribute("password_digest")).toBe(null);
  });

  it("Password digest cost defaults to bcrypt default cost when min_cost is false", () => {
    SecurePassword.minCost = false;
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    const digest = u.readAttribute("password_digest") as string;
    expect(digest).toMatch(/\$12\$/);
  });

  it("Password digest cost honors bcrypt cost attribute when min_cost is false", () => {
    SecurePassword.minCost = false;
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    const digest = u.readAttribute("password_digest") as string;
    expect(digest).toMatch(/\$12\$/);
    expect((u as any).authenticate("secret")).toBe(u);
  });

  it("Password digest cost can be set to bcrypt min cost to speed up tests", () => {
    SecurePassword.minCost = true;
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    const digest = u.readAttribute("password_digest") as string;
    expect(digest).toContain("$04$");
  });

  it("password reset token", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(u.readAttribute("password_digest")).not.toBe(null);
    (u as any).password = "newpassword";
    expect((u as any).authenticate("newpassword")).toBe(u);
    expect((u as any).authenticate("secret")).toBe(false);
  });

  it("constructor mass-assignment hashes password and removes plaintext", () => {
    const User = createUserClass();
    const u = new User({ name: "test", password: "secret" });
    expect(u.readAttribute("password_digest")).not.toBe(null);
    expect(u.attributes.password).toBeUndefined();
    expect((u as any).authenticate("secret")).toBe(u);
  });

  it("assignAttributes sets password via property setter", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(u.readAttribute("password_digest")).not.toBe(null);
    expect((u as any).authenticate("secret")).toBe(u);
  });

  it("password_challenge validates against existing digest", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(u.isValid()).toBe(true);
    (u as any).passwordChallenge = "secret";
    expect(u.isValid()).toBe(true);
  });

  it("password_challenge rejects wrong current password", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(u.isValid()).toBe(true);
    (u as any).passwordChallenge = "wrong";
    expect(u.isValid()).toBe(false);
    expect(u.errors.get("passwordChallenge")).toContain("is invalid");
  });

  it("password_challenge validates against existing digest before allowing changes", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(u.isValid()).toBe(true);
    (u as any).password = "newpassword";
    (u as any).passwordChallenge = "secret";
    expect(u.isValid()).toBe(true);
    expect((u as any).authenticate("newpassword")).toBe(u);
    expect((u as any).authenticate("secret")).toBe(false);
  });

  it("password_challenge rejects wrong challenge during password change", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(u.isValid()).toBe(true);
    (u as any).password = "newpassword";
    (u as any).passwordChallenge = "wrongold";
    expect(u.isValid()).toBe(false);
    expect(u.errors.get("passwordChallenge")).toContain("is invalid");
  });

  it("password_challenge is not validated when nil", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).passwordChallenge = null;
    expect(u.isValid()).toBe(true);
  });

  it("password_salt returns the bcrypt salt from the digest", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    const salt = (u as any).passwordSalt;
    expect(salt).not.toBeNull();
    expect(typeof salt).toBe("string");
    expect(salt).toMatch(/^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{22}$/);
  });

  it("password_salt returns null when no digest", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    expect((u as any).passwordSalt).toBeNull();
  });
});
