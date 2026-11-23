import {
  ENUMERABLE_METHOD_TABLE,
  Enumerable,
  StandardError,
  max,
  rbBigNorm,
  rbFSend,
  rbIntegerTypeP,
  rbPlus,
  TopLevel,
  rbClearMethodCache,
} from "@blazetrails/ruby-compat";
import { Range } from "@blazetrails/ruby-compat/range";
import {
  block,
  type Each,
  groupBy as enumGroupBy,
  Hash,
  hashAref,
  hashAset,
  isAny,
  isNone,
  map,
  min,
  rbEqual,
  rbObjRespondTo,
  size,
  sortBy,
  toEnum,
  type Enumerator,
} from "@blazetrails/ruby-compat";
import { first, isInclude, reject, toA } from "@blazetrails/ruby-compat/enumerable";
import { sum as enumerableSum } from "../enumerable-utils.js";
import { isPlainObject, valuesAt } from "../hash-utils.js";
import { isBlank } from "../string-utils.js";

export class SoleItemExpectedError extends StandardError {}

export function minimum<T>(
  collection: Iterable<T> | Each<T>,
  key: string | ((item: T) => unknown),
): unknown {
  return min(
    map(collection, typeof key === "function" ? key : (element: T) => rbFSend(element, key)),
  );
}

export function maximum<T>(
  collection: Iterable<T> | Each<T>,
  key: string | ((item: T) => unknown),
): unknown {
  return max(
    map(collection, typeof key === "function" ? key : (element: T) => rbFSend(element, key)),
  );
}

export function indexBy<T, K extends string>(
  collection: Iterable<T> | Each<T>,
  fn: (item: T) => K,
): Record<K, T>;
export function indexBy<T, K>(collection: Iterable<T> | Each<T>, fn: (item: T) => K): Hash<K, T>;
export function indexBy<T>(collection: Iterable<T> | Each<T>): Enumerator<T>;
export function indexBy<T, K>(
  collection: Iterable<T> | Each<T>,
  fn?: (item: T) => K,
): Record<string, T> | Hash<K, T> | Enumerator<T> {
  if (fn !== undefined) {
    const result = new Hash<K, T>();
    const block = (elem: T): void => {
      result.set(fn(elem), elem);
    };
    if (typeof (collection as Partial<Each<T>>).each === "function") {
      (collection as Each<T>).each(block);
    } else {
      for (const elem of collection as Iterable<T>) block(elem);
    }
    if (result.size === 0) return result;
    for (const key of result.keys()) if (typeof key !== "string") return result;
    return Object.assign(Object.create(null), Object.fromEntries(result)) as Record<string, T>;
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

export function compactBlank<T>(collection: Iterable<T> | Each<T>): T[] {
  return reject(collection, (item) => isBlank(item));
}

export function compactBlankBang<T>(self: T[]): T[] {
  for (let i = self.length - 1; i >= 0; i--) {
    if (isBlank(self[i])) self.splice(i, 1);
  }
  return self;
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
  let result: unknown = null;
  let found = false;

  const block = (...element: unknown[]): void => {
    if (found) {
      throw new SoleItemExpectedError("multiple items found");
    }

    result = element.length === 1 ? element[0] : element;
    found = true;
  };
  if (typeof (collection as Partial<Each<T>>).each === "function") {
    (collection as Each<T>).each(block);
  } else {
    for (const elem of collection as Iterable<T>) block(elem);
  }

  if (found) {
    return result as T;
  } else {
    throw new SoleItemExpectedError("no item found");
  }
}

ENUMERABLE_METHOD_TABLE.maximum = (self: Iterable<unknown>, key: string) => maximum(self, key);

ENUMERABLE_METHOD_TABLE.indexBy = (self: Iterable<unknown>, block?: (elem: unknown) => string) =>
  block === undefined ? indexBy(self) : indexBy(self, block);

ENUMERABLE_METHOD_TABLE.indexWith = (self: Iterable<unknown>, ...args: unknown[]) =>
  args.length === 0 ? indexWith(self) : indexWith(self, args[0]);

ENUMERABLE_METHOD_TABLE.isExclude = (self: Iterable<unknown>, object: unknown) =>
  exclude([...self], object);

export function sum<T>(
  this: Range<T>,
  initialValue: unknown = 0,
  block?: (element: T) => unknown,
): unknown {
  const first = this.first();
  const last = this.last();
  if (block !== undefined || !(rbIntegerTypeP(first) && rbIntegerTypeP(last))) {
    return enumerableSum(this, initialValue, ...(block === undefined ? [] : [block]));
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
rbClearMethodCache();

TopLevel.Enumerable = Enumerable;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Enumerable?: typeof Enumerable;
  }
}
