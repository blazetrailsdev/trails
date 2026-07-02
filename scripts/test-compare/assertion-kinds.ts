// Normalizes Rails assertion method names and trails (vitest) matcher names to a
// shared set of *canonical kinds* so test:compare can compare not just how MANY
// assertions a matched pair makes (see `assertionCount` in test-compare.ts) but
// WHAT each one checks. A count match can hide a semantic divergence: Rails
// `assert_equal x, foo` (equality) vs trails `expect(foo).toBeTruthy()`
// (truthiness) both count 1, but assert different things.
//
// The mapping is deliberately partial. Kinds with no cross-side twin normalize
// to `null` and are surfaced as *unmapped* (informational) rather than forced
// into a bucket — see UNMAPPED handling in buildHistogram. This keeps the diff
// honest: an unmapped kind is "we can't compare this", not "these match".

/**
 * Canonical assertion category. A small, closed vocabulary both a Rails
 * `assert_*`/`refute_*` name and a trails matcher (`toEqual`, `toBeNull`, …) can
 * normalize onto. Anything outside this set is treated as unmapped.
 */
export type CanonicalKind =
  | "equal"
  | "notEqual"
  | "nil"
  | "notNil"
  | "truthy"
  | "falsy"
  | "empty"
  | "notEmpty"
  | "includes"
  | "excludes"
  | "match"
  | "noMatch"
  | "raises"
  | "nothingRaised"
  | "same"
  | "notSame"
  | "predicate"
  | "notPredicate"
  | "instanceOf"
  | "respondTo"
  | "operator"
  | "length"
  | "inDelta";

// Pairs a canonical kind with its logical negation, used to fold a trails
// `not:` chain (`expect(x).not.toBeNull()`) onto the negated category so it
// lines up with Rails' `assert_not_*`/`refute_*` twin.
const NEGATION: Partial<Record<CanonicalKind, CanonicalKind>> = {
  equal: "notEqual",
  notEqual: "equal",
  nil: "notNil",
  notNil: "nil",
  truthy: "falsy",
  falsy: "truthy",
  empty: "notEmpty",
  notEmpty: "empty",
  includes: "excludes",
  excludes: "includes",
  match: "noMatch",
  noMatch: "match",
  same: "notSame",
  notSame: "same",
  predicate: "notPredicate",
  notPredicate: "predicate",
};

// Rails minitest assertion method name → canonical kind. `refute_*` is minitest's
// negated `assert_*`; the spec forms (`must_*`/`wont_*`) are handled by the
// prefix-stripping fallback in normalizeRailsKind so the map stays small.
const RAILS_MAP: Record<string, CanonicalKind> = {
  assert_equal: "equal",
  assert_not_equal: "notEqual",
  refute_equal: "notEqual",
  assert_nil: "nil",
  assert_not_nil: "notNil",
  refute_nil: "notNil",
  assert: "truthy",
  assert_not: "falsy",
  refute: "falsy",
  assert_empty: "empty",
  assert_not_empty: "notEmpty",
  refute_empty: "notEmpty",
  assert_includes: "includes",
  assert_not_includes: "excludes",
  refute_includes: "excludes",
  assert_match: "match",
  assert_no_match: "noMatch",
  refute_match: "noMatch",
  assert_raises: "raises",
  assert_raise: "raises",
  assert_nothing_raised: "nothingRaised",
  assert_same: "same",
  assert_not_same: "notSame",
  refute_same: "notSame",
  assert_predicate: "predicate",
  assert_not_predicate: "notPredicate",
  refute_predicate: "notPredicate",
  assert_instance_of: "instanceOf",
  assert_kind_of: "instanceOf",
  assert_respond_to: "respondTo",
  assert_operator: "operator",
  assert_in_delta: "inDelta",
};

// trails/vitest matcher name → canonical kind. The extractor hands us the
// terminal matcher of an `expect(...).matcher(...)` chain (a `not:` prefix marks
// a negated chain, folded via NEGATION in normalizeTrailsKind).
const TRAILS_MAP: Record<string, CanonicalKind> = {
  toEqual: "equal",
  toStrictEqual: "equal",
  // `toBe` is `Object.is` (identity for non-primitives), semantically closer to
  // Rails `assert_same` than `assert_equal` when comparing objects. We map it to
  // `equal` anyway: in practice ports use `toBe` for value equality on
  // primitives, and where a port used `toBe` for a Rails `assert_same` the
  // histogram surfaces a false *mismatch* (equal vs same), never a false match —
  // the safe direction. Do not "fix" this to `same` without checking call sites.
  toBe: "equal",
  toBeNull: "nil",
  toBeUndefined: "nil",
  toBeDefined: "notNil",
  toBeTruthy: "truthy",
  toBeFalsy: "falsy",
  toContain: "includes",
  toContainEqual: "includes",
  toMatch: "match",
  toMatchObject: "match",
  toThrow: "raises",
  toThrowError: "raises",
  toBeInstanceOf: "instanceOf",
  toHaveLength: "length",
  toBeGreaterThan: "operator",
  toBeGreaterThanOrEqual: "operator",
  toBeLessThan: "operator",
  toBeLessThanOrEqual: "operator",
  toBeCloseTo: "inDelta",
};

