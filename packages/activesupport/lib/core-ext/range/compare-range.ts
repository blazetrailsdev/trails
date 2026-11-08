import { prepend, rbCallSuper } from "@blazetrails/ruby-compat";
import { Range } from "@blazetrails/ruby-compat/range";

/**
 * `ActiveSupport::CompareWithRange`
 * (core_ext/range/compare_range.rb:2), which Ruby `prepend`s onto `Range`.
 * Its `super` is core Ruby's own `Range#===` / `Range#include?`, which live in
 * `@blazetrails/ruby-compat`.
 *
 * @boundary-file: endpoints are compared as `number` (JS `Date` coerced to
 *   epoch millis), exactly as ruby-compat's `range.ts` comparators do — Ruby compares
 *   any `<=>`-able endpoint.
 */

// boundary: Date endpoints, as in ruby-compat's range.ts
const toNum = <T>(v: T): number => (v instanceof Date ? v.getTime() : (v as number));

declare module "@blazetrails/ruby-compat/range" {
  interface Range<T> {
    caseEquals(value: Range<T> | T): boolean;
    isInclude(value: Range<T> | T): boolean;
  }
}

export function caseEquals<T>(this: Range<T>, value: Range<T> | T): boolean {
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
    const operator =
      this.excludeEnd && !value.excludeEnd
        ? (a: number, b: number): boolean => a < b
        : (a: number, b: number): boolean => a <= b;
    const valueMax = !this.excludeEnd && value.excludeEnd ? value.max() : value.last();
    return (
      (rbCallSuper(this, caseEquals, value.first()) as boolean) &&
      (this.end === null || operator(toNum(valueMax as T), toNum(this.last() as T)))
    );
  } else {
    return rbCallSuper(this, caseEquals, value) as boolean;
  }
}

export function isInclude<T>(this: Range<T>, value: Range<T> | T): boolean {
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
    const operator =
      this.excludeEnd && !value.excludeEnd
        ? (a: number, b: number): boolean => a < b
        : (a: number, b: number): boolean => a <= b;
    const valueMax = !this.excludeEnd && value.excludeEnd ? value.max() : value.last();
    return (
      (rbCallSuper(this, isInclude, value.first()) as boolean) &&
      (this.end === null || operator(toNum(valueMax as T), toNum(this.last() as T)))
    );
  } else {
    return rbCallSuper(this, isInclude, value) as boolean;
  }
}

prepend(Range, { caseEquals, isInclude });
