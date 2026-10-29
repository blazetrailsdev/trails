import {
  block,
  type Each,
  Enumerable,
  groupBy as enumGroupBy,
  Hash,
  hashAref,
  hashAset,
  isAny,
  isNone,
  map,
  max,
  min,
  numericPlus,
  rbBigNorm,
  rbEqual,
  rbFloatTypeP,
  rbObjRespondTo,
  rbIntegerTypeP,
  size,
  sortBy,
  toEnum,
  type Enumerator,
} from "@blazetrails/ruby-compat";
import { count, first, isInclude, reject, toA } from "@blazetrails/ruby-compat/enumerable";
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
  return Enumerable.prototype.sum.call({ each }, ...args);
}

export function indexBy<T, K extends string | number>(
  collection: Iterable<T> | Each<T>,
  fn: (item: T) => K,
): Record<K, T>;
export function indexBy<T>(collection: Iterable<T> | Each<T>): Enumerator<T>;
export function indexBy<T, K extends string | number>(
  collection: Iterable<T> | Each<T>,
  fn?: (item: T) => K,
): Record<K, T> | Enumerator<T> {
  if (fn !== undefined) {
    const result = Object.create(null) as Record<K, T>;
    const block = (elem: T): void => {
      result[fn(elem)] = elem;
    };
    if (typeof (collection as Partial<Each<T>>).each === "function") {
      (collection as Each<T>).each(block);
    } else {
      for (const elem of collection as Iterable<T>) block(elem);
    }
    return result;
  } else {
    return toEnum<T>(
      collection as object,
      "indexBy",
      block(() => (rbObjRespondTo(collection, "size") ? size(collection) : null)),
    );
  }
}

export function indexWith<V>(
  collection: Iterable<string> | Each<string>,
  defaultOrBlock: V | ((elem: string) => V),
): Record<string, V>;
export function indexWith<T, V>(
  collection: Iterable<T> | Each<T>,
  defaultOrBlock: V | ((elem: T) => V),
): Hash<T, V> | Record<string, V>;
export function indexWith<T>(collection: Iterable<T> | Each<T>): Enumerator<T>;
export function indexWith<T, V>(
  collection: Iterable<T> | Each<T>,
  defaultOrBlock?: V | ((elem: T) => V),
): Hash<T, V> | Record<string, V> | Enumerator<T> {
  const noDefault = arguments.length < 2;
  const each = (block: (elem: T, result: Hash<T, V> | Record<string, V>) => void) => {
    const elems = toA(collection);
    const result: Hash<T, V> | Record<string, V> = elems.every((elem) => typeof elem === "string")
      ? {}
      : new Hash<T, V>();
    for (const elem of elems) block(elem, result);
    return result;
  };
  const aset = (result: Hash<T, V> | Record<string, V>, elem: T, value: V): unknown =>
    result instanceof Hash ? result.set(elem, value) : hashAset(result, elem as string, value);
  if (typeof defaultOrBlock === "function") {
    const block = defaultOrBlock as (elem: T) => V;
    return each((elem, result) => aset(result, elem, block(elem)));
  } else if (noDefault) {
    return toEnum<T>(
      collection as object,
      "indexWith",
      block(() => (rbObjRespondTo(collection, "size") ? size(collection) : null)),
    );
  } else {
    return each((elem, result) => aset(result, elem, defaultOrBlock as V));
  }
}

export function pluck<T, K extends keyof T>(
  collection: Iterable<T> | Each<T>,
  ...keys: K[]
): T[K][] | T[K][][] {
  if (many(keys)) {
    return map(collection, (element) =>
      keys.map((key) => hashAref(element as object, key) as T[K]),
    );
  } else {
    const key = keys[0];
    return map(collection, (element) => hashAref(element as object, key) as T[K]);
  }
}

export function maximum<T, R>(collection: Iterable<T> | Each<T>, key: (item: T) => R): R | null {
  return max(map(collection, key));
}

export function minimum<T, R>(collection: Iterable<T> | Each<T>, key: (item: T) => R): R | null {
  return min(map(collection, key));
}

export function compactBlank<T>(collection: Iterable<T> | Each<T>): T[] {
  return reject(collection, (item) => isBlank(item));
}

export function any<T>(collection: readonly T[], fn?: (item: T) => unknown): boolean {
  for (const item of collection) {
    const value = fn ? fn(item) : item;
    if (value != null && value !== false) return true;
  }
  return false;
}

export function many<T>(collection: Iterable<T> | Each<T>, fn?: (item: T) => unknown): boolean {
  let cnt = 0;
  if (fn) {
    return isAny(collection, (elem: T) => {
      const result = fn(elem);
      if (result != null && result !== false) cnt += 1;
      return cnt > 1;
    });
  } else {
    return isAny(collection, () => (cnt += 1) > 1);
  }
}

export function excluding<T extends Record<string, unknown>>(
  collection: T,
  ...elements: unknown[]
): Partial<T>;
export function excluding<T>(collection: Iterable<T> | Each<T>, ...elements: unknown[]): T[];
export function excluding(collection: unknown, ...elements: unknown[]): unknown {
  elements = elements.flat(1);
  if (isPlainObject(collection)) {
    return Object.fromEntries(
      Object.entries(collection).filter(([element]) => !elements.some((e) => rbEqual(e, element))),
    );
  }
  return reject(collection as Iterable<unknown> | Each<unknown>, (element) =>
    elements.some((e) => rbEqual(e, element)),
  );
}

export function including<T>(collection: Iterable<T> | Each<T>, ...elements: T[]): T[] {
  return [...toA(collection), ...elements];
}

export function inOrderOf<T>(
  collection: Iterable<T> | Each<T>,
  key: (item: T) => unknown,
  series: unknown[],
  options: { filter?: boolean } = {},
): T[] {
  const filter = options.filter !== false;
  if (filter) {
    return valuesAt(enumGroupBy(collection, key), ...series)
      .flat(1)
      .filter((v): v is T => v != null);
  } else {
    const position = (v: T): number => {
      const index = series.findIndex((s) => rbEqual(s, key(v)));
      return index === -1 ? series.length : index;
    };
    return sortBy(collection, position).filter((v) => v != null);
  }
}

export function exclude<T>(collection: Iterable<T> | Each<T>, object: T): boolean {
  return !isInclude(collection, object);
}

export function without<T>(collection: T[], ...elements: T[]): T[] {
  return excluding(collection, ...elements);
}

export function pick<T, K extends keyof T>(
  collection: Iterable<T> | Each<T>,
  ...keys: K[]
): T[K] | T[K][] | null {
  if (isNone(collection)) return null;

  if (many(keys)) {
    return keys.map((key) => hashAref(first(collection) as object, key) as T[K]);
  } else {
    return hashAref(first(collection) as object, keys[0]) as T[K];
  }
}

export function sole<T>(collection: Iterable<T> | Each<T>): T {
  switch (count(collection)) {
    case 1:
      return first(collection) as T;
    case 0:
      throw new SoleItemExpectedError("no item found");
    default:
      throw new SoleItemExpectedError("multiple items found");
  }
}
