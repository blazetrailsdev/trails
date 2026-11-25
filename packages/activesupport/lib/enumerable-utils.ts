import { Enumerable } from "@blazetrails/ruby-compat/enumerable";
import {
  numericPlus,
  rbBigNorm,
  rbFloatTypeP,
  rbIntegerTypeP,
} from "@blazetrails/ruby-compat/numeric";
import { Range } from "@blazetrails/ruby-compat/range";

function intRangeSum(beg: number | bigint, end: number | bigint, excl: boolean, init: unknown) {
  if (excl) end = typeof end === "bigint" ? end - 1n : end - 1;
  if (BigInt(end) >= BigInt(beg)) {
    const a = ((BigInt(end) - BigInt(beg) + 1n) * (BigInt(end) + BigInt(beg))) / 2n;
    return numericPlus(init, rbBigNorm(a));
  }
  return init;
}

/** Ruby core `Enumerable#sum` (`vendor/ruby/v3.3.11/enum.c:4760` `enum_sum`). */
export function sum(collection: Iterable<number>): number;
export function sum<T>(collection: Iterable<T>, block: (element: T) => number): number;
export function sum<T>(collection: Iterable<T> | Range<T>, ...args: unknown[]): unknown;
export function sum<T>(collection: Iterable<T> | Range<T>, ...args: unknown[]): unknown {
  if (collection instanceof Range) {
    const { begin: beg, end, excludeEnd: excl } = collection as Range<unknown>;
    const blockGiven = typeof args[args.length - 1] === "function";
    if (!blockGiven && args.length <= 1 && !rbFloatTypeP(args[0])) {
      if (rbIntegerTypeP(beg) && rbIntegerTypeP(end)) {
        return intRangeSum(beg, end, excl, args.length === 0 ? 0 : args[0]);
      }
    }
  }

  const elements = collection instanceof Range ? collection.each() : collection;
  const each = (block: (element: T) => void): void => {
    for (const element of elements) block(element);
  };
  return Enumerable.prototype.sum.call({ each }, ...args);
}

export function any<T>(collection: readonly T[], fn?: (item: T) => unknown): boolean {
  for (const item of collection) {
    const value = fn ? fn(item) : item;
    if (value != null && value !== false) return true;
  }
  return false;
}
