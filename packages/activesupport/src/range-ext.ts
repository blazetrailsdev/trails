/**
 * Range utility functions mirroring ActiveSupport's Range extensions.
 *
 * @boundary-file: Date-aware range comparators (`overlap`, `cover`, `each`)
 *   coerce `Date` ↔ epoch number for ordering since Rails' `Range#include?`
 *   accepts any `<=>`-comparable value. Temporal-typed ranges live elsewhere.
 */

export interface Range<T> {
  begin: T | null; // null = beginless
  end: T | null; // null = endless
  excludeEnd: boolean; // true = exclusive end (like ...)
}

export function makeRange<T>(begin: T | null, end: T | null, excludeEnd = false): Range<T> {
  return { begin, end, excludeEnd };
}

/**
 * overlap? — returns true if two ranges overlap.
 * Mirrors ActiveSupport Range#overlap?
 */
export function overlap<T extends number | Date>(a: Range<T>, b: Range<T>): boolean {
  const toNum = (v: T): number => (v instanceof Date ? v.getTime() : (v as number));

  // a starts after b ends
  if (a.begin !== null && b.end !== null) {
    const aBegin = toNum(a.begin);
    const bEnd = toNum(b.end);
    if (b.excludeEnd ? aBegin >= bEnd : aBegin > bEnd) return false;
  }

  // b starts after a ends
  if (b.begin !== null && a.end !== null) {
    const bBegin = toNum(b.begin);
    const aEnd = toNum(a.end);
    if (a.excludeEnd ? bBegin >= aEnd : bBegin > aEnd) return false;
  }

  return true;
}

export const overlaps = overlap; // alias

/**
 * cover? — returns true if a numeric/date range covers a scalar value
 * (endpoint comparison via `<=>`).
 */
export function rangeIncludesValue<T extends number | Date>(range: Range<T>, value: T): boolean {
  const toNum = (v: T): number => (v instanceof Date ? v.getTime() : (v as number));
  const n = toNum(value);

  if (range.begin !== null && n < toNum(range.begin)) return false;
  if (range.end !== null) {
    if (range.excludeEnd ? n >= toNum(range.end) : n > toNum(range.end)) return false;
  }
  return true;
}

/**
 * String `Range#include?` — membership in the `succ`-enumerated sequence from
 * `begin` to `end`, NOT a plain lexicographic cover. Ruby enumerates string
 * ranges by `String#succ`, which orders strings length-first then
 * lexicographically (so `("a".."bbb").include?("z")` is true even though
 * `"z" > "bbb"` lexically — `"z"` is shorter, so it sorts before `"bbb"`).
 *
 * Approximation: this models succ ordering as `(length, then lexicographic)`,
 * which is EXACT for strings whose characters all share one succ class
 * (e.g. pure lowercase `a-z`, the inputs Rails string ranges are used with).
 * It is NOT a full `String#succ` reachability check. Ruby's `succ` only
 * increments alphanumerics and carries within a character class, so values
 * that mix classes or contain punctuation are unreachable even when they fall
 * inside the `(length, lex)` window — e.g. Ruby's `("a".."bbb").include?("a1")`
 * is `false` (succ never produces `"a1"`), but this returns `true`. Faithful
 * succ-reachability would require replicating the per-class carry logic of
 * `String#succ`; deferred until a validator input actually needs it.
 */
export function rangeIncludesStringValue(range: Range<string>, value: string): boolean {
  // succ order: shorter strings sort first; equal-length ties break by the
  // ordinary code-unit comparison Ruby's `String#<=>` uses.
  const succCmp = (a: string, b: string): number =>
    a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0;

  if (range.begin !== null && succCmp(value, range.begin) < 0) return false;
  if (range.end !== null) {
    const c = succCmp(value, range.end);
    if (range.excludeEnd ? c >= 0 : c > 0) return false;
  }
  return true;
}

export function rangeIncludesRange<T extends number | Date>(
  outer: Range<T>,
  inner: Range<T>,
): boolean {
  const toNum = (v: T): number => (v instanceof Date ? v.getTime() : (v as number));

  // inner begin must be within outer
  if (inner.begin !== null) {
    if (!rangeIncludesValue(outer, inner.begin)) return false;
  } else if (outer.begin !== null) {
    return false; // inner is beginless but outer is not
  }

  // inner end must be within outer
  if (inner.end !== null) {
    const innerEnd = toNum(inner.end);
    if (outer.end !== null) {
      const outerEnd = toNum(outer.end);
      if (inner.excludeEnd && !outer.excludeEnd) {
        // exclusive inner end: check innerEnd <= outerEnd
        if (innerEnd > outerEnd) return false;
      } else if (!inner.excludeEnd && outer.excludeEnd) {
        // inclusive inner end, exclusive outer end: innerEnd must be < outerEnd
        if (innerEnd >= outerEnd) return false;
      } else {
        if (innerEnd > outerEnd) return false;
      }
    }
    // if outer is endless, inner.end is always within
  } else if (outer.end !== null) {
    return false; // inner is endless but outer is not
  }

  return true;
}

/**
 * cover? — whether a range covers another range (same as rangeIncludesRange for numeric ranges).
 */
export const cover = rangeIncludesRange;

/**
 * toFs — format a range as a string.
 */
export function rangeToFs<T>(range: Range<T>, format?: string): string {
  const fmtBegin = range.begin !== null ? String(range.begin) : "";
  const fmtEnd = range.end !== null ? String(range.end) : "";
  const sep = range.excludeEnd ? "..." : "..";
  return `${fmtBegin}${sep}${fmtEnd}`;
}

/**
 * step — iterate over a numeric range with a step value.
 */
export function* rangeStep(range: Range<number>, step: number): Generator<number> {
  if (range.begin === null) throw new Error("Cannot step over beginless range");
  let current = range.begin;
  while (true) {
    if (range.end !== null) {
      if (range.excludeEnd ? current >= range.end : current > range.end) break;
    }
    yield current;
    current += step;
  }
}

/**
 * each — iterate over a numeric range.
 */
export function* rangeEach(range: Range<number>): Generator<number> {
  yield* rangeStep(range, 1);
}