/**
 * Normalize a raw Rails assertion method name (`assert_equal`, `refute_nil`,
 * `must_equal`, …) to a canonical kind, or `null` when there is no mapped twin.
 * Handles the minitest `must_*`/`wont_*` spec forms by rewriting them to their
 * `assert_*`/`refute_*` equivalents before lookup.
 */
export function normalizeRailsKind(name: string): CanonicalKind | null {
  const direct = RAILS_MAP[name];
  if (direct) return direct;
  // Spec forms: `must_equal` ~ `assert_equal`, `wont_equal` ~ `refute_equal`.
  const must = /^must_(.+)$/.exec(name);
  if (must) return RAILS_MAP[`assert_${must[1]}`] ?? null;
  const wont = /^wont_(.+)$/.exec(name);
  if (wont) return RAILS_MAP[`refute_${wont[1]}`] ?? RAILS_MAP[`assert_not_${wont[1]}`] ?? null;
  return null;
}

/**
 * Normalize a raw trails kind token to a canonical kind, or `null` when
 * unmapped. A token is either a matcher name (`toEqual`) or a `not:`-prefixed
 * matcher (`not:toBeNull`, from an `expect(x).not.toBeNull()` chain), or a
 * trails `assert*`/`refute*`/`expect*` helper callee that mirrors a Rails name.
 */
export function normalizeTrailsKind(token: string): CanonicalKind | null {
  const neg = token.startsWith("not:");
  const bare = neg ? token.slice("not:".length) : token;
  let kind = TRAILS_MAP[bare] ?? null;
  // A helper callee that mirrors a Rails assertion name (refuteEqual, mustEqual,
  // assertNoQueries, …) — snake-case it and reuse the Rails normalizer.
  if (!kind && /^(assert|refute|must|wont|expect)/.test(bare)) {
    kind = normalizeRailsKind(camelToSnake(bare));
  }
  if (kind && neg) return NEGATION[kind] ?? kind;
  return kind;
}

function camelToSnake(name: string): string {
  return name.replace(/([A-Z])/g, (_m, c: string) => `_${c.toLowerCase()}`);
}

/** A normalized assertion-kind histogram plus the raw kinds that didn't map. */
export interface KindHistogram {
  /** canonical kind → count */
  histogram: Record<string, number>;
  /** raw kind tokens with no mapped twin (deduped, sorted) — informational */
  unmapped: string[];
}

/**
 * Fold a list of raw kind tokens into a normalized-kind histogram, collecting
 * the tokens that don't map. `side` selects the normalizer.
 */
export function buildHistogram(kinds: string[], side: "rails" | "trails"): KindHistogram {
  const normalize = side === "rails" ? normalizeRailsKind : normalizeTrailsKind;
  const histogram: Record<string, number> = {};
  const unmapped = new Set<string>();
  for (const raw of kinds) {
    const canonical = normalize(raw);
    if (canonical) histogram[canonical] = (histogram[canonical] ?? 0) + 1;
    else unmapped.add(raw);
  }
  return { histogram, unmapped: [...unmapped].sort() };
}

/** Per-canonical-kind count delta between a Rails and trails histogram. */
export interface KindDelta {
  kind: string;
  rails: number;
  trails: number;
}

/**
 * Diff two normalized histograms. Returns the per-kind deltas where the counts
 * differ (sorted by kind). Empty when the mapped kinds line up exactly — the
 * unmapped tokens are reported separately and never make a pair "divergent".
 */
export function diffHistograms(
  rails: Record<string, number>,
  trails: Record<string, number>,
): KindDelta[] {
  const kinds = new Set([...Object.keys(rails), ...Object.keys(trails)]);
  const deltas: KindDelta[] = [];
  for (const kind of [...kinds].sort()) {
    const r = rails[kind] ?? 0;
    const t = trails[kind] ?? 0;
    if (r !== t) deltas.push({ kind, rails: r, trails: t });
  }
  return deltas;
}
