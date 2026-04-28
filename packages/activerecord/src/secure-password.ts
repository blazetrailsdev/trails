import { getCrypto, camelize, pbkdf2Async } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
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
  attributeOrOptions: string | { validations?: boolean; resetToken?: boolean } = {},
  maybeOptions: { validations?: boolean; resetToken?: boolean } = {},
): void {
  // Mirrors Rails: `has_secure_password(attribute = :password, validations: true, reset_token: true)`
  const attribute = typeof attributeOrOptions === "string" ? attributeOrOptions : "password";
  const options = typeof attributeOrOptions === "string" ? maybeOptions : attributeOrOptions;
  const isDefaultAttribute = attribute === "password";
  const runValidations = options.validations !== false;
  const digestAttr = `${attribute}_digest`;

  // Store the raw password temporarily for hashing during save
  const passwordKey = Symbol(`${attribute}`);
  const confirmationKey = Symbol(`${attribute}_confirmation`);

  // Define setter/getter for the configured secure-password attribute
  // (e.g. password / recovery_password).
  Object.defineProperty(modelClass.prototype, attribute, {
    get: function () {
      return (this as any)[passwordKey] ?? null;
    },
    set: function (value: string | null) {
      (this as any)[passwordKey] = value;
    },
    configurable: true,
  });

  // password_confirmation setter/getter — only for the default attribute,
  // matching the surface most apps rely on. Per-attribute confirmation is
  // a separable follow-up.
  if (isDefaultAttribute) {
    Object.defineProperty(modelClass.prototype, "passwordConfirmation", {
      get: function () {
        return (this as any)[confirmationKey] ?? null;
      },
      set: function (value: string | null) {
        (this as any)[confirmationKey] = value;
      },
      configurable: true,
    });

    // `authenticate` (no suffix) is a Rails convenience for the default attribute.
    Object.defineProperty(modelClass.prototype, "authenticate", {
      value: function (this: Base, password: string): Base | false {
        const digest = this._readAttribute(digestAttr);
        if (!digest) return false;
        return verifyPassword(password, digest as string) ? this : false;
      },
      writable: true,
      configurable: true,
    });
  }

  // authenticate${Attribute} method (for authenticate_by to call)
  // e.g., authenticatePassword, authenticateRecoveryPassword
  const authenticateMethodName = `authenticate${camelize(attribute)}`;
  Object.defineProperty(modelClass.prototype, authenticateMethodName, {
    value: function (this: Base, password: string): Base | false {
      const digest = this._readAttribute(digestAttr);
      if (!digest) return false;
      return verifyPassword(password, digest as string) ? this : false;
    },
    writable: true,
    configurable: true,
  });

  // Static authenticateBy — attached once per class (Rails: ClassMethods
  // module included once). Skip if already defined so multiple
  // hasSecurePassword calls don't redundantly redefine the same function.
  if (!(modelClass as any).authenticateBy) {
    Object.defineProperty(modelClass, "authenticateBy", {
      value: authenticateBy,
      writable: true,
      configurable: true,
    });
  }

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

  // Add validations (only wired for the default `password` attribute today;
  // per-attribute validations would mean parameterizing the `errors.add`
  // keys and message — separable from authenticate_by parity).
  if (runValidations && isDefaultAttribute) {
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

/**
 * Authenticates a record by finding it via non-password attributes,
 * then verifying password attributes. Returns the record on success,
 * null if authentication fails.
 *
 * Mirrors: ActiveRecord::SecurePassword.authenticate_by
 *
 * Given a set of attributes, finds a record using the non-password
 * attributes, and then authenticates that record using the password
 * attributes. Returns the record if authentication succeeds; otherwise,
 * returns null.
 *
 * When password attributes are valid non-empty strings, authenticateBy
 * cryptographically digests them even if no matching record is found.
 * That mitigates timing-based enumeration attacks where an attacker can
 * determine if a passworded record exists even without knowing the
 * password. Invalid password inputs (nil, empty string, non-string) are
 * still short-circuited to `null` without hashing — they're not valid
 * Rails password values and the timing-attack channel only exists for
 * legitimate inputs.
 *
 * Raises an ArgumentError if the set of attributes doesn't contain at
 * least one password and one non-password attribute.
 */
export async function authenticateBy(
  this: typeof Base,
  attributes: Record<string, unknown> | { toH(): Record<string, unknown> },
): Promise<Base | null> {
  // Reject non-objects up front so a stray null/undefined produces a
  // clear error instead of "Cannot read properties of null (reading
  // 'toH')" deep in the call chain.
  if (attributes === null || typeof attributes !== "object") {
    throw new ArgumentError(
      "authenticateBy expects an object of attributes (or one with a toH() method)",
    );
  }
  // Convert to a plain object if the input has a `toH()` method
  // (trails' camelCase analog of Rails' `to_h`). trails is camelCase-only
  // — callers passing Ruby/Rails-shaped values must translate to `toH()`
  // at the boundary.
  const attrs =
    typeof (attributes as { toH?: unknown }).toH === "function"
      ? (attributes as { toH(): Record<string, unknown> }).toH()
      : (attributes as Record<string, unknown>);

  const passwordEntries: Array<[string, unknown]> = [];
  const identifierEntries: Array<[string, unknown]> = [];

  for (const [name, value] of Object.entries(attrs)) {
    // Check if this is a password attribute (the _digest variant exists but name doesn't)
    const digestName = `${name}_digest`;
    if (!(this as any).hasAttribute?.(name) && (this as any).hasAttribute?.(digestName)) {
      passwordEntries.push([name, value]);
    } else {
      identifierEntries.push([name, value]);
    }
  }

  if (passwordEntries.length === 0) {
    throw new ArgumentError("One or more password arguments are required");
  }
  if (identifierEntries.length === 0) {
    throw new ArgumentError("One or more finder arguments are required");
  }

  // Short-circuit: if any password is nil, empty, or not a string,
  // return null immediately. Intentional divergence from Rails:
  // Ruby's `to_s` coerces silently, but in TS a non-string value
  // (object, number) reaching PBKDF2 either throws or silently
  // stringifies to garbage like `[object Object]`. Treating it as
  // auth failure is safer than coercing.
  for (const [, value] of passwordEntries) {
    if (typeof value !== "string" || value === "") {
      return null;
    }
  }

  // Strip `undefined` identifier values before hitting findBy. trails'
  // PredicateBuilder treats `undefined` the same as `null` and emits
  // `IS NULL`, so a caller destructuring a missing field could otherwise
  // authenticate a record whose identifier is actually NULL. Re-check
  // the "at least one finder arg" invariant after filtering.
  const definedIdentifierEntries = identifierEntries.filter(([, v]) => v !== undefined);
  if (definedIdentifierEntries.length === 0) {
    throw new ArgumentError("One or more finder arguments are required");
  }

  const passwords = Object.fromEntries(passwordEntries);
  const identifiers = Object.fromEntries(definedIdentifierEntries);

  const record = await (this as any).findBy(identifiers);
  if (record) {
    // Authenticate every password attribute without early-exit. Mirrors
    // Rails: `record.public_send(:"authenticate_#{name}", value)` — if
    // the method doesn't exist, Ruby raises NoMethodError. Throwing here
    // matches that semantic and avoids a timing-attack channel where a
    // misconfigured model (digest column without hasSecurePassword)
    // silently shortcuts out of the hash work that the not-found path
    // always performs. Likewise, accumulate `allAuthenticated` rather
    // than `break`-ing on the first wrong password so multi-password
    // models spend the same hash-work whether the first or last password
    // is wrong (Rails uses `count == size` for the same reason).
    let allAuthenticated = true;
    for (const [name] of passwordEntries) {
      const value = passwords[name] as string;
      const methodName = `authenticate${camelize(name)}`;
      const authenticateMethod = (record as any)[methodName];
      if (typeof authenticateMethod !== "function") {
        throw new TypeError(
          `${(this as typeof Base).name}#${methodName} is not defined — ` +
            `did you call hasSecurePassword(model, "${name}")?`,
        );
      }
      if (!authenticateMethod.call(record, value)) {
        allAuthenticated = false;
        // Don't break — keep going so the hash work is independent
        // of which (or how many) passwords are wrong.
      }
    }
    return allAuthenticated ? record : null;
  } else {
    // Even if no record is found, hash the supplied passwords so the
    // not-found path takes comparable time to a successful authenticate.
    // Use `pbkdf2Async` here (rather than the sync hashPassword used by
    // the password setter) to prefer the threadpool path when the
    // crypto adapter supports it — important under login load and when
    // this path is the most-frequent caller. Adapters without an async
    // `pbkdf2` fall back to `pbkdf2Sync` wrapped in a deferred promise.
    const crypto = getCrypto();
    const salt = crypto.randomBytes(SALT_LENGTH);
    for (const [name] of passwordEntries) {
      const value = passwords[name] as string;
      // Result discarded — we only care about the elapsed CPU time.
      await pbkdf2Async(crypto, value, salt, ITERATIONS, KEY_LENGTH, "sha256");
    }
    return null;
  }
}

export { hashPassword as _hashPassword, verifyPassword as _verifyPassword };
