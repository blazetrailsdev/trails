import { StandardError } from "./standard-error.js";

/**
 * Ruby's core `KeyError` (`vendor/ruby/error.c:3325`) — what `Hash#fetch`
 * raises for an absent key (`vendor/ruby/hash.c:2203` `rb_key_err_raise`).
 * `@blazetrails/activesupport`'s index re-exports it, so that package's
 * public surface is unchanged.
 *
 * Callers pass the whole message, exactly as Ruby composes it: a Symbol key
 * renders `key not found: :expression`, a String key
 * `key not found: "expression"`.
 *
 * Ruby's chain is `KeyError < IndexError < StandardError`; ruby-compat has no
 * `IndexError` class, so this extends `StandardError` directly.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `KeyError`, which Rails inherits
 * rather than defines.
 */
export class KeyError extends StandardError {
  constructor(message: string) {
    super(message);
    this.name = "KeyError";
  }
}
