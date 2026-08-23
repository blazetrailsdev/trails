import { base58 } from "@blazetrails/activesupport";
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
 *
 * @missingRailsCall define_method — PERMANENT: Verified per-site (RFC 0106):
 *   `define_method("regenerate_#{attribute}")` (`secure_token.rb:49`) — JS has
 *   no `define_method`; the settled spelling is `Object.defineProperty` on the
 *   prototype.
 * @missingRailsCall set_callback — PERMANENT: Verified per-site (RFC 0106):
 *   `set_callback on, on == :initialize ? :after : :before`
 *   (`secure_token.rb:50`) — AR's callbacks in trails are registered on their
 *   own per-prototype registry (`callbacks.ts` `registerCallback`), not on an
 *   ActiveSupport `CallbackChain`, so ActiveSupport's `setCallback` has no chain
 *   named "create"/"initialize" to reach and the
 *   `beforeCreate`/`afterInitialize` helpers are the only route.
 */
export function hasSecureToken(
  this: typeof Base,
  attribute: string = "token",
  options?: { length?: number; on?: "create" | "initialize" },
): void {
  const length = options?.length ?? MINIMUM_TOKEN_LENGTH;
  if (length < MINIMUM_TOKEN_LENGTH) {
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
        [attribute]: (this.constructor as typeof Base).generateUniqueSecureToken({ length }),
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
      record[attribute] = (record.constructor as typeof Base).generateUniqueSecureToken({
        length,
      });
    }
  };
  // ActiveSupport::Callbacks' `setCallback(target, name, type, filter)` cannot
  // stand in for the Ruby `set_callback` here: AR's callbacks in trails are
  // registered on their own per-prototype registry (`callbacks.ts`
  // `registerCallback`), not on an ActiveSupport `CallbackChain`, so there is no
  // chain named "create"/"initialize" for it to reach.
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
export function generateUniqueSecureToken({
  length = MINIMUM_TOKEN_LENGTH,
}: { length?: number } = {}): string {
  return base58(length);
}
