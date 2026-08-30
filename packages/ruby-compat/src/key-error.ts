/**
 * Ruby's core `KeyError` — the error `Hash#fetch` raises for an absent key
 * (`vendor/ruby/hash.c:2203` `rb_key_err_raise`, the class itself
 * `vendor/ruby/error.c:3325`), with the message
 * `key not found: :name` (a Symbol key keeps its colon; a String key is
 * quoted).
 *
 * Ruby core, not Rails, so no Rails file declares it;
 * `activesupport/src/core-ext/key-error.ts` is a re-export shim so
 * `@blazetrails/activesupport`'s public surface is unchanged.
 *
 * Callers pass the whole message, exactly as Ruby composes it, so a Symbol key
 * renders `key not found: :expression` and a String key
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
