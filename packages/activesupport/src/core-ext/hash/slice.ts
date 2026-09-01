import { Hash } from "@blazetrails/ruby-compat";
import { slice } from "../../hash-utils.js";

type AnyObject = Record<string, unknown>;

/**
 * Replaces the hash with only the given keys, returning the removed
 * key/value pairs — Ruby's `Hash#slice!` (core_ext/hash/slice.rb:10-17).
 *
 * `hash.default` / `hash.default_proc` (slice.rb:13-14) land on the seat
 * `@blazetrails/ruby-compat`'s `Hash` carries; a plain object has none, so the
 * `Record` arm is the receiver Rails' two lines have nothing to copy from.
 * `replace(hash)` (slice.rb:15) is the own-key clear plus `Object.assign` —
 * JS objects carry no `replace`.
 */
export function sliceBang<K, V>(hash: Hash<K, V>, ...keys: K[]): Hash<K, V>;
export function sliceBang<T extends AnyObject>(hash: T, ...keys: string[]): Partial<T>;
export function sliceBang(
  hash: Hash<unknown, unknown> | AnyObject,
  ...keys: unknown[]
): Hash<unknown, unknown> | Partial<AnyObject> {
  if (hash instanceof Hash) {
    const omit = new Hash<unknown, unknown>();
    for (const [key, value] of hash) {
      if (!keys.includes(key)) omit.set(key, value);
    }
    const result = new Hash<unknown, unknown>();
    for (const key of keys) {
      if (hash.has(key)) result.set(key, hash.get(key));
    }
    result.setDefault(hash.default());
    if (hash.defaultProc()) result.setDefaultProc(hash.defaultProc());
    hash.clear();
    for (const [key, value] of result) hash.set(key, value);
    return omit;
  }

  const omit = slice(hash, ...Object.keys(hash).filter((k) => !keys.includes(k)));
  const result = slice(hash, ...(keys as string[]));
  for (const key of Object.keys(hash)) delete hash[key];
  Object.assign(hash, result);
  return omit;
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
