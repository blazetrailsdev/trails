import { slice } from "../../hash-utils.js";

type AnyObject = Record<string, unknown>;

/**
 * Replaces the hash with only the given keys, returning the removed
 * key/value pairs — Ruby's `Hash#slice!` (core_ext/hash/slice.rb:10-17).
 *
 * `hash.default` / `hash.default_proc` have no JS analogue: a plain object has
 * no default-value seat, so slice.rb:13-14 has nothing to copy over.
 * `replace(hash)` (slice.rb:15) is the own-key clear plus `Object.assign` —
 * JS objects carry no `replace`.
 */
export function sliceBang<T extends AnyObject>(hash: T, ...keys: string[]): Partial<T> {
  const omit = slice(hash, ...(Object.keys(hash).filter((k) => !keys.includes(k)) as (keyof T)[]));
  const result = slice(hash, ...(keys as (keyof T)[]));
  for (const key of Object.keys(hash)) delete hash[key];
  Object.assign(hash, result);
  return omit as Partial<T>;
}

/**
 * Removes and returns the key/value pairs matching the given keys, mutating
 * the receiver — Ruby's `Hash#extract!` (core_ext/hash/slice.rb:24-26).
 */
export function extractBang<T extends AnyObject>(obj: T, ...keys: string[]): Partial<T> {
  const result: Partial<T> = {};
  for (const key of keys) {
    if (Object.hasOwn(obj, key)) {
      result[key as keyof T] = obj[key as keyof T];
      delete obj[key as keyof T];
    }
  }
  return result;
}
