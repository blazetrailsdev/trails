// Phase 3 of parity:test's assertion comparison (after count in compare.ts
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
// divergence for a ported assertion); a bare lower-snake identifier folds onto
// its camelCase spelling (`s:author_name` and `s:authorName` are one token),
// since trails camelCases every attribute/method name and Rails does not. NOT
// normalized: numeric width/precision
// (`n:5` ≠ `n:5.0`), string case/whitespace, or regex/array/hash literals (those
// arrive as `null` — a non-literal — and are skipped, never compared).
//
// RFC 0088 (the `date` gem port) returns Temporal types where Ruby returns
// Date/DateTime/Time, so a faithful port pairs `assert_equal Date.new(2001,2,3),
// …` with `expect(…).toEqual(Temporal.PlainDate.from("2001-02-03"))`. Both are
// method calls, so both extractors emit `null` and the kind is skipped: the
// value counter cannot rise for that shape, with no exclusion list needed. See
// the regression test in assertion-values.test.ts.

import { normalizeRailsKind, normalizeTrailsKind, type CanonicalKind } from "./assertion-kinds.js";

/**
 * Canonical kinds that carry a single, statically comparable literal expected
 * value. Deliberately narrow: equality assertions (Rails first arg, trails
 * matcher arg) and membership (`assert_includes coll, member` — Rails second
 * arg — vs `toContain(member)`). Excluded are kinds whose "value" is typically
 * non-literal or multi-arg (`match`/`inDelta`/`operator`/`length`); they still
 * extract a value where one exists but are never value-compared.
 *
 * `same`/`notSame` carry a first-arg value on the Rails side (`assert_same
 * expected, actual`). No trails matcher normalizes to them (`toBe` maps to
 * `equal` by design — see assertion-kinds.ts TRAILS_MAP), so the only trails
 * path is a helper callee (`assertSame(...)`); the extractor now captures that
 * callee's mapped argument (extract-ts-core.ts helperCalleeValue), giving a live
 * fully-literal path on both sides — hence they are value-compared here.
 */
export const VALUE_BEARING_KINDS: ReadonlySet<CanonicalKind> = new Set<CanonicalKind>([
  "equal",
  "notEqual",
  "includes",
  "excludes",
  "same",
  "notSame",
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
  /**
   * Indices into `captured` whose assertion compares whitespace-insensitively
   * (see LOOSE_RAILS_KINDS). Tracked per assertion, not per test case: a test
   * that mixes `must_be_like` with a plain `must_equal` must still compare the
   * `must_equal` operand verbatim.
   */
  loose: Set<number>;
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
      entry = { total: 0, captured: [], loose: new Set() };
      map.set(kind, entry);
    }
    entry.total++;
    const value = values?.[i];
    if (value != null) {
      if (LOOSE_RAILS_KINDS.has(kinds[i])) entry.loose.add(entry.captured.length);
      entry.captured.push(foldNameToken(foldSymbolToken(value)));
    }
  }
  return map;
}

/**
 * Fold a string token's leading `:` — trails spells a Ruby Symbol VALUE as the
 * colon-prefixed string (`:short` is `":short"`, CLAUDE.md "A Ruby Symbol is a
 * JS string, never a JS `Symbol`"), while the Ruby extractor renders `:short`
 * as the bare `s:short`. Applied to BOTH sides so every spelling of the pair —
 * Ruby symbol, Ruby string, trails colon-string, trails bare string — folds
 * onto one token, which is the same "symbol-vs-string is not a fidelity
 * divergence" rule the encoding comment already states.
 */
function foldSymbolToken(token: string): string {
  return token.startsWith("s::") ? `s:${token.slice(3)}` : token;
}

