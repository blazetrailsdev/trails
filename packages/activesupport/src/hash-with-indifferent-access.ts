/**
 * HashWithIndifferentAccess — a Map-like class where string keys are
 * normalized so that camelCase and snake_case (or any variation) are NOT
 * conflated. This mirrors Rails' HashWithIndifferentAccess where string
 * and symbol keys are interchangeable. In TypeScript, since we only have
 * strings, the main value is the consistent Map-based API with merge,
 * slice, except, and deepMerge support.
 */

import { deepMerge as deepMergeObj } from "./hash-utils.js";

type AnyObject = Record<string, unknown>;

export class HashWithIndifferentAccess<V = unknown> {
  private data: Map<string, V>;

  constructor(obj?: AnyObject | Map<string, V>) {
    this.data = new Map();
    if (obj) {
      if (obj instanceof Map) {
        for (const [key, value] of obj) {
          this.data.set(String(key), value);
        }
      } else {
        for (const key of Object.keys(obj)) {
          this.data.set(key, obj[key] as V);
        }
      }
    }
  }

  get(key: string): V | undefined {
    return this.data.get(key);
  }

  set(key: string, value: V): this {
    this.data.set(key, value);
    return this;
  }

  /** Alias for set — Rails store method. */
  store(key: string, value: V): this {
    return this.set(key, value);
  }

