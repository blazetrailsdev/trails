import { StandardError, rbBigNorm, rbIntegerTypeP, rbPlus } from "@blazetrails/ruby-compat";
import { Range } from "@blazetrails/ruby-compat/range";
import { sum as enumerableSum } from "../enumerable-utils.js";

export class SoleItemExpectedError extends StandardError {}

export function sum<T>(
  this: Range<T>,
  initialValue: unknown = 0,
  block?: (element: T) => unknown,
): unknown {
  const first = this.first();
  const last = this.last();
  if (block !== undefined || !(rbIntegerTypeP(first) && rbIntegerTypeP(last))) {
    return enumerableSum(this, initialValue, block);
  } else {
    const actualLast = this.excludeEnd ? BigInt(last) - 1n : BigInt(last);
    if (actualLast >= BigInt(first)) {
      const sum = initialValue != null && initialValue !== false ? initialValue : 0;
      return rbPlus(
        sum,
        rbBigNorm(((actualLast - BigInt(first) + 1n) * (actualLast + BigInt(first))) / 2n),
      );
    } else {
      return initialValue != null && initialValue !== false ? initialValue : 0;
    }
  }
}

declare module "@blazetrails/ruby-compat/range" {
  interface Range<T> {
    sum(initialValue?: unknown, block?: (element: T) => unknown): unknown;
  }
}

Object.assign(Range.prototype, { sum });
