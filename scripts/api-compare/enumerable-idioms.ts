/**
 * Single source of truth for Ruby Enumerable/Comparable idioms whose faithful
 * port is a native JS method spelled DIFFERENTLY. Two api-compare tools consume
 * it (RFC 0025), so it lives here rather than in a copy each keeps in sync:
 *   - compare.ts's wide call ratchet counts the analogue (`some` for `any?`) as
 *     making the Ruby call, so a faithful port isn't flagged as an omission;
 *   - lint-calls.ts's call-graph lint treats the KEYS as noise — Ruby records
 *     them as calls but the port is a native JS method, not a ported internal.
 *
 * A value lists ONLY the differently-named spelling: the naming-convention name
 * (`rubyMethodToTs`) is already a candidate, so `select` needs just ["filter"].
 * Each alias must be the WHOLE call's analogue, never a building block —
 * `min_by → reduce` would let any reduce silence a dropped min_by, so such loose
 * pairs are deliberately absent. Aliases are consulted only to decide whether a
 * TS body already makes a call; they never widen which Ruby calls count as
 * ported, so adding one can never introduce a new mismatch.
 */
export const JS_ENUMERABLE_ALIASES = new Map<string, string[]>([
  ["any?", ["some"]],
  ["all?", ["every"]],
  ["none?", ["some", "every"]],
  ["one?", ["filter"]],
  // `includes` is omitted here on purpose: it is now a naming-convention
  // candidate for these two (CONTAINMENT_PREDICATE_ALIASES in conventions.ts),
  // and conventions.test.ts fails on an alias the conventions already produce.
  ["include?", ["has"]],
  ["member?", ["has"]],
  // ActiveSupport's `exclude?` is `!include?`, so the containment call is the
  // whole call — ports spell it `!xs.includes(y)` / `!set.has(y)`. As with
  // `none? → some/every` above, the ratchet only checks that the file makes a
  // call by that NAME; the leading `!` is not verified. (The convention
  // candidate for a method NAMED `exclude?` is `excludes`, so no overlap.)
  ["exclude?", ["includes", "has"]],
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
  // Ruby Array#concat mutates the receiver → JS `push(...xs)`; Array#concat's
  // new-array return is NOT the analogue.
  ["concat", ["push"]],
]);

/** JS-native call names that count as making Ruby call `rubyCall`. */
export function jsEnumerableAliases(rubyCall: string): string[] {
  return JS_ENUMERABLE_ALIASES.get(rubyCall) ?? [];
}
