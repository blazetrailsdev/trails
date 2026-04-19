import { getCrypto } from "@blazetrails/activesupport";
import type { Base } from "./base.js";

/**
 * Raised when `hasSecureToken` is configured with a length below the
 * allowed minimum (24).
 *
 * Mirrors: ActiveRecord::SecureToken::MinimumLengthError
 */
export class MinimumLengthError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "MinimumLengthError";
  }
}

/**
 * Generate a unique random token.
 *
 * Mirrors: SecureRandom.base58(24) used by has_secure_token
 */
function generateToken(length: number = 24): string {
  const bytes = getCrypto().randomBytes(length);
  // Base36 encoding (0-9, a-z) for URL-safe tokens
  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, "0").slice(-2))
    .join("")
    .slice(0, length);
}

/**
 * Add secure token generation to a model attribute.
 *
 * Mirrors: ActiveRecord::SecureToken.has_secure_token
 *
 * Usage:
 *   hasSecureToken(User, 'auth_token')
 *   hasSecureToken(User)  // defaults to 'token'
 *
 * Generates a unique token before create if the attribute is blank.
 * Adds a `regenerateToken()` (or `regenerateAuthToken()`) instance method.
 */
const MINIMUM_TOKEN_LENGTH = 24;

export function hasSecureToken(
  modelClass: typeof Base,
  attribute: string = "token",
  options?: { length?: number },
): void {
  const tokenLength = options?.length ?? MINIMUM_TOKEN_LENGTH;
  if (tokenLength < MINIMUM_TOKEN_LENGTH) {
    throw new MinimumLengthError(
      `Token requires a minimum length of ${MINIMUM_TOKEN_LENGTH} characters.`,
    );
  }

  // Before create: auto-generate token if blank
  modelClass.beforeCreate((record: any) => {
    if (!record.readAttribute(attribute)) {
      record._attributes.set(attribute, generateToken(tokenLength));
    }
  });

  // Instance method to regenerate the token
  const methodName =
    attribute === "token"
      ? "regenerateToken"
      : `regenerate${attribute.charAt(0).toUpperCase() + attribute.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;

  Object.defineProperty(modelClass.prototype, methodName, {
    value: async function (this: Base): Promise<string> {
      const newToken = generateToken(tokenLength);
      this._attributes.set(attribute, newToken);
      await this.updateColumn(attribute, newToken);
      return newToken;
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Mirrors: ActiveRecord::SecureToken::ClassMethods#generate_unique_secure_token
 */
export function generateUniqueSecureToken(length: number = 24): string {
  return generateToken(length);
}
