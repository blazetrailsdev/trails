/**
 * KeyError — the error Ruby's core `Hash#fetch` raises for an absent key, with
 * the message `key not found: :name` (a Symbol key keeps its colon; a String
 * key is quoted). Ruby core, not Rails, so there is no Ruby file to mirror;
 * it lives beside {@link NameError} because trails' other Ruby-core error
 * analogues live in `core-ext/`.
 *
 * Callers pass the whole message, exactly as Ruby composes it, so a Symbol key
 * renders `key not found: :expression` and a String key
 * `key not found: "expression"`.
 */
export class KeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyError";
  }
}
