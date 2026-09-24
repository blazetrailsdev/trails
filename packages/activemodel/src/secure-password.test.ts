/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   `ValidatableVisitor` merges with an empty interface so the `Validations` members its `Visitor`
   parent includes surface on the type side. */
import { assertRespondTo, assertNotRespondTo, assertNil } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { Engine } from "./bcrypt.js";
import { hasSecurePassword, SecurePassword } from "./secure-password.js";
import { Validations } from "./validations.js";
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
  existingUser.password_digest = bcrypt.hashSync("password", Engine.MIN_COST);
  existingUser.changesApplied();
});

afterEach(() => {
  SecurePassword.minCost = originalMinCost;
});

describe("SecurePasswordTest", () => {
  it("automatically include ActiveModel::Validations when validations are enabled", () => {
    assertRespondTo(user, "isValid");
  });

  it("don't include ActiveModel::Validations when validations are disabled", () => {
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
    assertNil(user.password);
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

  it("updating a user without dirty tracking and a correct password challenge", async () => {
    class ValidatableVisitor extends Visitor {
      untracked_digest: string | null = null;

      static {
        hasSecurePassword.call(this, "untracked");
      }
    }
    interface ValidatableVisitor extends Validations {}
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
    assertNil(existingUser.password_digest);
  });

  it("override secure password attribute", () => {
    assertNil(user.passwordCalled);

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
    expect(user.passwordSalt).toEqual(bcrypt.getSalt(user.password_digest!));
  });

  it("password_salt should return nil when password is nil", () => {
    user.password = null;
    assertNil(user.passwordSalt);
  });

  it("password_salt should return nil when password digest is nil", () => {
    user.password_digest = null;
    assertNil(user.passwordSalt);
  });

  it("Password digest cost defaults to bcrypt default cost when min_cost is false", () => {
    SecurePassword.minCost = false;

    user.password = "secret";
    expect(bcrypt.getRounds(user.password_digest!)).toEqual(Engine.DEFAULT_COST);
  });

  it("Password digest cost honors bcrypt cost attribute when min_cost is false", () => {
    const originalBcryptCost = Engine.cost;
    try {
      SecurePassword.minCost = false;
      Engine.cost = 5;

      user.password = "secret";
      expect(bcrypt.getRounds(user.password_digest!)).toEqual(Engine.cost);
    } finally {
      Engine.cost = originalBcryptCost;
    }
  });

  it("Password digest cost can be set to bcrypt min cost to speed up tests", () => {
    SecurePassword.minCost = true;

    user.password = "secret";
    expect(bcrypt.getRounds(user.password_digest!)).toEqual(Engine.MIN_COST);
  });

  it("password reset token", () => {
    expect(rbObjRespondTo(null, "passwordResetToken")).toBeFalsy();
    expect(pilot.passwordResetToken).toEqual("password_reset-token-900");

    expect(Pilot.findByPasswordResetToken("999")).toEqual("finding-for-password_reset-by-999");
    expect(Pilot.findByPasswordResetTokenBang("999")).toEqual("finding-for-password_reset-by-999!");
  });
});
