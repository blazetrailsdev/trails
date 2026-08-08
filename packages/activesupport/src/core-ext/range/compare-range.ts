import { prepend } from "../../prepend.js";
import { Range } from "../../range-ext.js";

/**
 * `ActiveSupport::CompareWithRange`
 * (core_ext/range/compare_range.rb:2), which Ruby `prepend`s onto `Range`.
 * `prepend()` is the trails idiom for `Module#prepend`, so `super` arrives as
 * the wrapper's first argument.
 *
 * @boundary-file: endpoints are compared as `number` (JS `Date` coerced to
 *   epoch millis), exactly as `range-ext.ts`'s comparators do — Ruby compares
 *   any `<=>`-able endpoint.
 */

// boundary: Date endpoints, as in range-ext.ts
const toNum = <T>(v: T): number => (v instanceof Date ? v.getTime() : (v as number));

declare module "../../range-ext.js" {
  interface Range<T> {
    caseEquals(value: Range<T> | T): boolean;
    isInclude(value: Range<T> | T): boolean;
  }
}

type Super = (...args: unknown[]) => unknown;

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
 */
export function caseEquals<T>(this: Range<T>, super_: Super, value: Range<T> | T): boolean {
  if (value instanceof Range) {
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
      this.excludeEnd && !value.excludeEnd
        ? (a: number, b: number): boolean => a < b
        : (a: number, b: number): boolean => a <= b;
    const valueMax = !this.excludeEnd && value.excludeEnd ? value.max() : value.last();
    return (
      (super_.call(this, value.first()) as boolean) &&
      (this.end === null || operator(toNum(valueMax as T), toNum(this.last() as T)))
    );
  } else {
    return super_.call(this, value) as boolean;
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
 */
export function isInclude<T>(this: Range<T>, super_: Super, value: Range<T> | T): boolean {
  if (value instanceof Range) {
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
      this.excludeEnd && !value.excludeEnd
        ? (a: number, b: number): boolean => a < b
        : (a: number, b: number): boolean => a <= b;
    const valueMax = !this.excludeEnd && value.excludeEnd ? value.max() : value.last();
    return (
      (super_.call(this, value.first()) as boolean) &&
      (this.end === null || operator(toNum(valueMax as T), toNum(this.last() as T)))
    );
  } else {
    return super_.call(this, value) as boolean;
  }
}

prepend(Range.prototype, { caseEquals, isInclude });
