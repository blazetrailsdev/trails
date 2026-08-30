/**
 * Ruby's `Symbol` (`vendor/ruby/symbol.c`) as trails spells it: a JS string
 * that KEEPS its leading colon (`":short"`). A JS `Symbol` is reserved for
 * private keys and brands, so the colon is what carries the discriminator Ruby
 * gets from the type — and it is how the value already renders through
 * `Symbol#inspect` (`vendor/ruby/string.c:11692` `sym_inspect`, which writes
 * the colon back in front of the name).
 *
 * Two members, because two questions are asked of the convention across the
 * tree: is this value a Symbol, and what is its name.
 */

/**
 * Ruby `Symbol === x` — the type test a `case`/`when Symbol` makes
 * (`vendor/ruby/symbol.c:954` `rb_sym2str` is what answers for one), spelled
 * against the colon convention above.
 *
 * Call sites: `i18n/src/backend/base.ts`, `backend/fallbacks.ts`,
 * `backend/simple.ts`, `backend/key-value.ts`,
 * `activemodel/src/validations/numericality.ts`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Symbol`, which Rails inherits
 * rather than defines.
 */
export function isSymbol(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(":");
}

/**
 * Ruby `Symbol#to_s` / `Symbol#name` — `vendor/ruby/symbol.c:954` `rb_sym2str`,
 * the frozen string representation NOT including the leading colon.
 *
 * Call sites: `i18n/src/backend/base.ts`'s `toS` and its `t()` key
 * interpolation.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Symbol#to_s`, which Rails inherits
 * rather than defines.
 */
export function symbolToS(sym: string): string {
  return sym.slice(1);
}
