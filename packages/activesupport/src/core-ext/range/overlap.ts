import type { Range } from "../../range-ext.js";

/**
 * `Range#overlap?` / `#overlaps?` (core_ext/range/overlap.rb:8,39), which Ruby
 * reopens `Range` to define. JS has no `Range` class to reopen — trails carries
 * the begin/end/exclusive triple as data (`range-ext.ts`) — so the receiver is
 * the first parameter, exactly as `compare-range.ts` does.
 *
 * @boundary-file: endpoints are compared as `number` (JS `Date` coerced to
 *   epoch millis), as `range-ext.ts`'s sibling comparators do — Ruby compares
 *   any `<=>`-able endpoint.
 */

// boundary: Date endpoints, as in range-ext.ts
const toNum = <T extends number | Date>(v: T): number => (v instanceof Date ? v.getTime() : v);

/** Ruby's `b == e` on two endpoints, which for `Date` is a value comparison. */
function eq<T extends number | Date>(b: T | null, e: T | null): boolean {
  if (b === null || e === null) return b === e;
  return toNum(b) === toNum(e);
}

/**
 * Ruby's `value.is_a?(::Range)` (overlap.rb:9). trails' `Range` is a plain
 * object, so the type test is structural, as in `compare-range.ts`.
 */
function isRange<T extends number | Date>(value: Range<T>): boolean {
  // boundary: Date endpoints, as in range-ext.ts
  return typeof value === "object" && value !== null && !(value instanceof Date);
}

/** Ruby's private `Range#_empty_range?` (overlap.rb:31). */
function _isEmptyRange<T extends number | Date>(b: T | null, e: T | null, excl: boolean): boolean {
  if (b === null || e === null) return false;

  const comp = toNum(b) - toNum(e);
  return Number.isNaN(comp) || comp > 0 || (comp === 0 && excl);
}

/**
 * Compare two ranges and see if they overlap each other
 *  (1..5).overlap?(4..6) # => true
 *  (1..5).overlap?(7..9) # => false
 */
export function overlap<T extends number | Date>(range: Range<T>, other: Range<T>): boolean {
  // eslint-disable-next-line blazetrails/rails-error-parity
  if (!isRange(other)) throw new TypeError();

  const selfBegin = range.begin;
  const otherEnd = other.end;
  const otherExcl = other.excludeEnd;

  if (_isEmptyRange(selfBegin, otherEnd, otherExcl)) return false;

  const otherBegin = other.begin;
  const selfEnd = range.end;
  const selfExcl = range.excludeEnd;

  if (_isEmptyRange(otherBegin, selfEnd, selfExcl)) return false;
  if (eq(selfBegin, otherBegin)) return true;

  if (_isEmptyRange(selfBegin, selfEnd, selfExcl)) return false;
  if (_isEmptyRange(otherBegin, otherEnd, otherExcl)) return false;

  return true;
}

export const overlaps = overlap;
