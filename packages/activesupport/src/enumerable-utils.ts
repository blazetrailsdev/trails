import {
  Enumerable,
  Hash,
  hashAref,
  numericPlus,
  rbBigNorm,
  rbEqual,
  rbFloatTypeP,
  rbIntegerTypeP,
} from "@blazetrails/ruby-compat";
import { Range } from "@blazetrails/ruby-compat/range";
import { SoleItemExpectedError } from "./core-ext/enumerable.js";
import { isPlainObject, valuesAt } from "./hash-utils.js";
import { isBlank } from "./string-utils.js";

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
  return Enumerable.sum.call({ each }, ...args);
}

export function indexBy<T, K extends string | number>(
  collection: T[],
  fn: (item: T) => K,
): Record<K, T> {
  const result = Object.create(null) as Record<K, T>;
  for (const item of collection) {
    result[fn(item)] = item;
  }
  return result;
}

export function indexWith<T, V>(
  collection: readonly T[],
  defaultOrBlock: V | ((elem: T) => V),
): Hash<T, V> {
  const result = new Hash<T, V>();
  if (typeof defaultOrBlock === "function") {
    const block = defaultOrBlock as (elem: T) => V;
    for (const elem of collection) result.set(elem, block(elem));
  } else {
    for (const elem of collection) result.set(elem, defaultOrBlock);
  }
  return result;
}

export function groupBy<T, K>(collection: T[], fn: (item: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>();
  for (const item of collection) {
    const key = fn(item);
    if (!result.has(key)) result.set(key, []);
    result.get(key)!.push(item);
  }
  return result;
}

export function pluck<T, K extends keyof T>(collection: T[], ...keys: K[]): T[K][] | T[K][][] {
  if (keys.length > 1) {
    return collection.map((element) => keys.map((key) => hashAref(element as object, key) as T[K]));
  } else {
    const key = keys[0];
    return collection.map((element) => hashAref(element as object, key) as T[K]);
  }
}

export function maximum<T>(collection: T[], key: (item: T) => number): number | undefined {
  if (collection.length === 0) return undefined;
  return Math.max(...collection.map(key));
}

export function minimum<T>(collection: T[], key: (item: T) => number): number | undefined {
  if (collection.length === 0) return undefined;
  return Math.min(...collection.map(key));
}

export function inBatchesOf<T>(collection: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < collection.length; i += size) {
    result.push(collection.slice(i, i + size));
  }
  return result;
}

export function compactBlank<T>(collection: T[]): T[] {
  return collection.filter((item) => !isBlank(item));
}

export function any<T>(collection: readonly T[], fn?: (item: T) => unknown): boolean {
  for (const item of collection) {
    const value = fn ? fn(item) : item;
    if (value != null && value !== false) return true;
  }
  return false;
}

export function many<T>(collection: T[], fn?: (item: T) => boolean): boolean {
  if (!fn) return collection.length > 1;
  let count = 0;
  for (const item of collection) {
    if (fn(item)) {
      count++;
      if (count > 1) return true;
    }
  }
  return false;
}

export function tally<T extends string | number>(collection: T[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of collection) {
    const key = String(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

export function filterMap<T, U>(
  collection: readonly T[],
  fn: (item: T) => U | false | null | undefined,
): U[] {
  const result: U[] = [];
  for (const item of collection) {
    const mapped = fn(item);
    if (mapped !== null && mapped !== undefined && mapped !== false) {
      result.push(mapped);
    }
  }
  return result;
}

export function excluding<T extends Record<string, unknown>>(
  collection: T,
  ...elements: unknown[]
): Partial<T>;
export function excluding<T>(collection: Iterable<T>, ...elements: unknown[]): T[];
export function excluding(collection: unknown, ...elements: unknown[]): unknown {
  elements = elements.flat(1);
  if (isPlainObject(collection)) {
    return Object.fromEntries(
      Object.entries(collection).filter(([element]) => !elements.some((e) => rbEqual(e, element))),
    );
  }
  return [...(collection as Iterable<unknown>)].filter(
    (element) => !elements.some((e) => rbEqual(e, element)),
  );
}

export function including<T>(collection: T[], ...elements: T[]): T[] {
  return [...collection, ...elements];
}

export function minBy<T>(collection: T[], fn: (item: T) => number): T | undefined {
  if (collection.length === 0) return undefined;
  return collection.reduce((best, item) => (fn(item) < fn(best) ? item : best));
}

export function maxBy<T>(collection: T[], fn: (item: T) => number): T | undefined {
  if (collection.length === 0) return undefined;
  return collection.reduce((best, item) => (fn(item) > fn(best) ? item : best));
}

export function eachCons<T>(collection: T[], n: number): T[][];
export function eachCons<T>(collection: T[], n: number, block: (slice: T[]) => void): T[];
export function eachCons<T>(collection: T[], n: number, block?: (slice: T[]) => void): T[][] | T[] {
  const result: T[][] = [];
  for (let i = 0; i <= collection.length - n; i++) {
    result.push(collection.slice(i, i + n));
  }
  if (!block) return result;
  result.forEach(block);
  return collection;
}

export function eachSlice<T>(collection: T[], n: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < collection.length; i += n) {
    result.push(collection.slice(i, i + n));
  }
  return result;
}

export function inOrderOf<T>(
  collection: T[],
  key: (item: T) => unknown,
  series: unknown[],
  options: { filter?: boolean } = {},
): T[] {
  const filter = options.filter !== false;
  if (filter) {
    return valuesAt(groupBy(collection, key), ...series)
      .flat(1)
      .filter((v): v is T => v != null);
  } else {
    const position = (v: T): number => {
      const index = series.indexOf(key(v));
      return index === -1 ? series.length : index;
    };
    return [...collection].sort((a, b) => position(a) - position(b)).filter((v) => v != null);
  }
}

export function exclude<T>(collection: T[], object: T): boolean {
  return !collection.includes(object);
}

export function without<T>(collection: T[], ...elements: T[]): T[] {
  return excluding(collection, ...elements);
}

export function pick<T, K extends keyof T>(
  collection: T[],
  ...keys: K[]
): T[K] | T[K][] | undefined {
  if (collection.length === 0) return undefined;

  if (keys.length > 1) {
    return keys.map((key) => hashAref(collection[0] as object, key) as T[K]);
  } else {
    return hashAref(collection[0] as object, keys[0]) as T[K];
  }
}

export function sole<T>(collection: T[], fn?: (item: T) => boolean): T {
  const filtered = fn ? collection.filter(fn) : collection;
  if (filtered.length === 0) throw new SoleItemExpectedError("no item found");
  if (filtered.length > 1) throw new SoleItemExpectedError("multiple items found");
  return filtered[0];
}
