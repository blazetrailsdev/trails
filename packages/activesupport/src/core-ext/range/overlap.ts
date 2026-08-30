import { Range } from "@blazetrails/ruby-compat/range";

/**
 * `Range#overlap?` / `#overlaps?` (core_ext/range/overlap.rb:8,39), which Ruby
 * reopens `Range` to define. The reopening is the settled `this`-typed-function
 * mixin, assigned onto `Range.prototype` at the bottom of this file exactly
 * where Ruby closes `class Range`.
 *
 * @boundary-file: endpoints are compared as `number` (JS `Date` coerced to
 *   epoch millis), as ruby-compat's `range.ts` sibling comparators do — Ruby compares
 *   any `<=>`-able endpoint.
 */

// boundary: Date endpoints, as in ruby-compat's range.ts
const toNum = <T extends number | Date>(v: T): number => (v instanceof Date ? v.getTime() : v);

/** Ruby's `b == e` on two endpoints, which for `Date` is a value comparison. */
function eq<T extends number | Date>(b: T | null, e: T | null): boolean {
  if (b === null || e === null) return b === e;
  return toNum(b) === toNum(e);
}

/**
 * Ruby's private `Range#_empty_range?` (overlap.rb:31). The spelling is what
 * the `parity:api` name convention produces from `_empty_range?`.
 */
function is_emptyRange<T extends number | Date>(b: T | null, e: T | null, excl: boolean): boolean {
  if (b === null || e === null) return false;

  const comp = toNum(b) - toNum(e);
  return Number.isNaN(comp) || comp > 0 || (comp === 0 && excl);
}

/**
 * Compare two ranges and see if they overlap each other
 *  (1..5).overlap?(4..6) # => true
 *  (1..5).overlap?(7..9) # => false
 */
export function overlap<T extends number | Date>(this: Range<T>, other: Range<T>): boolean {
  // eslint-disable-next-line blazetrails/rails-error-parity
  if (!(other instanceof Range)) throw new TypeError();

  const selfBegin = this.begin;
  const otherEnd = other.end;
  const otherExcl = other.excludeEnd;

  if (is_emptyRange(selfBegin, otherEnd, otherExcl)) return false;

  const otherBegin = other.begin;
  const selfEnd = this.end;
  const selfExcl = this.excludeEnd;

  if (is_emptyRange(otherBegin, selfEnd, selfExcl)) return false;
  if (eq(selfBegin, otherBegin)) return true;

  if (is_emptyRange(selfBegin, selfEnd, selfExcl)) return false;
  if (is_emptyRange(otherBegin, otherEnd, otherExcl)) return false;

  return true;
}

export const overlaps = overlap;

declare module "@blazetrails/ruby-compat/range" {
  interface Range<T> {
    overlap(other: Range<T>): boolean;
    overlaps(other: Range<T>): boolean;
  }
}

Object.assign(Range.prototype, { overlap, overlaps });
