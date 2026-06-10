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
  options?: { length?: number; on?: "create" | "initialize" },
): void {
  const tokenLength = options?.length ?? MINIMUM_TOKEN_LENGTH;
  if (tokenLength < MINIMUM_TOKEN_LENGTH) {
    throw new MinimumLengthError(
      `Token requires a minimum length of ${MINIMUM_TOKEN_LENGTH} characters.`,
    );
  }

  // Mirrors Rails:
  //   set_callback on, on == :initialize ? :after : :before do
  //     if new_record? && !query_attribute(attribute)
  //       send("#{attribute}=", generate_unique_secure_token(length:))
  //     end
  //   end
  // Routing the assignment through the property setter (rather than
  // `_attributes.set`) lets a subclass that overrides `attribute=` observe the
  // generated value, exactly as Rails' `send("#{attribute}=", …)` does.
  //
  // Default `on` is "create" to match the ActiveRecord *framework* default —
  // `vendor/rails/activerecord/lib/active_record.rb:461` sets
  // `self.generate_secure_token_on = :create`. The `:initialize` value
  // documented on `has_secure_token` is the railtie/`load_defaults` value
  // (railtie.rb:40 also sets `:create` at the framework level), which is only
  // applied in a booted app — not in the AR test suite. Rails' own
  // SecureTokenTest therefore runs against `:create` (its tests `save` before
  // asserting the token), which is exactly what these ports do.
  const generateIfBlank = (record: any): void => {
    if (record.isNewRecord() && !record.queryAttribute(attribute)) {
      record[attribute] = generateToken(tokenLength);
    }
  };
  if (options?.on === "initialize") {
    modelClass.afterInitialize(generateIfBlank);
  } else {
    modelClass.beforeCreate(generateIfBlank);
  }

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
