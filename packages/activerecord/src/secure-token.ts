import { secureRandomBase58 } from "@blazetrails/activesupport/key-generator";
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

const MINIMUM_TOKEN_LENGTH = 24;

/** `ActiveRecord::SecureToken::ClassMethods` (secure_token.rb:11). */
interface ClassMethods {
  generateUniqueSecureToken(length?: number): string;
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
 *
 * Rails reaches `generate_unique_secure_token` through `self.class` because
 * `SecureToken::ClassMethods` is included on `Base` (secure_token.rb:11).
 * trails keeps this module behind the `/secure-token` subpath — it needs
 * crypto, which `index.ts` cannot pull in (index.ts:280) — so the class method
 * is installed from here instead, guarded by `in` (not `hasOwnProperty`) so a
 * model that already overrides it, anywhere in the chain, is never clobbered.
 */
export function hasSecureToken(
  modelClass: typeof Base,
  attribute: string = "token",
  options?: { length?: number; on?: "create" | "initialize" },
): void {
  if (!("generateUniqueSecureToken" in modelClass)) {
    (modelClass as typeof Base & ClassMethods).generateUniqueSecureToken =
      generateUniqueSecureToken;
  }

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
      record[attribute] = (
        record.constructor as typeof Base & ClassMethods
      ).generateUniqueSecureToken(tokenLength);
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
    value: function (this: Base): Promise<true | undefined> {
      const newToken = (this.constructor as typeof Base & ClassMethods).generateUniqueSecureToken(
        tokenLength,
      );
      // Mirrors Rails: `update! attribute => generate_unique_secure_token(...)`
      // (secure_token.rb:53) — a full validated save with callbacks and a
      // timestamp bump, not a direct-SQL `update_column` that bypasses them.
      // The method returns the `update!` result (Rails' last expression), not
      // the token value, so callers see the same `true`/raise contract.
      return this.updateBang({ [attribute]: newToken });
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Mirrors: ActiveRecord::SecureToken::ClassMethods#generate_unique_secure_token
 * (secure_token.rb:57).
 */
export function generateUniqueSecureToken(length: number = MINIMUM_TOKEN_LENGTH): string {
  return secureRandomBase58(length);
}
