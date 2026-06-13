// Option-key comparison for api:compare (advisory — never changes the parity %).
// The matcher pairs Ruby↔TS methods by name and arity.ts checks positional
// ranges; neither looks at the keys a method accepts inside an options hash.
// These helpers diff the two key sets for a name-matched pair.
//
// The Ruby side is an UNDER-approximation (only keys read directly in the body
// are seen — dynamic access and keys consumed in callees are missed), so
// `missingInTs` is the likely-real finding and `extraInTs` is informational.

import { snakeToCamel } from "./conventions.js";

/** Known Ruby-option-symbol → TS-property renames the camelization can't derive.
 *  Keyed by the raw Ruby symbol. Keep this minimal and evidence-backed — each
 *  entry suppresses a confirmed false `missingInTs`, not a guess. */
const OPTION_KEY_RENAMES: Record<string, string> = {
  // `constructor` is reserved as a JS object-property name, so the port spells
  // Ruby's `:constructor` option as `constructorFn` (see aggregations.ts).
  constructor: "constructorFn",
};

/** Normalize a raw Ruby option symbol to its TS spelling (`inverse_of` →
 *  `inverseOf`) via the same rename pipeline method names flow through, then
 *  apply any known non-derivable rename. */
export function normalizeRubyKey(sym: string): string {
  return OPTION_KEY_RENAMES[sym] ?? snakeToCamel(sym);
}

/** Leading-underscore keys are implementation-internal on both sides (TS
 *  `_skipValidateOptions`, `_usesLegacyIndexName`; Ruby `:_foo`), not part of
 *  the public option contract — exclude them from the diff so they never
 *  surface as findings. */
function isPublicKey(key: string): boolean {
  return !key.startsWith("_");
}

export interface OptionKeyDiff {
  /** Keys Ruby consumes that the TS options type doesn't expose (likely-real). */
  missingInTs: string[];
  /** Keys the TS type exposes that Ruby's body never names (informational). */
  extraInTs: string[];
}

/** Diff a Ruby option-symbol set against a resolved TS key set, after
 *  normalizing the Ruby symbols to TS naming. Both result lists are sorted. */
export function diffOptionKeys(rubyKeys: string[], tsKeys: string[]): OptionKeyDiff {
  const ruby = new Set(rubyKeys.map(normalizeRubyKey).filter(isPublicKey));
  const ts = new Set(tsKeys.filter(isPublicKey));
  return {
    missingInTs: [...ruby].filter((k) => !ts.has(k)).sort(),
    extraInTs: [...ts].filter((k) => !ruby.has(k)).sort(),
  };
}

export type OptionKeyVerdict =
  | { comparable: false }
  | { comparable: true; missingInTs: string[]; extraInTs: string[] };

/**
 * Verdict for a Ruby method's option keys against EVERY TS signature recorded
 * for its name (mirrors arity.ts `matchArityAgainst`). The mixin convention
 * (`static x = x`) splits a method's real options type from its 0-arg re-export
 * binding, so we UNION all non-null candidates. `comparable: false` when no
 * candidate carried a checkable options type — nothing to diff.
 */
export function matchOptionKeysAgainst(
  rubyKeys: string[],
  candidates: (string[] | null)[],
): OptionKeyVerdict {
  const checkable = candidates.filter((c): c is string[] => c !== null);
  if (checkable.length === 0) return { comparable: false };
  const tsUnion = [...new Set(checkable.flat())];
  const { missingInTs, extraInTs } = diffOptionKeys(rubyKeys, tsUnion);
  return { comparable: true, missingInTs, extraInTs };
}
