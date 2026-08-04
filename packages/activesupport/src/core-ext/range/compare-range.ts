import { type Range, rangeIncludesValue } from "../../range-ext.js";

/**
 * `ActiveSupport::CompareWithRange`
 * (core_ext/range/compare_range.rb:2), which Ruby `prepend`s onto `Range`.
 *
 * JS has no `Range` class to reopen — trails carries the begin/end/exclusive
 * triple as data (`range-ext.ts`) — so the two prepended methods take the
 * receiver as their first parameter and `super` is `rangeIncludesValue`, the
 * native endpoint comparison. Ruby's native `Range#include?` iterates for
 * non-numeric endpoints; that arm is `rangeIncludesStringValue` (range-ext.ts)
 * and is outside these signatures, which take the numeric/`Date` endpoints the
 * range-vs-range comparison is defined over.
 *
 * @boundary-file: endpoints are compared as `number` (JS `Date` coerced to
 *   epoch millis), exactly as `range-ext.ts`'s sibling comparators do — Ruby
 *   compares any `<=>`-able endpoint.
 */

/**
 * Ruby's `Range#max` on the `value.max` branch below (compare_range.rb:23,49).
 * Ruby raises `TypeError` for a non-Integer excluded end; mirror that rather
 * than silently comparing against a fractional endpoint.
 */
function rangeMax<T extends number | Date>(range: Range<T>): T {
  const end = range.end as T;
  if (!range.excludeEnd) return end;
  if (typeof end === "number") {
    // Ruby's own `Range#max` message; activesupport has no ported TypeError.
    // eslint-disable-next-line blazetrails/rails-error-parity
    if (!Number.isInteger(end)) throw new TypeError("cannot exclude non Integer end value");
    return (end - 1) as T;
  }
  // boundary: Date endpoints, as in range-ext.ts
  return new Date(end.getTime() - 1) as T;
}

// boundary: Date endpoints, as in range-ext.ts
const toNum = <T extends number | Date>(v: T): number => (v instanceof Date ? v.getTime() : v);

/**
 * Extends the default `Range#===` to support range comparisons.
 *  (1..5) === (1..5)  # => true
 *  (1..5) === (2..3)  # => true
 *  (1..5) === (1...6) # => true
 *  (1..5) === (2..6)  # => false
 *
 * The native `Range#===` behavior is untouched.
 *  ('a'..'f') === ('c') # => true
 *  (5..9) === (11) # => false
 *
 * The given range must be fully bounded, with both start and end.
 *
 * @missingRailsCall last — Ruby reads the endpoint with `Range#last`
 * (compare_range.rb:24,50); trails' `Range` is the begin/end/exclusive triple
 * (range-ext.ts), whose endpoint field IS `end`, so there is no `last` to call.
 */
export function caseEquals<T extends number | Date>(range: Range<T>, value: Range<T> | T): boolean {
  if (isRange(value)) {
    const isBackwardsOp = value.excludeEnd
      ? (a: number, b: number): boolean => a >= b
      : (a: number, b: number): boolean => a > b;
    if (
      value.begin !== null &&
      value.end !== null &&
      isBackwardsOp(toNum(value.begin), toNum(value.end))
    ) {
      return false;
    }
    // 1...10 includes 1..9 but it does not include 1..10.
    // 1..10 includes 1...11 but it does not include 1...12.
    const operator =
      range.excludeEnd && !value.excludeEnd
        ? (a: number, b: number): boolean => a < b
        : (a: number, b: number): boolean => a <= b;
    const valueMax = !range.excludeEnd && value.excludeEnd ? rangeMax(value) : value.end;
    return (
      rangeIncludesValue(range, value.begin as T) &&
      (range.end === null || operator(toNum(valueMax as T), toNum(range.end)))
    );
  } else {
    return rangeIncludesValue(range, value);
  }
}

/**
 * Extends the default `Range#include?` to support range comparisons.
 *  (1..5).include?(1..5)  # => true
 *  (1..5).include?(2..3)  # => true
 *  (1..5).include?(1...6) # => true
 *  (1..5).include?(2..6)  # => false
 *
 * The native `Range#include?` behavior is untouched.
 *  ('a'..'f').include?('c') # => true
 *  (5..9).include?(11) # => false
 *
 * The given range must be fully bounded, with both start and end.
 *
 * @missingRailsCall last — Ruby reads the endpoint with `Range#last`
 * (compare_range.rb:24,50); trails' `Range` is the begin/end/exclusive triple
 * (range-ext.ts), whose endpoint field IS `end`, so there is no `last` to call.
 */
export function isInclude<T extends number | Date>(range: Range<T>, value: Range<T> | T): boolean {
  if (isRange(value)) {
    const isBackwardsOp = value.excludeEnd
      ? (a: number, b: number): boolean => a >= b
      : (a: number, b: number): boolean => a > b;
    if (
      value.begin !== null &&
      value.end !== null &&
      isBackwardsOp(toNum(value.begin), toNum(value.end))
    ) {
      return false;
    }
    // 1...10 includes 1..9 but it does not include 1..10.
    // 1..10 includes 1...11 but it does not include 1...12.
    const operator =
      range.excludeEnd && !value.excludeEnd
        ? (a: number, b: number): boolean => a < b
        : (a: number, b: number): boolean => a <= b;
    const valueMax = !range.excludeEnd && value.excludeEnd ? rangeMax(value) : value.end;
    return (
      rangeIncludesValue(range, value.begin as T) &&
      (range.end === null || operator(toNum(valueMax as T), toNum(range.end)))
    );
  } else {
    return rangeIncludesValue(range, value);
  }
}

/**
 * Ruby's `value.is_a?(::Range)` (compare_range.rb:16,42). trails' `Range` is a
 * plain object, so the type test is structural.
 */
function isRange<T extends number | Date>(value: Range<T> | T): value is Range<T> {
  // boundary: Date endpoints, as in range-ext.ts
  return typeof value === "object" && value !== null && !(value instanceof Date);
}
