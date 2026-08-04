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
 *
 * @missingRailsCall raise — Ruby guards `other.is_a? Range` with a `TypeError`
 * (overlap.rb:9); `other` is statically a `Range<T>` here, so there is no
 * non-Range value to reject.
 */
export function overlap<T extends number | Date>(range: Range<T>, other: Range<T>): boolean {
  const selfBegin = range.begin;
  const otherEnd = other.end;
  const otherExcl = other.excludeEnd;

  if (_isEmptyRange(selfBegin, otherEnd, otherExcl)) return false;

  const otherBegin = other.begin;
  const selfEnd = range.end;
  const selfExcl = range.excludeEnd;

  if (_isEmptyRange(otherBegin, selfEnd, selfExcl)) return false;
  // Ruby's `==` on the endpoints; `toNum` keeps two equal `Date`s equal, which
  // `===` on the objects would not.
  if (selfBegin === null || otherBegin === null) {
    if (selfBegin === otherBegin) return true;
  } else if (toNum(selfBegin) === toNum(otherBegin)) {
    return true;
  }

  if (_isEmptyRange(selfBegin, selfEnd, selfExcl)) return false;
  if (_isEmptyRange(otherBegin, otherEnd, otherExcl)) return false;

  return true;
}

export const overlaps = overlap;
