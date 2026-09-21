/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Model } from "./index.js";
import { hasSecurePassword, SecurePassword } from "./secure-password.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { include } from "@blazetrails/activesupport";
import { User } from "./test-helpers/models/user.js";

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

    class SecureUser extends Model {
      declare static _defaultAttributes: AttributesClassHalf["_defaultAttributes"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("password_digest", "string");
      }
    }

    interface SecureUser extends Attributes {}

    hasSecurePassword.call(SecureUser, "password", {});

    class OverridingUser extends SecureUser {}
    Object.defineProperty(OverridingUser.prototype, "password_digest", {
      get(this: SecureUser) {
        return this._readAttribute("password_digest");
      },
      set(this: SecureUser, value: unknown) {
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
    class SecureUser extends Model {
      declare static _defaultAttributes: AttributesClassHalf["_defaultAttributes"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("password_digest", "string");
      }
    }
    interface SecureUser extends Attributes {}

    hasSecurePassword.call(SecureUser, "password", {});

    expect(SecureUser._defaultAttributes().isKey("passwordConfirmation")).toBe(false);

    const u = new SecureUser({ name: "test" });
    (u as any).passwordConfirmation = "secret";
    expect((u as any).passwordConfirmation).toBe("secret");
    expect(Object.keys(u.attributes)).not.toContain("passwordConfirmation");
  });

  it("constructor mass-assignment hashes password and removes plaintext", () => {
    const u = new User({ password: "secret" });
    expect(u._readAttribute("password_digest")).not.toBe(null);
    expect(u.attributes.password).toBeUndefined();
    expect(u.authenticate("secret")).toBe(u);
  });

  it("assignAttributes sets password via property setter", () => {
    const u = new User();
    u.password = "secret";
    expect(u._readAttribute("password_digest")).not.toBe(null);
    expect(u.authenticate("secret")).toBe(u);
  });

  it("password_challenge validates against existing digest", async () => {
    const builder = new User();
    builder.password = "secret";
    const digest = builder._readAttribute("password_digest");
    const u = new User({ password_digest: digest });
    u.changesApplied();
    expect(await u.isValid()).toBe(true);
    u.passwordChallenge = "secret";
    expect(await u.isValid()).toBe(true);
  });

  it("password_challenge rejects wrong current password", async () => {
    const u = new User();
    u.password = "secret";
    expect(await u.isValid()).toBe(true);
    u.passwordChallenge = "wrong";
    expect(await u.isValid()).toBe(false);
    expect(u.errors.messagesFor("passwordChallenge")).toContain("is invalid");
  });

  it("password_challenge validates against existing digest before allowing changes", async () => {
    const builder = new User();
    builder.password = "secret";
    const digest = builder._readAttribute("password_digest");
    const u = new User({ password_digest: digest });
    u.changesApplied();
    expect(await u.isValid()).toBe(true);
    u.password = "newpassword";
    u.passwordChallenge = "secret";
    expect(await u.isValid()).toBe(true);
    expect(u.authenticate("newpassword")).toBe(u);
    expect(u.authenticate("secret")).toBe(false);
  });

  it("password_challenge rejects wrong challenge during password change", async () => {
    const u = new User();
    u.password = "secret";
    expect(await u.isValid()).toBe(true);
    u.password = "newpassword";
    u.passwordChallenge = "wrongold";
    expect(await u.isValid()).toBe(false);
    expect(u.errors.messagesFor("passwordChallenge")).toContain("is invalid");
  });

  it("password_challenge is not validated when nil", async () => {
    const u = new User();
    u.password = "secret";
    u.passwordChallenge = null;
    expect(await u.isValid()).toBe(true);
  });

  it("password_challenge fails against wrong db-loaded digest", async () => {
    const builder = new User();
    builder.password = "secret";
    const digest = builder._readAttribute("password_digest");
    const u = new User({ password_digest: digest });
    u.passwordChallenge = "wrong";
    expect(await u.isValid()).toBe(false);
    expect(u.errors.messagesFor("passwordChallenge")).toContain("is invalid");
  });

  it("password_challenge fails when no prior digest exists", async () => {
    const u = new User();
    u.passwordChallenge = "anything";
    expect(await u.isValid()).toBe(false);
    expect(u.errors.messagesFor("passwordChallenge")).toContain("is invalid");
  });

  it("password too long emits passwordTooLong error type", async () => {
    const u = new User();
    u.password = "a".repeat(73);
    await u.isValid();
    expect(u.errors.where("password", ":password_too_long").length).toBeGreaterThan(0);
  });

  it("password too long resolves to locale entry", async () => {
    const u = new User();
    u.password = "a".repeat(73);
    await u.isValid();
    const msgs = u.errors.fullMessages;
    expect(msgs.some((m) => m.includes("is too long"))).toBe(true);
  });

  it("whitespace-only password digest treated as blank", async () => {
    const u = new User();
    u._writeAttribute("password_digest", "   ");
    expect(await u.isValid()).toBe(false);
    expect(u.errors.messagesFor("password")).toContain("can't be blank");
  });

  it("password_salt returns the bcrypt salt from the digest", () => {
    const u = new User();
    u.password = "secret";
    const salt = u.passwordSalt;
    expect(salt).not.toBeNull();
    expect(typeof salt).toBe("string");
    expect(salt).toMatch(/^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{22}$/);
  });

  it("password_salt returns null when no digest", () => {
    const u = new User();
    expect(u.passwordSalt).toBeNull();
  });
});
