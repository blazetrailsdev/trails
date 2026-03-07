/**
 * Enumerable utilities mirroring Rails ActiveSupport enumerable extensions.
 */

import { isBlank } from "./string-utils.js";

/**
 * Sum the collection, optionally mapping each element first.
 */
export function sum<T>(collection: T[], fn?: (item: T) => number): number {
  if (fn) {
    return collection.reduce((acc, item) => acc + fn(item), 0);
  }
  return collection.reduce((acc, item) => acc + (item as unknown as number), 0);
}

/**
 * Index a collection by a key function. Last value wins for duplicate keys.
 */
export function indexBy<T, K extends string | number>(
  collection: T[],
  fn: (item: T) => K
): Record<K, T> {
  const result = {} as Record<K, T>;
  for (const item of collection) {
    result[fn(item)] = item;
  }
  return result;
}

/**
 * Group a collection by a key function.
 */
export function groupBy<T, K extends string | number>(
  collection: T[],
  fn: (item: T) => K
): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of collection) {
    const key = fn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

/**
 * Extract a single property from each element.
 */
export function pluck<T, K extends keyof T>(collection: T[], key: K): T[K][] {
  return collection.map((item) => item[key]);
}

/**
 * Find the maximum value in a collection using a mapper function.
 */
export function maximum<T>(collection: T[], fn: (item: T) => number): number | undefined {
  if (collection.length === 0) return undefined;
  return Math.max(...collection.map(fn));
}

/**
 * Find the minimum value in a collection using a mapper function.
 */
export function minimum<T>(collection: T[], fn: (item: T) => number): number | undefined {
  if (collection.length === 0) return undefined;
  return Math.min(...collection.map(fn));
}

/**
 * Yield chunks of the given size.
 */
export function inBatchesOf<T>(collection: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < collection.length; i += size) {
    result.push(collection.slice(i, i + size));
  }
  return result;
}

/**
 * Remove blank values from a collection (using ActiveSupport's isBlank).
 */
export function compactBlank<T>(collection: T[]): T[] {
  return collection.filter((item) => !isBlank(item));
}

/**
 * many? — true if more than one element (optionally matching a predicate).
 */
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

/**
 * tally — count occurrences of each element.
 */
export function tally<T extends string | number>(collection: T[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of collection) {
    const key = String(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

/**
 * filterMap — map and remove null/undefined results.
 */
export function filterMap<T, U>(
  collection: T[],
  fn: (item: T) => U | null | undefined
): U[] {
  const result: U[] = [];
  for (const item of collection) {
    const mapped = fn(item);
    if (mapped !== null && mapped !== undefined) {
      result.push(mapped);
    }
  }
  return result;
}

/**
 * excluding — remove elements from collection (alias for without).
 */
export function excluding<T>(collection: T[], ...others: T[]): T[] {
  const set = new Set(others);
  return collection.filter((item) => !set.has(item));
}

/**
 * including — append elements to collection.
 */
export function including<T>(collection: T[], ...others: T[]): T[] {
  return [...collection, ...others];
}

/**
 * minBy — find element with minimum mapped value.
 */
export function minBy<T>(collection: T[], fn: (item: T) => number): T | undefined {
  if (collection.length === 0) return undefined;
  return collection.reduce((best, item) => (fn(item) < fn(best) ? item : best));
}

/**
 * maxBy — find element with maximum mapped value.
 */
export function maxBy<T>(collection: T[], fn: (item: T) => number): T | undefined {
  if (collection.length === 0) return undefined;
  return collection.reduce((best, item) => (fn(item) > fn(best) ? item : best));
}

/**
 * eachCons — sliding window of size n.
 */
export function eachCons<T>(collection: T[], n: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i <= collection.length - n; i++) {
    result.push(collection.slice(i, i + n));
  }
  return result;
}

/**
 * eachSlice — split into chunks of size n.
 */
export function eachSlice<T>(collection: T[], n: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < collection.length; i += n) {
    result.push(collection.slice(i, i + n));
  }
  return result;
}

/**
 * inOrderOf — reorder collection by a series of key values.
 * Elements not in the series are dropped by default (filter: true).
 * With filter: false, unmatched elements are appended at the end in original order.
 */
export function inOrderOf<T>(
  collection: T[],
  fn: (item: T) => unknown,
  series: unknown[],
  options: { filter?: boolean } = {}
): T[] {
  const filter = options.filter !== false;
  const seriesMap = new Map<unknown, T[]>();
  for (const key of series) {
    seriesMap.set(key, []);
  }

  const unmatched: T[] = [];
  for (const item of collection) {
    const key = fn(item);
    if (seriesMap.has(key)) {
      seriesMap.get(key)!.push(item);
    } else {
      unmatched.push(item);
    }
  }

  const ordered: T[] = [];
  for (const key of series) {
    ordered.push(...(seriesMap.get(key) ?? []));
  }

  if (!filter) {
    ordered.push(...unmatched);
  }

  return ordered;
}

/**
 * exclude? — true if the element is NOT in the collection.
 * Mirrors Enumerable#exclude? from Rails.
 */
export function exclude<T>(collection: T[], value: T): boolean {
  return !collection.includes(value);
}

/**
 * without — alias for excluding (Rails uses both names).
 */
export function without<T>(collection: T[], ...others: T[]): T[] {
  return excluding(collection, ...others);
}

/**
 * pick — returns the value of the first key from each element.
 * Mirrors Enumerable#pick: `payments.pick(:price)` → first price value.
 * In TS: pick(collection, key) → collection[0][key]
 */
export function pick<T, K extends keyof T>(collection: T[], key: K): T[K] | undefined {
  return collection[0]?.[key];
}

/**
 * sole — returns the only element; raises if count is not exactly one.
 * Mirrors Enumerable#sole.
 */
export function sole<T>(collection: T[], fn?: (item: T) => boolean): T {
  const filtered = fn ? collection.filter(fn) : collection;
  if (filtered.length === 0) throw new Error("no matching element found");
  if (filtered.length > 1) throw new Error(`multiple elements found (${filtered.length})`);
  return filtered[0];
}

/**
 * isIn — checks if a value is contained in a collection.
 * Mirrors Ruby's Object#in?.
 */
export function isIn<T>(
  value: T,
  collection: T[] | Set<T> | string | Record<string, unknown>
): boolean {
  if (Array.isArray(collection)) return collection.includes(value);
  if (collection instanceof Set) return collection.has(value);
  if (typeof collection === "string") return collection.includes(value as unknown as string);
  if (typeof collection === "object" && collection !== null) {
    return Object.prototype.hasOwnProperty.call(collection, value as string);
  }
  return false;
}

/**
 * presenceIn — returns the value if it is in the collection, otherwise null.
 * Mirrors Ruby's Object#presence_in.
 */
export function presenceIn<T>(
  value: T,
  collection: T[] | Set<T> | string | Record<string, unknown>
): T | null {
  return isIn(value, collection) ? value : null;
}
