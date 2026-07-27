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
  // `none?` is `!any?`: the `some` analogue must be NEGATED (see
  // NEGATED_ALIASES), while `every` is the de-Morgan form `!xs.every(...)` OR
  // `xs.every((x) => !p(x))`, so it counts either way.
  ["none?", ["some", "every"]],
  ["one?", ["filter"]],
  // `includes` is omitted here on purpose: it is now a naming-convention
  // candidate for these two (CONTAINMENT_PREDICATE_ALIASES in conventions.ts),
  // and conventions.test.ts fails on an alias the conventions already produce.
  ["include?", ["has"]],
  ["member?", ["has"]],
  // ActiveSupport's `exclude?` is `!include?`, so the containment call is the
  // whole call — ports spell it `!xs.includes(y)` / `!set.has(y)`, and the
  // leading `!` IS required (see NEGATED_ALIASES). (The convention
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

/**
 * Aliases whose faithful port carries a leading `!` — the Ruby call is the
 * NEGATION of that JS analogue, so only a NEGATED TS call counts:
 * `none?` → `!xs.some(p)`, `exclude?` → `!xs.includes(y)` / `!set.has(y)`.
 * Without this, a port that INVERTED the condition (a bare `xs.includes(y)`
 * where Rails wrote `exclude?`) silenced the wide ratchet just as well as the
 * faithful one.
 *
 * Keyed per-ALIAS, not per Ruby call, because a negating Ruby call can also
 * have a de-Morgan analogue that is faithful UNnegated: `xs.none?(&:dirty?)`
 * ports to `xs.every((t) => !t.isDirty())` (transaction.ts `isRestorable`),
 * where the `!` sits inside the callback, not on the call. So `none? → every`
 * stays a direct alias while `none? → some` requires the marker.
 */
export const NEGATED_ALIASES = new Map<string, Set<string>>([
  ["none?", new Set(["some"])],
  ["exclude?", new Set(["includes", "has"])],
]);

/**
 * Prefix the TS extractor uses to mark a call it saw in a NEGATED position
 * (`!xs.includes(y)` → `!includes`). Marked names are recorded IN ADDITION to
 * the plain name, so every consumer that tests membership by plain name is
 * unaffected; only the {@link NEGATED_ALIASES} check reads the marked form.
 * Lives here, not in extract-ts-api.ts, so compare.ts can read it without
 * importing the extractor (and its TypeScript-compiler dependency).
 */
export const NEGATED_CALL_PREFIX = "!";

/** Whether alias `tsCall` counts for `rubyCall` only when the TS call is negated. */
export function requiresNegatedAlias(rubyCall: string, tsCall: string): boolean {
  return NEGATED_ALIASES.get(rubyCall)?.has(tsCall) ?? false;
}

/**
 * Split a raw TS call-set into the plain call names and the names the extractor
 * saw in a NEGATED position (`!includes` → `includes`). The marked entries are
 * kept OUT of the plain set: they are a second record of a call already in it,
 * so leaving them in would double-count against DELEGATION_MAX_CALLS in
 * `isDelegatingWrapper` (compare.ts) and make wrapper detection body-shape dependent.
 */
export function partitionNegatedCalls(raw: Iterable<string>): {
  calls: Set<string>;
  negated: Set<string>;
} {
  const calls = new Set<string>();
  const negated = new Set<string>();
  for (const c of raw) {
    if (c.startsWith(NEGATED_CALL_PREFIX)) negated.add(c.slice(NEGATED_CALL_PREFIX.length));
    else calls.add(c);
  }
  return { calls, negated };
}