  delete(key: string): boolean {
    return this.data.delete(key);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  get size(): number {
    return this.data.size;
  }

  keys(): IterableIterator<string> {
    return this.data.keys();
  }

  values(): IterableIterator<V> {
    return this.data.values();
  }

  entries(): IterableIterator<[string, V]> {
    return this.data.entries();
  }

  forEach(fn: (value: V, key: string) => void): void {
    this.data.forEach(fn);
  }

  /**
   * Merge another object or HashWithIndifferentAccess, returning a new instance.
   */
  merge(other: AnyObject | HashWithIndifferentAccess<V>): HashWithIndifferentAccess<V> {
    const result = new HashWithIndifferentAccess<V>();
    for (const [k, v] of this.data) {
      result.set(k, v);
    }
    if (other instanceof HashWithIndifferentAccess) {
      for (const [k, v] of other.entries()) {
        result.set(k, v);
      }
    } else {
      for (const key of Object.keys(other)) {
        result.set(key, other[key] as V);
      }
    }
    return result;
  }

  /**
   * Update (merge!) — mutates self by merging other objects into it. Returns self.
   * Mirrors Rails HashWithIndifferentAccess#update.
   */
  update(...others: (AnyObject | HashWithIndifferentAccess<V>)[]): this {
    for (const other of others) {
      if (other instanceof HashWithIndifferentAccess) {
        for (const [k, v] of other.entries()) {
          this.data.set(k, v);
        }
      } else {
        for (const key of Object.keys(other)) {
          this.data.set(key, other[key] as V);
        }
      }
    }
    return this;
  }

  /**
   * Replace — clears and repopulates with the given object. Returns self.
   */
  replace(other: AnyObject | HashWithIndifferentAccess<V>): this {
    this.data.clear();
    return this.update(other);
  }

  /**
   * Deep merge, recursively merging nested objects.
   */
  deepMerge(other: AnyObject | HashWithIndifferentAccess<V>): HashWithIndifferentAccess<V> {
    const selfObj = this.toHash();
    const otherObj = other instanceof HashWithIndifferentAccess ? other.toHash() : other;
    const merged = deepMergeObj(selfObj, otherObj as AnyObject);
    return new HashWithIndifferentAccess<V>(merged);
  }

  /**
   * Return a new HashWithIndifferentAccess with only the specified keys.
   */
  slice(...keys: string[]): HashWithIndifferentAccess<V> {
    const result = new HashWithIndifferentAccess<V>();
    for (const key of keys) {
      if (this.data.has(key)) {
        result.set(key, this.data.get(key)!);
      }
    }
    return result;
  }

  /**
   * Return a new HashWithIndifferentAccess without the specified keys.
   */
  except(...keys: string[]): HashWithIndifferentAccess<V> {
    const keySet = new Set(keys);
    const result = new HashWithIndifferentAccess<V>();
    for (const [k, v] of this.data) {
      if (!keySet.has(k)) {
        result.set(k, v);
      }
    }
    return result;
  }

  /**
   * Alias for except — Rails without method.
   */
  without(...keys: string[]): HashWithIndifferentAccess<V> {
    return this.except(...keys);
  }

  /**
   * Select — returns new HWIA with pairs where predicate returns true.
   */
  select(fn: (key: string, value: V) => boolean): HashWithIndifferentAccess<V> {
    const result = new HashWithIndifferentAccess<V>();
    for (const [k, v] of this.data) {
      if (fn(k, v)) {
        result.set(k, v);
      }
    }
    return result;
  }

  /**
   * Reject — returns new HWIA with pairs where predicate returns false.
   */
  reject(fn: (key: string, value: V) => boolean): HashWithIndifferentAccess<V> {
    return this.select((k, v) => !fn(k, v));
  }

  /**
   * Transform keys — returns new HWIA with transformed keys.
   */
  transformKeys(fn: (key: string) => string): HashWithIndifferentAccess<V> {
    const result = new HashWithIndifferentAccess<V>();
    for (const [k, v] of this.data) {
      result.set(fn(k), v);
    }
    return result;
  }

  /**
   * Transform values — returns new HWIA with transformed values.
   */
  transformValues<W = V>(fn: (value: V) => W): HashWithIndifferentAccess<W> {
    const result = new HashWithIndifferentAccess<W>();
    for (const [k, v] of this.data) {
      result.set(k, fn(v));
    }
    return result;
  }

  /**
   * Compact — removes null and undefined values, returning a new HWIA.
   */
  compact(): HashWithIndifferentAccess<NonNullable<V>> {
    const result = new HashWithIndifferentAccess<NonNullable<V>>();
    for (const [k, v] of this.data) {
      if (v !== null && v !== undefined) {
        result.set(k, v as NonNullable<V>);
      }
    }
    return result;
  }

  /**
   * any() — true if any entries exist.
   */
  any(): boolean {
    return this.data.size > 0;
  }

  /**
   * anyWith — true if predicate matches at least one pair.
   */
  anyWith(fn: (key: string, value: V) => boolean): boolean {
    for (const [k, v] of this.data) {
      if (fn(k, v)) return true;
    }
    return false;
  }

  /**
   * allWith — true if predicate matches all pairs.
   */
  allWith(fn: (key: string, value: V) => boolean): boolean {
    for (const [k, v] of this.data) {
      if (!fn(k, v)) return false;
    }
    return true;
  }

  /**
   * noneWith — true if predicate matches no pairs.
   */
  noneWith(fn: (key: string, value: V) => boolean): boolean {
    return !this.anyWith(fn);
  }

  /**
   * count — count all entries or matching entries.
   */
  count(fn?: (key: string, value: V) => boolean): number {
    if (!fn) return this.data.size;
    let n = 0;
    for (const [k, v] of this.data) {
      if (fn(k, v)) n++;
    }
    return n;
  }

  /**
   * find — returns the first [key, value] pair matching predicate, or undefined.
   */
  find(fn: (key: string, value: V) => boolean): [string, V] | undefined {
    for (const [k, v] of this.data) {
      if (fn(k, v)) return [k, v];
    }
    return undefined;
  }

  /**
   * each — iterate key-value pairs.
   */
  each(fn: (key: string, value: V) => void): this {
    for (const [k, v] of this.data) {
      fn(k, v);
    }
    return this;
  }

  /**
   * map — map over entries, returning an array.
   */
  map<T>(fn: (key: string, value: V) => T): T[] {
    const result: T[] = [];
    for (const [k, v] of this.data) {
      result.push(fn(k, v));
    }
    return result;
  }

  /**
   * flatMap — flatMap over entries, returning a flattened array.
   */
  flatMap<T>(fn: (key: string, value: V) => T[]): T[] {
    const result: T[] = [];
    for (const [k, v] of this.data) {
      result.push(...fn(k, v));
    }
    return result;
  }

  /**
   * assoc — returns [key, value] pair for the given key, or undefined.
   */
  assoc(key: string): [string, V] | undefined {
    if (this.data.has(key)) {
      return [key, this.data.get(key)!];
    }
    return undefined;
  }

  /**
   * rassoc — returns [key, value] by value match, or undefined.
   */
  rassoc(value: V): [string, V] | undefined {
    for (const [k, v] of this.data) {
      if (v === value) return [k, v];
    }
    return undefined;
  }

  /**
   * invert — swaps keys and values, returning a new HWIA.
   */
  invert(): HashWithIndifferentAccess<string> {
    const result = new HashWithIndifferentAccess<string>();
    for (const [k, v] of this.data) {
      result.set(String(v), k);
    }
    return result;
  }

  /**
   * flatten — returns all key-value pairs as a flat array.
   */
  flatten(): unknown[] {
    const result: unknown[] = [];
    for (const [k, v] of this.data) {
      result.push(k, v);
    }
    return result;
  }

  /**
   * minBy — returns the [key, value] pair with the minimum computed value.
   */
  minBy(fn: (key: string, value: V) => number): [string, V] | undefined {
    let min: number | undefined;
    let minEntry: [string, V] | undefined;
    for (const [k, v] of this.data) {
      const n = fn(k, v);
      if (min === undefined || n < min) {
        min = n;
        minEntry = [k, v];
      }
    }
    return minEntry;
  }

  /**
   * maxBy — returns the [key, value] pair with the maximum computed value.
   */
  maxBy(fn: (key: string, value: V) => number): [string, V] | undefined {
    let max: number | undefined;
    let maxEntry: [string, V] | undefined;
    for (const [k, v] of this.data) {
      const n = fn(k, v);
      if (max === undefined || n > max) {
        max = n;
        maxEntry = [k, v];
      }
    }
    return maxEntry;
  }

  /**
   * dig — nested access using multiple keys.
   * Each intermediate value must be a HashWithIndifferentAccess or support get().
   */
  dig(key: string, ...rest: string[]): unknown {
    const val = this.data.get(key);
    if (rest.length === 0) return val;
    if (val === null || val === undefined) return undefined;
    if (val instanceof HashWithIndifferentAccess) {
      return val.dig(rest[0], ...rest.slice(1));
    }
    // For plain objects, fall through
    return undefined;
  }

  /**
   * toParam / toQuery — encode as URL query string.
   */
  toParam(): string {
    const parts: string[] = [];
    const sorted = [...this.data.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [k, v] of sorted) {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.join("&").replace(/%20/g, "+");
  }

  toQuery(): string {
    return this.toParam();
  }

  /**
   * withIndifferentAccess — returns a dup of self (already HWIA).
   */
  withIndifferentAccess(): HashWithIndifferentAccess<V> {
    return this.merge(new HashWithIndifferentAccess<V>());
  }

  /**
   * Return a plain object with all string keys (Rails' stringify_keys).
   * Returns a new HashWithIndifferentAccess since all keys are already strings.
   */
  stringifyKeys(): HashWithIndifferentAccess<V> {
    return new HashWithIndifferentAccess<V>(this.toHash());
  }

  /**
   * Return a plain object with all string keys (Rails' symbolize_keys).
   * In TS all keys are already strings; returns a plain object.
   */
  symbolizeKeys(): AnyObject {
    return this.toHash();
  }

  /**
   * Convert back to a plain object.
   */
  toHash(): AnyObject {
    const result: AnyObject = {};
    for (const [k, v] of this.data) {
      result[k] = v;
    }
    return result;
  }
}
