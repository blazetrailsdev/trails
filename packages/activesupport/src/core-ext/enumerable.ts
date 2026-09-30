import { StandardError, numericPlus } from "@blazetrails/ruby-compat";
import { Range } from "@blazetrails/ruby-compat/range";
import { sum as enumerableSum } from "../enumerable-utils.js";

export class SoleItemExpectedError extends StandardError {}

export function sum<T>(this: Range<T>, ...args: unknown[]): unknown {
  const blockGiven = typeof args[args.length - 1] === "function";
  const initialValue = args.length > (blockGiven ? 1 : 0) ? args[0] : 0;
  const first = this.first() as number;
  const last = this.last() as number;
  if (blockGiven || !(Number.isInteger(first) && Number.isInteger(last))) {
    return enumerableSum(this, ...args);
  } else {
    const actualLast = this.excludeEnd ? last - 1 : last;
    if (actualLast >= first) {
      const sum = initialValue != null && initialValue !== false ? initialValue : 0;
      return numericPlus(sum, ((actualLast - first + 1) * (actualLast + first)) / 2);
    } else {
      return initialValue != null && initialValue !== false ? initialValue : 0;
    }
  }
}

declare module "@blazetrails/ruby-compat/range" {
  interface Range<T> {
    sum(...args: unknown[]): unknown;
  }
}

Object.assign(Range.prototype, { sum });