/**
 * Fold an identifier-shaped string token's snake_case spelling onto its
 * camelCase one. trails camelCases every attribute/method name (the repo rename
 * rule, docs/ruby-ts-conventions.md) while Rails does not, so a ported
 * assertion whose expected literal IS a name — `assert_equal :author_name,
 * t.errors.attribute_names[1]` vs `expect(...).toEqual("authorName")` — is a
 * spelling-convention difference, not a fidelity divergence. Applied to BOTH
 * sides, like foldSymbolToken, so every spelling folds onto one token.
 *
 * Deliberately narrow: only a token that is a bare lower-snake identifier is
 * folded, so a sentence, a SQL string, or a CONSTANT_NAME is compared verbatim.
 */
function foldNameToken(token: string): string {
  if (!token.startsWith("s:")) return token;
  const text = token.slice(2);
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(text)) return token;
  return `s:${text.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase())}`;
}

/**
 * Rails-side assertion helpers that compare their operands with runs of
 * whitespace collapsed, so their captured value token must be compared the same
 * way. Keyed on the RAW kind token, which is what makes the fold per-assertion:
 * only the operand of this helper call is squeezed, never a sibling
 * `must_equal` in the same test.
 */
const LOOSE_RAILS_KINDS: ReadonlySet<string> = new Set(["must_be_like"]);

/**
 * Arel's `must_be_like` (vendor/rails/activerecord/test/cases/arel/helper.rb:10-13)
 * squeezes runs of whitespace and strips both operands before delegating to
 * `must_equal`, so `%{\n  SELECT id FROM "users"\n}` and `SELECT id FROM
 * "users"` are the SAME assertion. Its value token must be compared the same
 * way, on both sides — the Ruby heredoc keeps its indentation and the ported
 * string literal does not, and that is formatting, not a fidelity divergence.
 */
function squeezeToken(token: string): string {
  return token.startsWith("s:") ? `s:${token.slice(2).replace(/\s+/g, " ").trim()}` : token;
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
    const mismatch =
      r.loose.size > 0 ? looseMismatch(r, t.captured) : exactMismatch(r.captured, t.captured);
    if (mismatch) deltas.push({ kind, ...mismatch });
  }
  return deltas.length > 0 ? deltas : null;
}

/**
 * Multiset equality over two fully-literal, equal-length token lists. Both are
 * equal-count by the caller's guard, so an element-wise compare of the sorted
 * lists is exact multiset equality — not a joined string, since a token can
 * itself contain spaces.
 */
function exactMismatch(rails: string[], trails: string[]): Omit<ValueDelta, "kind"> | null {
  const rs = [...rails].sort();
  const ts = [...trails].sort();
  return rs.some((tok, i) => tok !== ts[i]) ? { rails: rs, trails: ts } : null;
}

/**
 * Multiset equality where SOME of the Rails tokens compare whitespace-insensitively
 * (their assertion was a LOOSE_RAILS_KINDS helper) and the rest compare verbatim.
 * The strict tokens are matched first and must find an exact partner, so a plain
 * `must_equal` sitting beside a `must_be_like` still catches a whitespace-only
 * divergence. Whatever the strict pass leaves over is then squeezed and compared
 * against the squeezed loose tokens.
 *
 * The trails side carries no such attribution — vitest spells both as `toEqual` —
 * so a strict token that could equally have partnered a loose one is consumed by
 * the strict pass. Where that guesses wrong it yields a false MISMATCH, never a
 * false match, which is the safe direction (the same rule TRAILS_MAP applies to
 * `toBe`).
 */
function looseMismatch(rails: SideKind, trails: string[]): Omit<ValueDelta, "kind"> | null {
  const strict = rails.captured.filter((_tok, i) => !rails.loose.has(i));
  const loose = rails.captured.filter((_tok, i) => rails.loose.has(i)).map(squeezeToken);
  const remaining = [...trails];
  const matched: string[] = [];
  let unmatched = 0;
  for (const tok of strict) {
    const at = remaining.indexOf(tok);
    if (at < 0) unmatched++;
    else matched.push(...remaining.splice(at, 1));
  }
  const squeezed = remaining.map(squeezeToken);
  if (unmatched === 0 && exactMismatch(loose, squeezed) === null) return null;
  return { rails: [...strict, ...loose].sort(), trails: [...matched, ...squeezed].sort() };
}
