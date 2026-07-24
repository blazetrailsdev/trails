/**
 * Single source of truth for Ruby Enumerable/Comparable idioms whose faithful
 * TypeScript port is a native JS method — usually spelled differently.
 *
 * Two api-compare tools consume this knowledge, and before RFC 0025 each kept
 * its own hand-maintained copy that drifted:
 *   - compare.ts's WIDE call ratchet (JS_ENUMERABLE_ALIASES): when the TS body
 *     calls the differently-named analogue (`some` for `any?`), that counts as
 *     making the Ruby call, so the omission isn't flagged.
 *   - lint-calls.ts's internal call-graph lint (SKIP_CALLS): these idiom names
 *     are noise — Ruby records them as calls but the port is a native JS method,
 *     not a ported internal — so they're skipped when diffing call-sets.
 *
 * The map's KEYS are the Ruby idiom names both tools care about; the VALUES are
 * the differently-named JS spellings the wide ratchet accepts. Entries list
 * ONLY the differently-named JS spelling: the naming-convention name (from
 * `rubyMethodToTs`) is already a candidate, so `select → filter` needs just
 * ["filter"]. Every alias must be the whole call's analogue, not merely a
 * plausible building block — `min_by → reduce` would let any reduce anywhere
 * silence a dropped min_by, so such loose pairs are deliberately absent.
 *
 * `rubyMethodToTs` is a pure naming-convention mapper, so it turns `any?` into
 * ["isAny", "any"] and never into `some` — without these aliases the wide gate
 * (which admits every call name) would flag `_connections.some(...)` as failing
 * to call `any?`, even though it is the exact analogue. The aliases are consulted
 * ONLY when deciding whether the TS body already makes the call; they never
 * widen which Ruby calls are considered ported, so adding one can never
 * introduce a new mismatch.
 */
export const JS_ENUMERABLE_ALIASES = new Map<string, string[]>([
  ["any?", ["some"]],
  ["all?", ["every"]],
  ["none?", ["some", "every"]],
  ["one?", ["filter"]],
  ["include?", ["includes", "has"]],
  ["member?", ["includes", "has"]],
  ["key?", ["has"]],
  ["has_key?", ["has"]],
  ["select", ["filter"]],
  ["reject", ["filter"]],
  ["detect", ["find"]],
  ["collect", ["map"]],
  ["collect_concat", ["flatMap"]],
  ["each", ["forEach"]],
  ["inject", ["reduce"]],
  ["index", ["indexOf", "findIndex"]],
  ["find_index", ["indexOf"]],
  ["sort_by", ["sort"]],
  // Ruby Array#concat mutates the receiver; the JS port is `push(...xs)`
  // (Array#concat returns a new array, so it is NOT the analogue).
  ["concat", ["push"]],
]);

/** JS-native call names that count as making Ruby call `rubyCall`. */
export function jsEnumerableAliases(rubyCall: string): string[] {
  return JS_ENUMERABLE_ALIASES.get(rubyCall) ?? [];
}
