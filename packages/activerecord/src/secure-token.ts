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

/**
 * Add secure token generation to a model attribute.
 *
 * Mirrors: ActiveRecord::SecureToken.has_secure_token
 *
 * Usage:
 *   User.hasSecureToken('auth_token')
 *   User.hasSecureToken()  // defaults to 'token'
 *
 * Generates a unique token before create if the attribute is blank.
 * Adds a `regenerateToken()` (or `regenerateAuthToken()`) instance method.
 *
 * Rails reaches `generate_unique_secure_token` through `self.class` because
 * `SecureToken::ClassMethods` is included on `Base` (secure_token.rb:11); both
 * members are assigned onto `Base` the same way (base.ts).
 */
export function hasSecureToken(
  this: typeof Base,
  attribute: string = "token",
  options?: { length?: number; on?: "create" | "initialize" },
): void {
  const tokenLength = options?.length ?? MINIMUM_TOKEN_LENGTH;
  if (tokenLength < MINIMUM_TOKEN_LENGTH) {
    throw new MinimumLengthError(
      `Token requires a minimum length of ${MINIMUM_TOKEN_LENGTH} characters.`,
    );
  }

  // `define_method("regenerate_#{attribute}")` (secure_token.rb:49). The body is
  // `update!`, a validated save with callbacks and a timestamp bump, and it
  // returns that result rather than the token, as Rails' last expression does.
  const methodName =
    attribute === "token"
      ? "regenerateToken"
      : `regenerate${attribute.charAt(0).toUpperCase() + attribute.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;

  Object.defineProperty(this.prototype, methodName, {
    value: function (this: Base): Promise<true | undefined> {
      return this.updateBang({
        [attribute]: (this.constructor as typeof Base).generateUniqueSecureToken(tokenLength),
      });
    },
    writable: true,
    configurable: true,
  });

  // `set_callback on, on == :initialize ? :after : :before` (secure_token.rb:50).
  // The assignment goes through the property setter, not `_attributes.set`, so an
  // overridden `attribute=` observes the generated value as `send("#{attribute}=")` does.
  //
  // `on` defaults to "create" because that is the framework default
  // (active_record.rb:461 `self.generate_secure_token_on = :create`); the
  // `:initialize` value documented on `has_secure_token` is the railtie
  // (`load_defaults`) value, which only applies in a booted app, so Rails' own
  // SecureTokenTest runs against `:create` too.
  const generateIfBlank = (record: any): void => {
    if (record.isNewRecord() && !record.queryAttribute(attribute)) {
      record[attribute] = (record.constructor as typeof Base).generateUniqueSecureToken(
        tokenLength,
      );
    }
  };
  if (options?.on === "initialize") {
    this.afterInitialize(generateIfBlank);
  } else {
    this.beforeCreate(generateIfBlank);
  }
}

/**
 * Mirrors: ActiveRecord::SecureToken::ClassMethods#generate_unique_secure_token
 * (secure_token.rb:57).
 */
export function generateUniqueSecureToken(length: number = MINIMUM_TOKEN_LENGTH): string {
  return secureRandomBase58(length);
}
