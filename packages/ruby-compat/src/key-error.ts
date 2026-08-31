/**
 * Ruby's core `KeyError` (`vendor/ruby/error.c:3325`) — what `Hash#fetch`
 * raises for an absent key (`vendor/ruby/hash.c:2203` `rb_key_err_raise`).
 * `activesupport/src/core-ext/key-error.ts` is a re-export shim so
 * `@blazetrails/activesupport`'s public surface is unchanged.
 *
 * Callers pass the whole message, exactly as Ruby composes it: a Symbol key
 * renders `key not found: :expression`, a String key
 * `key not found: "expression"`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `KeyError`, which Rails inherits
 * rather than defines.
 */
export class KeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyError";
  }
}
