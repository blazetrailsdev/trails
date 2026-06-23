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
  const toNum = (v: T): number => (v instanceof Date ? v.getTime() : v);

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
  const toNum = (v: T): number => (v instanceof Date ? v.getTime() : v);
  const n = toNum(value);

  if (range.begin !== null && n < toNum(range.begin)) return false;
  if (range.end !== null) {
    if (range.excludeEnd ? n >= toNum(range.end) : n > toNum(range.end)) return false;
  }
  return true;
}

const isAsciiAlnum = (c: number): boolean =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

/**
 * `String#succ` — Ruby's successor. Increments the rightmost alphanumeric,
 * carrying within its character class (`9→0`, `z→a`, `Z→A`) and skipping
 * non-alphanumerics during the carry; an overflow past the leftmost member of
 * a class inserts a new leading digit/letter (`"Zz".succ == "AAa"`,
 * `"99".succ == "100"`). Strings with no alphanumeric increment by raw code
 * unit instead (`"<<".succ == "<="`).
 */
export function stringSucc(s: string): string {
  if (s.length === 0) return "";
  const codes = Array.from(s, (ch) => ch.charCodeAt(0));

  let lastAlnum = -1;
  for (let i = codes.length - 1; i >= 0; i--) {
    if (isAsciiAlnum(codes[i])) {
      lastAlnum = i;
      break;
    }
  }

  if (lastAlnum === -1) {
    // No alphanumeric: raw code-unit increment with carry.
    let i = codes.length - 1;
    let carry = true;
    while (i >= 0 && carry) {
      if (codes[i] >= 0xffff) {
        codes[i] = 0;
      } else {
        codes[i]++;
        carry = false;
      }
      i--;
    }
    if (carry) codes.unshift(1);
    return String.fromCharCode(...codes);
  }

  // Carry leftward from the rightmost alphanumeric, wrapping within a class.
  // Ruby stops the carry rather than crossing a non-alphanumeric gap into a
  // *different* class (digit vs letter): `"z.9".succ == "z.10"`, not `"aa.0"`.
  const DIGIT = 1;
  const ALPHA = 2;
  let i = lastAlnum;
  let carry = true;
  let overflowPos = lastAlnum;
  let overflowChar = 0;
  let lastWrapClass = 0;
  let crossedGap = false;
  while (i >= 0 && carry) {
    const c = codes[i];
    if (!isAsciiAlnum(c)) {
      crossedGap = true;
      i--;
      continue;
    }
    const thisClass = c >= 48 && c <= 57 ? DIGIT : ALPHA;
    if (crossedGap && lastWrapClass !== 0 && thisClass !== lastWrapClass) break;
    crossedGap = false;
    overflowPos = i;
    if (c === 57) {
      codes[i] = 48; // '9' → '0'
      overflowChar = 49; // insert '1'
      lastWrapClass = DIGIT;
    } else if (c === 122) {
      codes[i] = 97; // 'z' → 'a'
      overflowChar = 97;
      lastWrapClass = ALPHA;
    } else if (c === 90) {
      codes[i] = 65; // 'Z' → 'A'
      overflowChar = 65;
      lastWrapClass = ALPHA;
    } else {
      codes[i] = c + 1;
      carry = false;
    }
    i--;
  }
  if (carry) codes.splice(overflowPos, 0, overflowChar);
  return String.fromCharCode(...codes);
}

const lexCmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * String `Range#include?` — membership in the `succ`-enumerated sequence from
 * `begin` to `end`, NOT a plain lexicographic cover. Ruby enumerates string
 * ranges by `String#succ` (range.c `rb_str_include_range_p` → `str_upto_each`),
 * so a value is a member only if it is actually *reachable* by repeatedly
 * applying `succ` to `begin` before passing `end`. This mirrors that
 * enumeration faithfully: `("a".."bbb").include?("z")` is true (`"z"` is
 * produced before the length guard trips), and `("a".."bbb").include?("a1")`
 * is false (`succ` mixes no character classes, so `"a1"` is never produced)
 * — unlike a `(length, lex)` window, which would wrongly admit `"a1"`.
 *
 * Beginless/endless string ranges can't be enumerated, so they fall back to
 * succ-order bound checks (`(length, then lexicographic)`); both-bounded
 * ranges — the inputs Rails string ranges are used with — enumerate exactly.
 */
export function rangeIncludesStringValue(range: Range<string>, value: string): boolean {
  const { begin, end, excludeEnd } = range;

  if (begin === null || end === null) {
    const succCmp = (a: string, b: string): number =>
      a.length !== b.length ? a.length - b.length : lexCmp(a, b);
    if (begin !== null && succCmp(value, begin) < 0) return false;
    if (end !== null) {
      const c = succCmp(value, end);
      if (excludeEnd ? c >= 0 : c > 0) return false;
    }
    return true;
  }

  // Faithful `str_upto_each`: enumerate begin..end via succ, stopping at
  // `end.succ`, when the exclusive end is reached, or when the current string
  // grows past `end`'s length (succ is non-decreasing in length).
  const n = lexCmp(begin, end);
  if (n > 0 || (excludeEnd && n === 0)) return false;
  const afterEnd = stringSucc(end);
  let current = begin;
  let guard = 0;
  while (current !== afterEnd) {
    let next: string | null = null;
    if (excludeEnd || current !== end) next = stringSucc(current);
    if (current === value) return true;
    if (next === null) break;
    current = next;
    if (excludeEnd && current === end) break;
    if (current.length > end.length || current.length === 0) break;
    if (++guard > 5_000_000) break;
  }
  return false;
}

export function rangeIncludesRange<T extends number | Date>(
  outer: Range<T>,
  inner: Range<T>,
): boolean {
  const toNum = (v: T): number => (v instanceof Date ? v.getTime() : v);

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
