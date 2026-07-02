// Phase 3 of test:compare's assertion comparison (after count in test-compare.ts
// and normalized *kind* in assertion-kinds.ts): compare the literal EXPECTED
// VALUE each mapped assertion checks. A kind histogram treats `assert_equal 5,
// foo` / `expect(foo).toEqual(5)` and `assert_equal 3, foo` /
// `expect(foo).toEqual(4)` as identical (both `{equal: 1}`), yet the second pair
// asserts different constants — a fidelity gap only a value comparison catches.
//
// The extractors (extract-ts-core.ts / extract-ruby-tests.rb) emit an
// `assertionValues` array in lockstep with `assertionKinds`: for each assertion,
// a normalized literal token (see the encoding below) when the expected argument
// is a literal, or `null` when it is a computed expression/variable we can't
// statically compare. This module folds those into per-kind value multisets and
// diffs them.
//
// Literal token encoding (a tagged string so `5` the number and `"5"` the string
// never collide): `n:<num>` number, `s:<text>` string, `b:true`/`b:false` bool,
// `x:nil` nil/null/undefined. Both extractors emit this same encoding.
//
// Normalization applied (documented deviations): Ruby `nil` and TS `null` /
// `undefined` all fold to `x:nil`; a Ruby symbol (`:foo`) folds to the same
// `s:foo` token as the string `"foo"` (symbol-vs-string is not a fidelity
// divergence for a ported assertion). NOT normalized: numeric width/precision
// (`n:5` ≠ `n:5.0`), string case/whitespace, or regex/array/hash literals (those
// arrive as `null` — a non-literal — and are skipped, never compared).

import { normalizeRailsKind, normalizeTrailsKind, type CanonicalKind } from "./assertion-kinds.js";

/**
 * Canonical kinds that carry a single, statically comparable literal expected
 * value. Deliberately narrow: equality assertions (Rails first arg, trails
 * matcher arg) and membership (`assert_includes coll, member` — Rails second
 * arg — vs `toContain(member)`). Excluded are kinds whose "value" is typically
 * non-literal or multi-arg (`match`/`inDelta`/`operator`/`length`); they still
 * extract a value where one exists but are never value-compared.
 *
 * `same`/`notSame` are intentionally NOT here despite carrying a first-arg
 * value on the Rails side: no trails matcher normalizes to them (`toBe` maps to
 * `equal` by design — see assertion-kinds.ts TRAILS_MAP), so the only trails
 * path is a helper callee (`assertSame(...)`), for which the extractor captures
 * no argument (values.push(null) in extract-ts-core.ts collectAssertionKinds).
 * With the trails side never fully-literal, the skip rule would drop them every
 * time — so including them would be dead config. Add them back if/when a helper
 * form learns to parse its expected argument.
 */
export const VALUE_BEARING_KINDS: ReadonlySet<CanonicalKind> = new Set<CanonicalKind>([
  "equal",
  "notEqual",
  "includes",
  "excludes",
]);

/** Per-kind literal-value divergence between a matched Rails/trails pair. */
export interface ValueDelta {
  /** canonical value-bearing kind */
  kind: string;
  /** sorted literal tokens asserted on the Rails side */
  rails: string[];
  /** sorted literal tokens asserted on the trails side */
  trails: string[];
}

interface SideKind {
  /** total occurrences of this kind (literal or not) */
  total: number;
  /** the literal tokens captured (length ≤ total; < total means some non-literal) */
  captured: string[];
}

/**
 * Fold a lockstep (kinds, values) pair into a per-canonical-kind map, keeping
 * only value-bearing kinds. `total` counts every occurrence; `captured` holds
 * the literal tokens (a `null` value — a non-literal expected argument —
 * increments `total` but adds no token, so `captured.length < total` marks the
 * kind as "not fully literal" and downstream comparison skips it).
 */
function collectSide(
  kinds: string[],
  values: (string | null)[] | undefined,
  side: "rails" | "trails",
): Map<string, SideKind> {
  const normalize = side === "rails" ? normalizeRailsKind : normalizeTrailsKind;
  const map = new Map<string, SideKind>();
  for (let i = 0; i < kinds.length; i++) {
    const kind = normalize(kinds[i]);
    if (!kind || !VALUE_BEARING_KINDS.has(kind)) continue;
    let entry = map.get(kind);
    if (!entry) {
      entry = { total: 0, captured: [] };
      map.set(kind, entry);
    }
    entry.total++;
    const value = values?.[i];
    if (value != null) entry.captured.push(value);
  }
  return map;
}

/**
 * Report-only decision: do a matched pair's literal expected VALUES diverge?
 * Returns the per-kind value deltas, or `null` when they line up (or the pair is
 * a pending stub / lacks kind data). Never gates CI. Additive to the count and
 * kind comparisons — it does not touch either.
 *
 * Skip rule (documented): a kind is value-compared only when BOTH sides use it
 * the same number of times AND every occurrence on both sides captured a literal
 * (`captured.length === total`). If either side has a differing count (the kind
 * histogram already reports that) or any non-literal expected argument (a
 * variable/expression we can't statically compare), the kind is skipped — we
 * only ever flag a divergence between two fully-literal, equal-count sides.
 */
export function assertionValueMismatch(
  railsKinds: string[] | undefined,
  railsValues: (string | null)[] | undefined,
  trailsKinds: string[] | undefined,
  trailsValues: (string | null)[] | undefined,
  pending: boolean,
): ValueDelta[] | null {
  if (pending) return null;
  if (!railsKinds || !trailsKinds) return null;
  const rails = collectSide(railsKinds, railsValues, "rails");
  const trails = collectSide(trailsKinds, trailsValues, "trails");
  const deltas: ValueDelta[] = [];
  for (const kind of [...new Set([...rails.keys(), ...trails.keys()])].sort()) {
    const r = rails.get(kind);
    const t = trails.get(kind);
    // Kind present on only one side, or unequal counts: the kind histogram owns
    // that signal — don't double-report it here.
    if (!r || !t || r.total !== t.total) continue;
    // Some expected argument was a non-literal on either side — can't compare.
    if (r.captured.length < r.total || t.captured.length < t.total) continue;
    // Both multisets are fully-literal and equal-count (r.total === t.total), so
    // an element-wise compare of the sorted token lists is exact multiset
    // equality — not a joined string, since a token can itself contain spaces.
    const rs = [...r.captured].sort();
    const ts = [...t.captured].sort();
    if (rs.some((tok, i) => tok !== ts[i])) deltas.push({ kind, rails: rs, trails: ts });
  }
  return deltas.length > 0 ? deltas : null;
}
