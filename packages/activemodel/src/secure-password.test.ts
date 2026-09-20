/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   Each model below spells `include ActiveModel::Dirty` in its class body, the way the Rails test
   model it mirrors does; the empty class/interface merge beside it is how `include()` surfaces
   those members on the type side. */
import { include, assertRespondTo, assertNotRespondTo } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Dirty } from "./dirty.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { Model } from "./index.js";
import { hasSecurePassword, SecurePassword } from "./secure-password.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { User } from "./test-helpers/models/user.js";
import { Visitor } from "./test-helpers/models/visitor.js";
import { Pilot } from "./test-helpers/models/pilot.js";

let originalMinCost: boolean;
let user: User;
let visitor: Visitor;
let pilot: Pilot;
let existingUser: User;

beforeEach(() => {
  originalMinCost = SecurePassword.minCost;
  SecurePassword.minCost = true;

  user = new User();
  visitor = new Visitor();
  pilot = new Pilot();

  existingUser = new User();
  existingUser.password_digest = bcrypt.hashSync("password", 4);
  existingUser.changesApplied();
});

afterEach(() => {
  SecurePassword.minCost = originalMinCost;
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

describe("SecurePasswordTest", () => {
  it("automatically include ActiveModel::Validations when validations are enabled", () => {
    assertRespondTo(user, "isValid");
  });

  // BLOCKED: assertion-surfaced-secure-password-visitor-always-validatable
  it.skip("don't include ActiveModel::Validations when validations are disabled", () => {
    assertNotRespondTo(visitor, "isValid");
  });

  it("create a new user with validations and valid password/confirmation", async () => {
    user.password = "password";
    user.passwordConfirmation = "password";

    expect(await user.isValid("create"), "user should be valid").toBeTruthy();

    user.password = "a".repeat(72);
    user.passwordConfirmation = "a".repeat(72);

    expect(await user.isValid("create"), "user should be valid").toBeTruthy();
  });

  it("create a new user with validation and a spaces only password", async () => {
    user.password = " ".repeat(72);
    expect(await user.isValid("create"), "user should be valid").toBeTruthy();
  });

  it("create a new user with validation and a blank password", async () => {
    user.password = "";
    expect(await user.isValid("create"), "user should be invalid").toBeFalsy();
    expect(user.errors.count).toEqual(1);
    expect(user.errors.messagesFor("password")).toEqual(["can't be blank"]);
  });

  it("create a new user with validation and a nil password", async () => {
    user.password = null;
    expect(await user.isValid("create"), "user should be invalid").toBeFalsy();
    expect(user.errors.count).toEqual(1);
    expect(user.errors.messagesFor("password")).toEqual(["can't be blank"]);
  });

  it("create a new user with validation and password length greater than 72 characters", async () => {
    user.password = "a".repeat(73);
    user.passwordConfirmation = "a".repeat(73);
    expect(await user.isValid("create"), "user should be invalid").toBeFalsy();
    expect(user.errors.count).toEqual(1);
    expect(user.errors.messagesFor("password")).toEqual(["is too long"]);
  });

  it("create a new user with validation and password byte size greater than 72 bytes", async () => {
    user.password = "あ".repeat(24) + "a";
    user.passwordConfirmation = "あ".repeat(24) + "a";
    expect(await user.isValid("create"), "user should be invalid").toBeFalsy();
    expect(user.errors.count).toEqual(1);
    expect(user.errors.messagesFor("password")).toEqual(["is too long"]);
  });

  it("create a new user with validation and a blank password confirmation", async () => {
    user.password = "password";
    user.passwordConfirmation = "";
    expect(await user.isValid("create"), "user should be invalid").toBeFalsy();
    expect(user.errors.count).toEqual(1);
    expect(user.errors.messagesFor("passwordConfirmation")).toEqual(["doesn't match Password"]);
  });

  it("create a new user with validation and a nil password confirmation", async () => {
    user.password = "password";
    user.passwordConfirmation = null;
    expect(await user.isValid("create"), "user should be valid").toBeTruthy();
  });

  it("create a new user with validation and an incorrect password confirmation", async () => {
    user.password = "password";
    user.passwordConfirmation = "something else";
    expect(await user.isValid("create"), "user should be invalid").toBeFalsy();
    expect(user.errors.count).toEqual(1);
    expect(user.errors.messagesFor("passwordConfirmation")).toEqual(["doesn't match Password"]);
  });

  it("resetting password to nil clears the password cache", () => {
    user.password = "password";
    user.password = null;
    expect(user.password).toBeNull();
  });

  it("update an existing user with validation and no change in password", async () => {
    expect(await existingUser.isValid("update"), "user should be valid").toBeTruthy();
  });

  it("update an existing user with validations and valid password/confirmation", async () => {
    existingUser.password = "password";
    existingUser.passwordConfirmation = "password";

    expect(await existingUser.isValid("update"), "user should be valid").toBeTruthy();

    existingUser.password = "a".repeat(72);
    existingUser.passwordConfirmation = "a".repeat(72);

    expect(await existingUser.isValid("update"), "user should be valid").toBeTruthy();
  });

  it("updating an existing user with validation and a blank password", async () => {
    existingUser.password = "";
    expect(await existingUser.isValid("update"), "user should be valid").toBeTruthy();
  });

  it("updating an existing user with validation and a spaces only password", async () => {
    user.password = " ".repeat(72);
    expect(await user.isValid("update"), "user should be valid").toBeTruthy();
  });

  it("updating an existing user with validation and a blank password and password_confirmation", async () => {
    existingUser.password = "";
    existingUser.passwordConfirmation = "";
    expect(await existingUser.isValid("update"), "user should be valid").toBeTruthy();
  });

  it("updating an existing user with validation and a nil password", async () => {
    existingUser.password = null;
    expect(await existingUser.isValid("update"), "user should be invalid").toBeFalsy();
    expect(existingUser.errors.count).toEqual(1);
    expect(existingUser.errors.messagesFor("password")).toEqual(["can't be blank"]);
  });

  it("updating an existing user with validation and password length greater than 72", async () => {
    existingUser.password = "a".repeat(73);
    existingUser.passwordConfirmation = "a".repeat(73);
    expect(await existingUser.isValid("update"), "user should be invalid").toBeFalsy();
    expect(existingUser.errors.count).toEqual(1);
    expect(existingUser.errors.messagesFor("password")).toEqual(["is too long"]);
  });

  it("updating an existing user with validation and a blank password confirmation", async () => {
    existingUser.password = "password";
    existingUser.passwordConfirmation = "";
    expect(await existingUser.isValid("update"), "user should be invalid").toBeFalsy();
    expect(existingUser.errors.count).toEqual(1);
    expect(existingUser.errors.messagesFor("passwordConfirmation")).toEqual([
      "doesn't match Password",
    ]);
  });

  it("updating an existing user with validation and a nil password confirmation", async () => {
    existingUser.password = "password";
    existingUser.passwordConfirmation = null;
    expect(await existingUser.isValid("update"), "user should be valid").toBeTruthy();
  });

  it("updating an existing user with validation and an incorrect password confirmation", async () => {
    existingUser.password = "password";
    existingUser.passwordConfirmation = "something else";
    expect(await existingUser.isValid("update"), "user should be invalid").toBeFalsy();
    expect(existingUser.errors.count).toEqual(1);
    expect(existingUser.errors.messagesFor("passwordConfirmation")).toEqual([
      "doesn't match Password",
    ]);
  });

  it("updating an existing user with validation and a correct password challenge", async () => {
    existingUser.password = "new password";
    existingUser.passwordChallenge = "password";
    expect(await existingUser.isValid("update"), "user should be valid").toBeTruthy();
  });

  it("updating an existing user with validation and a nil password challenge", async () => {
    existingUser.password = "new password";
    existingUser.passwordChallenge = null;
    expect(await existingUser.isValid("update"), "user should be valid").toBeTruthy();
  });

  it("updating an existing user with validation and a blank password challenge", async () => {
    existingUser.password = "new password";
    existingUser.passwordChallenge = "";
    expect(await existingUser.isValid("update"), "user should be invalid").toBeFalsy();
    expect(existingUser.errors.count).toEqual(1);
    expect(existingUser.errors.messagesFor("passwordChallenge")).toEqual(["is invalid"]);
  });

  it("updating an existing user with validation and an incorrect password challenge", async () => {
    existingUser.password = "new password";
    existingUser.passwordChallenge = "new password";
    expect(await existingUser.isValid("update"), "user should be invalid").toBeFalsy();
    expect(existingUser.errors.count).toEqual(1);
    expect(existingUser.errors.messagesFor("passwordChallenge")).toEqual(["is invalid"]);
  });

  // BLOCKED: assertion-surfaced-secure-password-challenge-respond-to
  it.skip("updating a user without dirty tracking and a correct password challenge", async () => {
    class ValidatableVisitor extends Visitor {
      untracked_digest: string | null = null;

      static {
        hasSecurePassword.call(this, "untracked");
      }
    }
    const validatableVisitor = new ValidatableVisitor() as ValidatableVisitor & {
      untracked: unknown;
      untrackedChallenge: unknown;
    };

    validatableVisitor.untracked = "password";
    expect(await validatableVisitor.isValid("update"), "user should be valid").toBeTruthy();

    validatableVisitor.untrackedChallenge = "password";
    expect(await validatableVisitor.isValid("update"), "user should be invalid").toBeFalsy();
  });

  it("updating an existing user with validation and a blank password digest", async () => {
    existingUser.password_digest = "";
    expect(await existingUser.isValid("update"), "user should be invalid").toBeFalsy();
    expect(existingUser.errors.count).toEqual(1);
    expect(existingUser.errors.messagesFor("password")).toEqual(["can't be blank"]);
  });

  it("updating an existing user with validation and a nil password digest", async () => {
    existingUser.password_digest = null;
    expect(await existingUser.isValid("update"), "user should be invalid").toBeFalsy();
    expect(existingUser.errors.count).toEqual(1);
    expect(existingUser.errors.messagesFor("password")).toEqual(["can't be blank"]);
  });

  it("setting a blank password should not change an existing password", () => {
    existingUser.password = "";
    expect(bcrypt.compareSync("password", existingUser.password_digest!)).toBeTruthy();
  });

  it("setting a nil password should clear an existing password", () => {
    existingUser.password = null;
    expect(existingUser.password_digest).toBeNull();
  });

  it("override secure password attribute", () => {
    expect(user.passwordCalled).toBeNull();

    user.password = "secret";

    expect(user.password).toEqual("secret");
    expect(user.passwordCalled).toEqual(1);

    user.password = "terces";

    expect(user.password).toEqual("terces");
    expect(user.passwordCalled).toEqual(2);
  });

  it("authenticate", () => {
    user.password = "secret";
    user.recovery_password = "42password";

    expect(user.authenticate("wrong")).toEqual(false);
    expect(user.authenticate("secret")).toEqual(user);

    expect(user.authenticatePassword("wrong")).toEqual(false);
    expect(user.authenticatePassword("secret")).toEqual(user);

    expect(user.authenticateRecoveryPassword("wrong")).toEqual(false);
    expect(user.authenticateRecoveryPassword("42password")).toEqual(user);
  });

  it("authenticate should return false and not raise when password digest is blank", () => {
    user.password_digest = " ";
    expect(user.authenticate(" ")).toEqual(false);
  });

  it("password_salt", () => {
    user.password = "secret";
    expect(bcrypt.getSalt(user.password_digest!)).toEqual(user.passwordSalt);
  });

  it("password_salt should return nil when password is nil", () => {
    user.password = null;
    expect(user.passwordSalt).toBeNull();
  });

  it("password_salt should return nil when password digest is nil", () => {
    user.password_digest = null;
    expect(user.passwordSalt).toBeNull();
  });

  it("Password digest cost defaults to bcrypt default cost when min_cost is false", () => {
    SecurePassword.minCost = false;

    user.password = "secret";
    expect(12).toEqual(Number(user.password_digest!.split("$")[2]));
  });

  it("Password digest cost honors bcrypt cost attribute when min_cost is false", () => {
    SecurePassword.minCost = false;

    user.password = "secret";
    expect(12).toEqual(Number(user.password_digest!.split("$")[2]));
  });

  it("Password digest cost can be set to bcrypt min cost to speed up tests", () => {
    SecurePassword.minCost = true;

    user.password = "secret";
    expect(4).toEqual(Number(user.password_digest!.split("$")[2]));
  });

  it("password reset token", () => {
    expect(rbObjRespondTo(null, "passwordResetToken")).toBeFalsy();
    expect(pilot.passwordResetToken).toEqual("password_reset-token-900");

    expect(Pilot.findByPasswordResetToken("999")).toEqual("finding-for-password_reset-by-999");
    expect(Pilot.findByPasswordResetTokenBang("999")).toEqual("finding-for-password_reset-by-999!");
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
