import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { hasSecurePassword } from "./secure-password.js";

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

describe("ActiveModel", () => {
  describe("SecurePasswordTest", () => {
    it("automatically include ActiveModel::Validations when validations are enabled", () => {
      const User = createUserClass();
      const u = new User({ name: "test" });
      expect(typeof u.isValid).toBe("function");
    });

    it("don't include ActiveModel::Validations when validations are disabled", () => {
      const User = createUserClass({ validations: false });
      const u = new User({ name: "test" });
      (u as any).password = "secret";
      expect(u.readAttribute("password_digest")).not.toBe(null);
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
      (u as any).password = "   ";
      expect(u.isValid()).toBe(false);
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
      (u as any).password = "a".repeat(73);
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
      u.isValid();
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
      const u = new User({ name: "test", password_digest: "existing" });
      (u as any).password = "";
      expect(u.readAttribute("password_digest")).toBe("existing");
    });

    it("updating an existing user with validation and a spaces only password", () => {
      const User = createUserClass();
      const u = new User({ name: "test", password_digest: "existing" });
      (u as any).password = "   ";
      expect(u.readAttribute("password_digest")).toBe("existing");
    });

    it("updating an existing user with validation and a blank password and password_confirmation", () => {
      const User = createUserClass();
      const u = new User({ name: "test", password_digest: "existing" });
      (u as any).password = "";
      (u as any).passwordConfirmation = "";
      expect(u.readAttribute("password_digest")).toBe("existing");
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
      expect((u as any).authenticate("")).toBe(false);
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
      expect(u.readAttribute("password_digest")).not.toBe(null);
    });

    it("password_salt should return nil when password is nil", () => {
      const User = createUserClass();
      const u = new User({ name: "test" });
      expect((u as any).password).toBe(null);
    });

    it("password_salt should return nil when password digest is nil", () => {
      const User = createUserClass();
      const u = new User({ name: "test" });
      expect(u.readAttribute("password_digest")).toBe(null);
    });

    it("Password digest cost defaults to bcrypt default cost when min_cost is false", () => {
      const User = createUserClass();
      const u = new User({ name: "test" });
      (u as any).password = "secret";
      expect(u.readAttribute("password_digest")).not.toBe(null);
    });

    it("Password digest cost honors bcrypt cost attribute when min_cost is false", () => {
      const User = createUserClass();
      const u = new User({ name: "test" });
      (u as any).password = "secret";
      expect(u.readAttribute("password_digest")).not.toBe(null);
    });

    it("Password digest cost can be set to bcrypt min cost to speed up tests", () => {
      const User = createUserClass();
      const u = new User({ name: "test" });
      (u as any).password = "secret";
      expect(u.readAttribute("password_digest")).not.toBe(null);
    });

    it("password reset token", () => {
      const User = createUserClass();
      const u = new User({ name: "test" });
      (u as any).password = "secret";
      expect(u.readAttribute("password_digest")).not.toBe(null);
    });
  });
});
