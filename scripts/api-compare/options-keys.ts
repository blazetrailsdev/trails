// Option-key comparison for parity:api (advisory — never changes the parity %).
// The matcher pairs Ruby↔TS methods by name and arity.ts checks positional
// ranges; neither looks at the keys a method accepts inside an options hash.
// These helpers diff the two key sets for a name-matched pair.
//
// Both sides are UNDER-approximations of the same thing — the keys a body
// reads directly (dynamic access and keys consumed in callees are missed). The
// TS options TYPE is the second TS source: it says what a caller may pass, so a
// Ruby key absent from both is `missingInTs`. `extraInTs` is measured off the
// body's reads alone, since a shared options type declares every key any method
// on the surface accepts.

import { snakeToCamel } from "@blazetrails/parity/conventions";

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

/** A Ruby "option key" that names a positional parameter of the same method is
 *  not a real options-hash member — it's the positional arg being referenced.
 *  E.g. `new_column_definition(name, type, options)`: a regex named-capture
 *  (`/(?<type>…)/`) or a `super`-inherited read can leak `:type` into the symbol
 *  set even though `type` is the second positional arg. Such keys never belong
 *  in a TS options interface, so flagging them `missingInTs` is a false
 *  positive. The leak cannot be told from a real `options[:type]` read
 *  (mysql/schema_definitions.rb:69), so the name is dropped from the TS reads
 *  too: unmeasured on both sides rather than extra on one. Param names are
 *  normalized through the same pipeline as the keys so `inverse_of`-style
 *  spellings line up. */
function positionalSet(positionalParams: string[]): Set<string> {
  return new Set(positionalParams.map((p) => normalizeRubyKey(p)));
}

export interface OptionKeyDiff {
  /** Keys Ruby consumes that the TS options type doesn't expose and the TS body
   *  never reads (likely-real). */
  missingInTs: string[];
  /** Keys the TS body reads that Ruby's body never names — an invented arm. */
  extraInTs: string[];
}

/** Diff a Ruby option-symbol set against the TS side, after normalizing the
 *  Ruby symbols to TS naming. `tsKeys` are the options type's property names,
 *  `tsReads` the keys the TS body reads (extract-ts-api.ts `extractOptionReads`).
 *  `positionalParams` (Ruby param names of the method) are dropped from the Ruby
 *  side — see `positionalSet`. `keywordParams` are the Ruby method's named
 *  keywords (`def delegated_type(role, types:, **options)`, delegated_type.rb:231):
 *  the port takes them as members of the same trailing object, so a TS read of
 *  one is the keyword, not an extra key. Both result lists are sorted. */
export function diffOptionKeys(
  rubyKeys: string[],
  tsKeys: string[],
  positionalParams: string[] = [],
  tsReads: string[] = [],
  keywordParams: string[] = [],
): OptionKeyDiff {
  const positional = positionalSet(positionalParams);
  const ruby = new Set(
    rubyKeys
      .map(normalizeRubyKey)
      .filter(isPublicKey)
      .filter((k) => !positional.has(k)),
  );
  const keywords = new Set(keywordParams.map(normalizeRubyKey));
  const reads = new Set(
    tsReads.filter(isPublicKey).filter((k) => !keywords.has(k) && !positional.has(k)),
  );
  const ts = new Set([...tsKeys.filter(isPublicKey), ...reads]);
  return {
    missingInTs: [...ruby].filter((k) => !ts.has(k)).sort(),
    extraInTs: [...reads].filter((k) => !ruby.has(k)).sort(),
  };
}

export type OptionKeyVerdict =
  | { comparable: false }
  | { comparable: true; missingInTs: string[]; extraInTs: string[] };

/**
 * Verdict for a Ruby method's option keys against EVERY TS signature recorded
 * for its name (mirrors arity.ts `matchArityAgainst`). The mixin convention
 * (`static x = x`) splits a method's real options type from its 0-arg re-export
 * binding, so we UNION all non-null candidates, and likewise every body's
 * `reads`. `comparable: false` when no candidate carried a checkable options
 * type — nothing to diff. `positionalParams` (the Ruby method's positional param
 * names) are dropped from the Ruby side so a positional arg leaked into the
 * symbol set never false-positives (see `positionalSet`).
 *
 * A Ruby body that hands its options hash WHOLE to a callee
 * (`serializable_hash(options)`, serializers/json.rb:103) reads none of the
 * callee's keys, and neither does a TS body that forwards the same way — so a
 * pass-through is quiet with no special case, and a key the TS body reads
 * itself where Ruby's forwards is a real extra arm.
 */
export function matchOptionKeysAgainst(
  rubyKeys: string[],
  candidates: (string[] | null)[],
  positionalParams: string[] = [],
  reads: string[][] = [],
  keywordParams: string[] = [],
): OptionKeyVerdict {
  const checkable = candidates.filter((c): c is string[] => c !== null);
  if (checkable.length === 0) return { comparable: false };
  const tsUnion = [...new Set(checkable.flat())];
  const readUnion = [...new Set(reads.flat())];
  return {
    comparable: true,
    ...diffOptionKeys(rubyKeys, tsUnion, positionalParams, readUnion, keywordParams),
  };
}
