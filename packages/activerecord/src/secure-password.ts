import { getCrypto } from "@blazetrails/activesupport";
import type { Base } from "./base.js";

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
  options: { validations?: boolean } = {},
): void {
  const runValidations = options.validations !== false;

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
      const digest = this.readAttribute("password_digest");
      if (!digest) return false;
      return verifyPassword(password, digest as string) ? this : false;
    },
    writable: true,
    configurable: true,
  });

  // Hook into save to hash the password
  modelClass.beforeSave(function (record: Base) {
    const rawPassword = (record as any)[passwordKey];
    if (rawPassword != null) {
      const digest = hashPassword(rawPassword);
      record._attributes.set("password_digest", digest);
    }
  });

  // Add validations
  if (runValidations) {
    modelClass.validate(function (record: any) {
      const rawPassword = record[passwordKey];
      const isNew = record.isNewRecord();
      const digestChanged = record.attributeChanged("password_digest");

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
}

export { hashPassword as _hashPassword, verifyPassword as _verifyPassword };
