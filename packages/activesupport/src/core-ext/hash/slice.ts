import { Hash } from "@blazetrails/ruby-compat";
import { slice } from "../../hash-utils.js";

type AnyObject = Record<string, unknown>;

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
