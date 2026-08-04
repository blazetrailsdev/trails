/**
 * The `Range` data triple, plus the core `Range` methods Ruby provides and
 * Rails' `core_ext/range/*` files reopen. Those Rails files are ported
 * one-for-one under `core-ext/range/`.
 *
 * @boundary-file: the Date-aware comparators here coerce `Date` ↔ epoch number
 *   for ordering since Rails' `Range#include?` accepts any `<=>`-comparable
 *   value. Temporal-typed ranges live elsewhere.
 */

import { succ } from "./core-ext/string/succ.js";

/**
 * The value shape these helpers operate on. Ruby's `Range` is a core class
 * these core-ext files reopen; JS has no such class, so trails carries the
 * begin/end/exclusive triple as data instead.
 *
 * @noRailsEquivalent PERMANENT — the Ruby `Range` constant it collides with
 * is the core class itself, which cannot be "ported" to a TS declaration; the
 * Rails-declared `Range` classes (`Arel::Nodes::Range`, PG `OID::Range`) are
 * unrelated node/type classes.
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
 * Beginless/endless string ranges have no enumerable sequence; Ruby raises
 * `TypeError: cannot determine inclusion in beginless/endless ranges` from
 * `Range#include?` (range.c `range_include_internal`), so this throws to match
 * rather than inventing an answer Ruby never produces.
 */
export function rangeIncludesStringValue(range: Range<string>, value: string): boolean {
  const { begin, end, excludeEnd } = range;

  if (begin === null || end === null) {
    throw new TypeError("cannot determine inclusion in beginless/endless ranges");
  }

  // Faithful `str_upto_each`: enumerate begin..end via succ, stopping at
  // `end.succ`, when the exclusive end is reached, or when the current string
  // grows past `end`'s length (succ is non-decreasing in length).
  const n = lexCmp(begin, end);
  if (n > 0 || (excludeEnd && n === 0)) return false;
  const afterEnd = succ(end);
  let current = begin;
  let guard = 0;
  while (current !== afterEnd) {
    let next: string | null = null;
    if (excludeEnd || current !== end) next = succ(current);
    if (current === value) return true;
    if (next === null) break;
    current = next;
    if (excludeEnd && current === end) break;
    if (current.length > end.length || current.length === 0) break;
    // The length guard above bounds enumeration to strings no longer than
    // `end`, so this only trips for spans wider than ~26^5. Ruby would keep
    // iterating (slow but correct); throw rather than return a wrong `false`.
    if (++guard > 5_000_000) {
      throw new RangeError("string range too large to enumerate for include?");
    }
  }
  return false;
}
