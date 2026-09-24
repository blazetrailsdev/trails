import {
  NoMethodError,
  Rational,
  TypeError,
  rbBuiltinClassName,
  rbEqual,
  rbObjClass,
} from "@blazetrails/ruby-compat";
import { isPlainObject, valuesAt } from "./hash-utils.js";
import { isBlank } from "./string-utils.js";

/**
 * Ruby core `Enumerable#sum` (`vendor/ruby/enum.c:4760` `enum_sum`), which
 * Rails' `core_ext/enumerable.rb` inherits rather than defines: `init` (default
 * `0`) is added to each element (or each block value) by the element's own `+`.
 */
export function sum(collection: Iterable<number>): number;
export function sum<T>(collection: Iterable<T>, block: (element: T) => number): number;
export function sum<T>(collection: Iterable<T>, ...args: unknown[]): unknown;
export function sum<T>(collection: Iterable<T>, ...args: unknown[]): unknown {
  const block =
    typeof args[args.length - 1] === "function"
      ? (args.pop() as (element: T) => unknown)
      : undefined;
  let v: unknown = args.length === 0 ? 0 : args[0];
  for (const element of collection) {
    const i = block ? block(element) : element;
    v = sumIterSomeValue(v, i);
  }
  return v;
}

/** `sum_iter_some_value` (`vendor/ruby/enum.c:4581`): `memo->v + i`. */
function sumIterSomeValue(v: unknown, i: unknown): unknown {
  if (typeof v === "number" || typeof v === "bigint" || v instanceof Rational) {
    return numericPlus(v, i);
  }
  if (typeof v === "string") {
    if (typeof i !== "string") {
      throw new TypeError(`no implicit conversion of ${rbBuiltinClassName(i)} into String`);
    }
    return v + i;
  }
  if (Array.isArray(v)) {
    if (!Array.isArray(i)) {
      throw new TypeError(`no implicit conversion of ${rbBuiltinClassName(i)} into Array`);
    }
    return [...v, ...i];
  }
  const plus = (v as { plus?: unknown } | null)?.plus;
  if (typeof plus === "function") return plus.call(v, i);
  throw new NoMethodError(
    `undefined method '+' for ${v == null ? "nil" : `an instance of ${rbObjClass(v)}`}`,
  );
}

/**
 * `Integer#+` / `Float#+` / `Rational#+` (`vendor/ruby/numeric.c` `rb_int_plus`,
 * `rb_float_plus`, `vendor/ruby/rational.c:724` `rb_rational_plus`); a
 * non-numeric addend goes through `rb_num_coerce_bin`.
 */
function numericPlus(v: number | bigint | Rational, i: unknown): unknown {
  if (i instanceof Rational || v instanceof Rational) {
    const [r, other] = v instanceof Rational ? [v, i] : [i as Rational, v];
    if (typeof other === "number" && !Number.isInteger(other)) return r.toF() + other;
    if (typeof other === "number" || typeof other === "bigint" || other instanceof Rational) {
      return r.add(other);
    }
  } else if (typeof i === "number" || typeof i === "bigint") {
    if (typeof v === typeof i) return (v as number) + (i as number);
    const [n, b] = typeof v === "bigint" ? [i as number, v] : [v, i as bigint];
    return Number.isInteger(n) ? BigInt(n) + b : n + Number(b);
  }
  // `do_coerce` (`vendor/ruby/numeric.c:448`).
  const coerce = (i as { coerce?: unknown } | null)?.coerce;
  if (typeof coerce !== "function") {
    throw new TypeError(`${rbBuiltinClassName(i)} can't be coerced into ${rbObjClass(v)}`);
  }
  const [x, y] = coerce.call(i, v) as [unknown, unknown];
  return sumIterSomeValue(x, y);
}

export function indexBy<T, K extends string | number>(
  collection: T[],
  fn: (item: T) => K,
): Record<K, T> {
  const result = {} as Record<K, T>;
  for (const item of collection) {
    result[fn(item)] = item;
  }
  return result;
}

export function indexWith<T, V>(collection: T[], defaultOrBlock: V | ((elem: T) => V)): Map<T, V> {
  const result = new Map<T, V>();
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
    return collection.map((element) => keys.map((key) => element[key]));
  } else {
    const key = keys[0];
    return collection.map((element) => element[key]);
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

export function filterMap<T, U>(collection: T[], fn: (item: T) => U | null | undefined): U[] {
  const result: U[] = [];
  for (const item of collection) {
    const mapped = fn(item);
    if (mapped !== null && mapped !== undefined) {
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

export function eachCons<T>(collection: T[], n: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i <= collection.length - n; i++) {
    result.push(collection.slice(i, i + n));
  }
  return result;
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
    return keys.map((key) => collection[0][key]);
  } else {
    return collection[0][keys[0]];
  }
}

export function sole<T>(collection: T[], fn?: (item: T) => boolean): T {
  const filtered = fn ? collection.filter(fn) : collection;
  if (filtered.length === 0) throw new Error("no matching element found");
  if (filtered.length > 1) throw new Error(`multiple elements found (${filtered.length})`);
  return filtered[0];
}
