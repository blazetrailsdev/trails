import { getCrypto } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import { generatesTokenFor } from "./token-for.js";

/**
 * Secure password support using PBKDF2 (Web Crypto API).
 *
 * Mirrors: ActiveRecord::SecurePassword (has_secure_password)
 *
 * When enabled on a model:
 * - Adds `password=` setter that hashes to `password_digest`
 * - Adds `authenticate(password)` method that returns the record or false
 * - Adds presence validation for password on create
 * - Adds confirmation validation if `password_confirmation` is set
 */

const ITERATIONS = 10_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function hashPassword(password: string): string {
  const salt = getCrypto().randomBytes(SALT_LENGTH);
  const hash = getCrypto().pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha256");
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password: string, digest: string): boolean {
  const [saltHex, hashHex] = digest.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const hash = getCrypto().pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha256");
  return hash.toString("hex") === hashHex;
}

/**
 * Enable has_secure_password on a model class.
 *
 * Requires: password_digest attribute defined on the model.
 *
 * Adds:
 * - password property (virtual, write-only setter)
 * - authenticate(password) instance method
 * - Validation: password must be present on create
 * - Validation: password_confirmation must match if set
 */
export function hasSecurePassword(
  modelClass: typeof Base,
  options: { validations?: boolean; resetToken?: boolean } = {},
): void {
  const runValidations = options.validations !== false;
  const attribute = "password";
  const digestAttr = `${attribute}_digest`;

  // Store the raw password temporarily for hashing during save
  const passwordKey = Symbol("password");
  const confirmationKey = Symbol("password_confirmation");

  // password setter/getter
  Object.defineProperty(modelClass.prototype, "password", {
    get: function () {
      return (this as any)[passwordKey] ?? null;
    },
    set: function (value: string | null) {
      (this as any)[passwordKey] = value;
    },
    configurable: true,
  });

  // password_confirmation setter/getter
  Object.defineProperty(modelClass.prototype, "passwordConfirmation", {
    get: function () {
      return (this as any)[confirmationKey] ?? null;
    },
    set: function (value: string | null) {
      (this as any)[confirmationKey] = value;
    },
    configurable: true,
  });

  // authenticate method
  Object.defineProperty(modelClass.prototype, "authenticate", {
    value: function (this: Base, password: string): Base | false {
      const digest = this._readAttribute(digestAttr);
      if (!digest) return false;
      return verifyPassword(password, digest as string) ? this : false;
    },
    writable: true,
    configurable: true,
  });

  // Hook into save to hash the password. Use writeAttribute (not
  // _attributes.set) so the dirty tracker marks the column changed and
  // an UPDATE SQL includes the new digest — required for token
  // invalidation to round-trip through the DB.
  modelClass.beforeSave(function (record: Base) {
    const rawPassword = (record as any)[passwordKey];
    // Rails `password=` setter skips hashing for empty strings
    // (active_model/secure_password.rb) — an empty password is not a
    // valid password, so we leave the existing digest untouched.
    if (rawPassword != null && rawPassword !== "") {
      const digest = hashPassword(rawPassword);
      record.writeAttribute(digestAttr, digest);
      // Clear the raw password after hashing so subsequent saves don't
      // rehash with a new random salt (changing the digest on every save
      // would invalidate outstanding password-reset tokens).
      (record as any)[passwordKey] = null;
      (record as any)[confirmationKey] = null;
    }
  });

  // Add validations
  if (runValidations) {
    modelClass.validate(function (record: any) {
      const rawPassword = record[passwordKey];
      const isNew = record.isNewRecord();

      // Password must be present on create or when explicitly set
      if (isNew && (rawPassword === null || rawPassword === undefined || rawPassword === "")) {
        record.errors.add("password", "blank");
      }

      // Password confirmation must match if provided
      const confirmation = record[confirmationKey];
      if (confirmation !== null && confirmation !== undefined && rawPassword !== confirmation) {
        record.errors.add("password_confirmation", "confirmation", {
          message: "doesn't match Password",
        });
      }
    });
  }

  // Password reset token infrastructure.
  // Mirrors: ActiveModel::SecurePassword#has_secure_password reset_token block
  // (secure_password.rb:162-178). Rails gates this on defined?(ActiveRecord::Base)
  // which is always true here — we're already in ActiveRecord.
  const runResetToken = options.resetToken !== false;
  if (runResetToken) {
    const purpose = `${attribute}_reset` as const;
    const FIFTEEN_MINUTES = 15 * 60;

    // Register the token purpose. The generator derives a version by hashing
    // the current digest with SHA-256 and embedding the first 16 hex chars.
    // When the password (and therefore the digest) changes, the hash changes
    // too — existing tokens are automatically invalidated, matching Rails'
    // BCrypt::Password#version approach.
    generatesTokenFor(modelClass, purpose, {
      expiresIn: FIFTEEN_MINUTES,
      generator: (record: Base) => {
        const digest = record._readAttribute(digestAttr);
        if (typeof digest !== "string" || !digest) return "";
        // Derive a version from the digest without embedding raw digest
        // bytes in the token (MessageVerifier is signed, not encrypted, so
        // the payload is readable). A short hash of the digest changes
        // whenever the digest changes (password updated → old tokens stale)
        // but doesn't expose the digest itself.
        // Mirrors Rails' BCrypt::Password#version which returns the bcrypt
        // version string — not the raw digest — for the same purpose.
        const buf = getCrypto().createHash("sha256").update(digest).digest();
        return buf.toString("hex").slice(0, 16);
      },
    });

    // ${attribute}_reset_token → generate_token_for(:"${attribute}_reset")
    // Mirrors: define_method :"#{attribute}_reset_token"
    const resetTokenMethod = `${attribute}ResetToken`;
    Object.defineProperty(modelClass.prototype, resetTokenMethod, {
      get: function (this: Base) {
        return (this as any).generateTokenFor(purpose);
      },
      configurable: true,
    });

    // Class method: findBy${Attribute}ResetToken(token)
    // Mirrors: alias_method :"find_by_#{attribute}_reset_token", :find_by_token_for
    const cap = attribute.charAt(0).toUpperCase() + attribute.slice(1);
    const findByMethod = `findBy${cap}ResetToken`;
    Object.defineProperty(modelClass, findByMethod, {
      value: function (this: typeof Base, token: string) {
        return (this as any).findByTokenFor(purpose, token);
      },
      writable: true,
      configurable: true,
    });

    // Class method: findBy${Attribute}ResetToken!(token)
    // Mirrors: define_method :"find_by_#{attribute}_reset_token!"
    const findByBangMethod = `${findByMethod}Bang`;
    Object.defineProperty(modelClass, findByBangMethod, {
      value: function (this: typeof Base, token: string) {
        return (this as any).findByTokenForBang(purpose, token);
      },
      writable: true,
      configurable: true,
    });
  }
}

export { hashPassword as _hashPassword, verifyPassword as _verifyPassword };
