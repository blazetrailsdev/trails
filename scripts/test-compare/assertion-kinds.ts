// Normalizes Rails assertion method names and trails (vitest) matcher names to a
// shared set of *canonical kinds* so parity:test can compare not just how MANY
// assertions a matched pair makes (see `assertionCount` in compare.ts) but
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
  | "instanceOf"
  | "respondTo"
  | "notRespondTo"
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
  respondTo: "notRespondTo",
  notRespondTo: "respondTo",
  // `expect(() => …).not.toThrow()` is the port of `assert_nothing_raised`,
  // which minitest spells as its own assertion rather than as `refute_raises`.
  raises: "nothingRaised",
  nothingRaised: "raises",
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
  assert_raise_with_message: "raises",
  assert_nothing_raised: "nothingRaised",
  assert_same: "same",
  assert_not_same: "notSame",
  refute_same: "notSame",
  // Minitest defines `assert_predicate obj, meth` as `assert obj.send(meth)`
  // and `refute_predicate` as `refute obj.send(meth)`
  // (minitest/lib/minitest/assertions.rb), so their canonical kinds are the
  // truthiness pair — there is no separate "call this predicate" assertion for
  // a TS port to mirror, and `expect(obj.pred).toBeTruthy()` IS the twin.
  assert_predicate: "truthy",
  assert_not_predicate: "falsy",
  refute_predicate: "falsy",
  assert_instance_of: "instanceOf",
  assert_kind_of: "instanceOf",
  assert_respond_to: "respondTo",
  assert_not_respond_to: "notRespondTo",
  refute_respond_to: "notRespondTo",
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

// Rails-side assertion helpers defined by the arel suite itself rather than by
// Minitest, resolved to the builtin they delegate to.
const AREL_HELPER_ALIAS: Record<string, string> = {
  // `sql.must_be_like other` squeezes runs of whitespace and strips BOTH
  // operands, then `must_equal`
  // (vendor/rails/activerecord/test/cases/arel/helper.rb:10-13).
  must_be_like: "assert_equal",
  // `assert_edge(name, dot)` is `assert_match(/->.*label="name"/, dot)`
  // (vendor/rails/activerecord/test/cases/arel/visitors/dot_test.rb:13-15).
  assert_edge: "assert_match",
};

/**
 * trails-side `must*`-named helpers that are NOT assertions, and so must not be
 * counted as one by the TS extractor's `must*` prefix rule.
 *
 * The Ruby `must_be_like` above IS an assertion — it squeezes whitespace and
 * then delegates to `must_equal` (helper.rb:10-13), which is why it aliases to
 * `assert_equal` in AREL_HELPER_ALIAS. The trails port splits those two halves:
 * `packages/arel/src/test-helpers/must-be-like.ts` keeps only the squeezing,
 * and a native `expect(mustBeLike(a)).toBe(mustBeLike(b))` does the asserting.
 * The terminal `toBe` is therefore the whole assertion, and counting the two
 * normalizer calls beside it scores one Rails assertion as three.
 *
 * This lives next to AREL_HELPER_ALIAS because it is the same fact about the
 * same Rails helper, read from the other side: the Ruby name maps to an
 * assertion, the TS name deliberately does not.
 */
export const NON_ASSERTION_TRAILS_HELPERS = new Set(["mustBeLike"]);

// Minitest spec-form expectations whose builtin twin is NOT the bare
// `assert_<suffix>`/`refute_<suffix>` the prefix rewrite in normalizeRailsKind
// produces: `must_be_kind_of` is `assert_kind_of`, not `assert_be_kind_of`.
// Resolving to the builtin NAME (as minitest/expectations.rb itself does) keeps
// RAILS_MAP the single source of canonical kinds. The `wont_be_*` forms with no
// entry here — `wont_be_kind_of`, `wont_be`, `wont_be_close_to` — have no
// negated twin in RAILS_MAP either (`refute_kind_of`, `refute_operator`), so
// they stay unmapped, exactly as their `refute_*` spellings already do.
const SPEC_FORM_ALIAS: Record<string, string> = {
  must_be_nil: "assert_nil",
  must_include: "assert_includes",
  wont_include: "refute_includes",
  wont_be_nil: "refute_nil",
  must_be_empty: "assert_empty",
  wont_be_empty: "refute_empty",
  must_be_kind_of: "assert_kind_of",
  must_be_instance_of: "assert_instance_of",
  must_be_same_as: "assert_same",
  wont_be_same_as: "refute_same",
  must_be: "assert_operator",
  must_be_close_to: "assert_in_delta",
  must_be_within_delta: "assert_in_delta",
};

/**
 * Normalize a raw Rails assertion method name (`assert_equal`, `refute_nil`,
 * `must_equal`, …) to a canonical kind, or `null` when there is no mapped twin.
 * Handles the minitest `must_*`/`wont_*` spec forms — which arel's suite uses
 * throughout, `Arel::Spec < Minitest::Spec`
 * (vendor/rails/activerecord/test/cases/arel/helper.rb:29) — by resolving them
 * to their `assert_*`/`refute_*` builtin before lookup, via SPEC_FORM_ALIAS for
 * the `must_be_*` family and the bare prefix rewrite for the rest.
 */
export function normalizeRailsKind(name: string): CanonicalKind | null {
  const builtin = AREL_HELPER_ALIAS[name] ?? SPEC_FORM_ALIAS[name] ?? name;
  const direct = RAILS_MAP[builtin];
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
  let kind: CanonicalKind | null = TRAILS_MAP[bare] ?? null;
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
 * Kinds the histogram diff folds onto a coarser twin, on BOTH sides.
 *
 * Identity folds onto equality: `assert_same` is `Object.is`, which vitest
 * spells `toBe` — the very matcher a port also uses for `assert_equal` on a
 * primitive — so TRAILS_MAP scores `toBe` as `equal` and the only trails
 * spelling that scores `same` is the `assertSame` helper
 * (activesupport/src/testing/assertions.ts:605). A package activesupport
 * itself depends on — i18n, date, ruby-compat — cannot import that helper, so
 * without the fold every faithful port of an `assert_same` down there is a
 * permanent false mismatch. Folding both sides leaves an `assertSame` port
 * matching too. The value comparer normalizes separately and still tells the
 * two apart.
 */
const HISTOGRAM_FOLD: Partial<Record<CanonicalKind, CanonicalKind>> = {
  same: "equal",
  notSame: "notEqual",
};

/**
 * Fold a list of raw kind tokens into a normalized-kind histogram, collecting
 * the tokens that don't map. `side` selects the normalizer.
 */
export function buildHistogram(kinds: string[], side: "rails" | "trails"): KindHistogram {
  const normalize = side === "rails" ? normalizeRailsKind : normalizeTrailsKind;
  const histogram: Record<string, number> = {};
  const unmapped = new Set<string>();
  for (const raw of kinds) {
    const normalized = normalize(raw);
    const canonical = normalized ? (HISTOGRAM_FOLD[normalized] ?? normalized) : normalized;
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
