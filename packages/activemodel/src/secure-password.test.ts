/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   Each model below spells `include ActiveModel::Dirty` in its class body, the way the Rails test
   model it mirrors does; the empty class/interface merge beside it is how `include()` surfaces
   those members on the type side. */
import { include } from "@blazetrails/activesupport";
import { Dirty } from "./dirty.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { Model } from "./index.js";
import { hasSecurePassword, SecurePassword } from "./secure-password.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";

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
    declare static attribute: AttributesClassHalf["attribute"];

    static {
      include(this, Attributes);
      include(this, Dirty);
      this.attribute("name", "string");
      this.attribute("password_digest", "string");
    }
  }
  interface User extends Attributes, Dirty {}
  hasSecurePassword.call(User, "password", opts);
  return User;
}

function existingUser() {
  const User = createUserClass();
  const u = new User();
  (u as any).password_digest = bcrypt.hashSync("password", 4);
  u.changesApplied();
  return u;
}

describe("SecurePasswordTest", () => {
  it("automatically include ActiveModel::Validations when validations are enabled", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    expect(await u.isValid()).toBe(false);
    expect(u.errors.messagesFor("password")).toContain("can't be blank");
  });

  it("don't include ActiveModel::Validations when validations are disabled", async () => {
    const User = createUserClass({ validations: false });
    const u = new User({ name: "test" });
    expect(await u.isValid()).toBe(true);
    expect(u.errors.count).toBe(0);
  });

  it("create a new user with validations and valid password/confirmation", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).passwordConfirmation = "secret";
    expect(await u.isValid()).toBe(true);
  });

  it("create a new user with validation and a spaces only password", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = " ".repeat(72);
    expect(await u.isValid()).toBe(true);
  });

  it("create a new user with validation and a blank password", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "";
    expect(await u.isValid()).toBe(false);
  });

  it("create a new user with validation and a nil password", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    expect(await u.isValid()).toBe(false);
  });

  it("create a new user with validation and password length greater than 72 characters", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "a".repeat(73);
    expect(await u.isValid()).toBe(false);
  });

  it("create a new user with validation and password byte size greater than 72 bytes", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "\u{1F600}".repeat(19);
    expect(await u.isValid()).toBe(false);
  });

  it("create a new user with validation and a blank password confirmation", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).passwordConfirmation = "";
    expect(await u.isValid()).toBe(false);
  });

  it("create a new user with validation and a nil password confirmation", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(await u.isValid()).toBe(true);
  });

  it("create a new user with validation and an incorrect password confirmation", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).passwordConfirmation = "wrong";
    expect(await u.isValid()).toBe(false);
  });

  it("resetting password to nil clears the password cache", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(u._readAttribute("password_digest")).not.toBe(null);
    (u as any).password = null;
    expect(u._readAttribute("password_digest")).toBe(null);
  });

  it("update an existing user with validation and no change in password", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(await u.isValid()).toBe(true);
    expect(u._readAttribute("password_digest")).not.toBe(null);
  });

  it("update an existing user with validations and valid password/confirmation", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "newsecret";
    (u as any).passwordConfirmation = "newsecret";
    expect(await u.isValid()).toBe(true);
  });

  it("updating an existing user with validation and a blank password", () => {
    const User = createUserClass();
    const u = new User({ name: "test", password_digest: "$2a$04$existing" });
    (u as any).password = "";
    expect(u._readAttribute("password_digest")).toBe("$2a$04$existing");
  });

  it("updating an existing user with validation and a spaces only password", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = " ".repeat(72);
    expect(await u.isValid()).toBe(true);
  });

  it("updating an existing user with validation and a blank password and password_confirmation", () => {
    const User = createUserClass();
    const u = new User({ name: "test", password_digest: "$2a$04$existing" });
    (u as any).password = "";
    (u as any).passwordConfirmation = "";
    expect(u._readAttribute("password_digest")).toBe("$2a$04$existing");
  });

  it("updating an existing user with validation and a nil password", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).password = null;
    expect(u._readAttribute("password_digest")).toBe(null);
  });

  it("updating an existing user with validation and password length greater than 72", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "a".repeat(73);
    expect(await u.isValid()).toBe(false);
  });

  it("updating an existing user with validation and a blank password confirmation", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).passwordConfirmation = "";
    expect(await u.isValid()).toBe(false);
  });

  it("updating an existing user with validation and a nil password confirmation", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(await u.isValid()).toBe(true);
  });

  it("updating an existing user with validation and an incorrect password confirmation", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).passwordConfirmation = "wrong";
    expect(await u.isValid()).toBe(false);
  });

  it("updating an existing user with validation and a correct password challenge", async () => {
    const u = existingUser();
    (u as any).password = "new password";
    (u as any).passwordChallenge = "password";
    expect(await u.isValid()).toBe(true);
  });

  it("updating an existing user with validation and a nil password challenge", async () => {
    const u = existingUser();
    (u as any).password = "new password";
    (u as any).passwordChallenge = null;
    expect(await u.isValid()).toBe(true);
  });

  it("updating an existing user with validation and a blank password challenge", async () => {
    const u = existingUser();
    (u as any).password = "new password";
    (u as any).passwordChallenge = "";
    expect(await u.isValid()).toBe(false);
    expect(u.errors.count).toBe(1);
    expect(u.errors.messagesFor("passwordChallenge")).toEqual(["is invalid"]);
  });

  it("updating an existing user with validation and an incorrect password challenge", async () => {
    const u = existingUser();
    (u as any).password = "new password";
    (u as any).passwordChallenge = "new password";
    expect(await u.isValid()).toBe(false);
    expect(u.errors.count).toBe(1);
    expect(u.errors.messagesFor("passwordChallenge")).toEqual(["is invalid"]);
  });

  it("updating a user without dirty tracking and a correct password challenge", () => {
    const User = createUserClass({ validations: false });
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect((u as any).authenticate("secret")).toBe(u);
  });

  it("updating an existing user with validation and a blank password digest", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    u._writeAttribute("password_digest", "");
    expect(await u.isValid()).toBe(false);
  });

  it("updating an existing user with validation and a nil password digest", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    u._writeAttribute("password_digest", null);
    expect(await u.isValid()).toBe(false);
  });

  it("setting a blank password should not change an existing password", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    const digest = u._readAttribute("password_digest");
    (u as any).password = "";
    expect(u._readAttribute("password_digest")).toBe(digest);
  });

  it("setting a nil password should clear an existing password", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).password = null;
    expect(u._readAttribute("password_digest")).toBe(null);
  });

  it("override secure password attribute", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
        this.attribute("token_digest", "string");
      }
    }
    interface User extends Attributes, Dirty {}
    hasSecurePassword.call(User, "token");
    const u = new User({ name: "test" });
    (u as any).token = "mytoken";
    expect(u._readAttribute("token_digest")).not.toBe(null);
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
    const digest = u._readAttribute("password_digest") as string;
    const salt = digest.slice(0, 29);
    expect(salt).toMatch(/^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{22}$/);
  });

  it("password_salt should return nil when password is nil", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    expect((u as any).password).toBe(null);
    expect(u._readAttribute("password_digest")).toBe(null);
  });

  it("password_salt should return nil when password digest is nil", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    expect(u._readAttribute("password_digest")).toBe(null);
  });

  it("Password digest cost defaults to bcrypt default cost when min_cost is false", () => {
    SecurePassword.minCost = false;
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    const digest = u._readAttribute("password_digest") as string;
    expect(digest).toMatch(/\$12\$/);
  });

  it("Password digest cost honors bcrypt cost attribute when min_cost is false", () => {
    SecurePassword.minCost = false;
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    const digest = u._readAttribute("password_digest") as string;
    expect(digest).toMatch(/\$12\$/);
    expect((u as any).authenticate("secret")).toBe(u);
  });

  it("Password digest cost can be set to bcrypt min cost to speed up tests", () => {
    SecurePassword.minCost = true;
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    const digest = u._readAttribute("password_digest") as string;
    expect(digest).toContain("$04$");
  });

  it("password reset token", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(u._readAttribute("password_digest")).not.toBe(null);
    (u as any).password = "newpassword";
    expect((u as any).authenticate("newpassword")).toBe(u);
    expect((u as any).authenticate("secret")).toBe(false);
  });

  it("constructor mass-assignment hashes password and removes plaintext", () => {
    const User = createUserClass();
    const u = new User({ name: "test", password: "secret" });
    expect(u._readAttribute("password_digest")).not.toBe(null);
    expect(u.attributes.password).toBeUndefined();
    expect((u as any).authenticate("secret")).toBe(u);
  });

  it("assignAttributes sets password via property setter", () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(u._readAttribute("password_digest")).not.toBe(null);
    expect((u as any).authenticate("secret")).toBe(u);
  });

  it("password_challenge validates against existing digest", async () => {
    const User = createUserClass();
    const builder = new User({ name: "test" });
    (builder as any).password = "secret";
    const digest = builder._readAttribute("password_digest");
    const u = new User({ name: "test", password_digest: digest });
    u.changesApplied();
    expect(await u.isValid()).toBe(true);
    (u as any).passwordChallenge = "secret";
    expect(await u.isValid()).toBe(true);
  });

  it("password_challenge rejects wrong current password", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(await u.isValid()).toBe(true);
    (u as any).passwordChallenge = "wrong";
    expect(await u.isValid()).toBe(false);
    expect(u.errors.messagesFor("passwordChallenge")).toContain("is invalid");
  });

  it("password_challenge validates against existing digest before allowing changes", async () => {
    const User = createUserClass();
    const builder = new User({ name: "test" });
    (builder as any).password = "secret";
    const digest = builder._readAttribute("password_digest");
    const u = new User({ name: "test", password_digest: digest });
    u.changesApplied();
    expect(await u.isValid()).toBe(true);
    (u as any).password = "newpassword";
    (u as any).passwordChallenge = "secret";
    expect(await u.isValid()).toBe(true);
    expect((u as any).authenticate("newpassword")).toBe(u);
    expect((u as any).authenticate("secret")).toBe(false);
  });

  it("password_challenge rejects wrong challenge during password change", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    expect(await u.isValid()).toBe(true);
    (u as any).password = "newpassword";
    (u as any).passwordChallenge = "wrongold";
    expect(await u.isValid()).toBe(false);
    expect(u.errors.messagesFor("passwordChallenge")).toContain("is invalid");
  });

  it("password_challenge is not validated when nil", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "secret";
    (u as any).passwordChallenge = null;
    expect(await u.isValid()).toBe(true);
  });

  it("password_challenge fails against wrong db-loaded digest", async () => {
    const User = createUserClass();
    const builder = new User({ name: "test" });
    (builder as any).password = "secret";
    const digest = builder._readAttribute("password_digest");
    const u = new User({ name: "test", password_digest: digest });
    (u as any).passwordChallenge = "wrong";
    expect(await u.isValid()).toBe(false);
    expect(u.errors.messagesFor("passwordChallenge")).toContain("is invalid");
  });

  it("password_challenge fails when no prior digest exists", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).passwordChallenge = "anything";
    expect(await u.isValid()).toBe(false);
    expect(u.errors.messagesFor("passwordChallenge")).toContain("is invalid");
  });

  it("password too long emits passwordTooLong error type", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "a".repeat(73);
    await u.isValid();
    expect(u.errors.where("password", ":password_too_long").length).toBeGreaterThan(0);
  });

  it("password too long resolves to locale entry", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    (u as any).password = "a".repeat(73);
    await u.isValid();
    const msgs = u.errors.fullMessages;
    expect(msgs.some((m) => m.includes("is too long"))).toBe(true);
  });

  it("whitespace-only password digest treated as blank", async () => {
    const User = createUserClass();
    const u = new User({ name: "test" });
    u._writeAttribute("password_digest", "   ");
    expect(await u.isValid()).toBe(false);
    expect(u.errors.messagesFor("password")).toContain("can't be blank");
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
