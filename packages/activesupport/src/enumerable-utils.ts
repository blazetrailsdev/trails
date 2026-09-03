import { valuesAt } from "./hash-utils.js";
import { isBlank } from "./string-utils.js";

export function sum<T>(collection: T[], fn?: (item: T) => number): number;
export function sum<T>(collection: T[], initialValue: number, fn?: (item: T) => number): number;
export function sum<T>(
  collection: T[],
  initialValueOrFn?: number | ((item: T) => number),
  fn?: (item: T) => number,
): number {
  const initialValue = typeof initialValueOrFn === "number" ? initialValueOrFn : 0;
  const block = typeof initialValueOrFn === "function" ? initialValueOrFn : fn;
  if (block) {
    return collection.reduce((acc, item) => acc + block(item), initialValue);
  }
  return collection.reduce((acc, item) => acc + (item as unknown as number), initialValue);
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

export function excluding<T>(collection: T[], ...elements: T[]): T[] {
  const set = new Set(elements);
  return collection.filter((item) => !set.has(item));
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

export function isIn<T>(
  value: T,
  collection: T[] | Set<T> | string | Record<string, unknown>,
): boolean {
  if (Array.isArray(collection)) return collection.includes(value);
  if (collection instanceof Set) return collection.has(value);
  if (typeof collection === "string") return collection.includes(value as unknown as string);
  if (typeof collection === "object" && collection !== null) {
    return Object.prototype.hasOwnProperty.call(collection, value as string);
  }
  return false;
}

export function presenceIn<T>(
  value: T,
  collection: T[] | Set<T> | string | Record<string, unknown>,
): T | null {
  return isIn(value, collection) ? value : null;
}
