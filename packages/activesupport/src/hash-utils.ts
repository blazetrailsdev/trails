/**
 * Hash/object utilities mirroring Rails ActiveSupport hash extensions.
 */

import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";

type AnyObject = Record<string, unknown>;

/**
 * Mirrors Ruby's `ArgumentError`. Raised by {@link assertValidKeys} so callers
 * can `catch`/narrow on the Rails-faithful error type (`err.name ===
 * "ArgumentError"`) the way they would in Ruby.
 * @internal
 */
export class ArgumentError extends Error {
  override name = "ArgumentError";
}

/**
 * Mirrors Ruby's `Hash#values_at` — the values stored under each of the given
 * keys, in the order given, with `undefined` where a key is absent (Ruby's
 * `nil`, which the callers' `compact` drops).
 *
 * A Ruby Hash keys by value, so a `Map` receiver is the faithful shape wherever
 * the keys are not strings — `group_by(&key).values_at(*series)` over arbitrary
 * attribute values (core_ext/enumerable.rb:199).
 */
export function valuesAt<T>(hash: Record<string, T>, ...keys: string[]): (T | undefined)[];
export function valuesAt<K, T>(hash: Map<K, T>, ...keys: K[]): (T | undefined)[];
export function valuesAt(
  hash: Record<string, unknown> | Map<unknown, unknown>,
  ...keys: unknown[]
) {
  if (hash instanceof Map) return keys.map((key) => hash.get(key));
  return keys.map((key) => hash[key as string]);
}

/**
 * Deep merge two objects recursively. When both values are objects, they are
 * merged recursively. Otherwise the source value wins.
 */
export function deepMerge<T extends AnyObject>(target: T, source: AnyObject): T {
  const result = { ...target } as AnyObject;
  for (const key of Object.keys(source)) {
    const targetVal = result[key];
    const sourceVal = source[key];
    if (isPlainObject(targetVal) && isPlainObject(sourceVal)) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }
  return result as T;
}

/**
 * Deep merge `source` into `target` in place (mutating `target`).
 * Mirrors Ruby's Hash#deep_merge!.
 */
export function deepMergeInPlace<T extends AnyObject>(target: T, source: AnyObject): T {
  for (const key of Object.keys(source)) {
    const targetVal = target[key as keyof T];
    const sourceVal = source[key];
    if (isPlainObject(targetVal) && isPlainObject(sourceVal)) {
      deepMergeInPlace(targetVal as AnyObject, sourceVal);
    } else {
      (target as AnyObject)[key] = sourceVal;
    }
  }
  return target;
}

/**
 * Deep clone an object.
 */
export function deepDup<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item) => deepDup(item)) as T;
  if (typeof obj === "object" && isPlainObject(obj)) {
    const result: AnyObject = {};
    for (const key of Object.keys(obj as AnyObject)) {
      result[key] = deepDup((obj as AnyObject)[key]);
    }
    return result as T;
  }
  return obj;
}

/**
 * Pick only the specified keys from an object.
 */
export function slice<T extends AnyObject, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Return a copy of the object without the specified keys.
 */
export function except<T extends AnyObject, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

/**
 * Recursively transform all keys using the provided function.
 */
export function deepTransformKeys(obj: unknown, fn: (key: string) => string): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => deepTransformKeys(item, fn));
  }
  if (obj !== null && typeof obj === "object" && isPlainObject(obj)) {
    const result: AnyObject = {};
    for (const key of Object.keys(obj)) {
      result[fn(key)] = deepTransformKeys(obj[key], fn);
    }
    return result;
  }
  return obj;
}

/**
 * Recursively convert all keys to camelCase (Rails' symbolize_keys equivalent).
 */
export function deepCamelizeKeys(obj: unknown): unknown {
  return deepTransformKeys(obj, (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()));
}

/**
 * Recursively convert all keys to snake_case (Rails' stringify_keys equivalent).
 */
export function deepUnderscoreKeys(obj: unknown): unknown {
  return deepTransformKeys(obj, (key) =>
    key
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .replace(/^_/, ""),
  );
}

/**
 * By default, only instances of Hash itself are extractable.
 * Subclasses of Hash may implement this method and return
 * true to declare themselves as extractable. If a Hash
 * is extractable, `Array#extract_options!` pops it from
 * the Array when it is the last element of the Array.
 *
 * Ruby reopens `Hash`; the receiver is the first parameter here, and the
 * subclass override is a method on the subclass (see
 * {@link HashWithIndifferentAccess.isExtractableOptions}), which this function
 * dispatches to the way Ruby's method lookup would.
 */
export function isExtractableOptions(self: unknown): boolean {
  if (self !== null && typeof self === "object" && "isExtractableOptions" in self) {
    return (self as { isExtractableOptions(): boolean }).isExtractableOptions();
  }
  return isPlainObject(self);
}

/**
 * Extracts options from a set of arguments. Removes and returns the last
 * element in the array if it's a hash, otherwise returns a blank hash.
 *
 *   options(1, 2)        # => {}
 *   options(1, 2, a: :b) # => {:a=>:b}
 *
 * Ruby's `extract_options!` mutates the receiver and returns only the options;
 * the args array is returned alongside it here because a TS caller has no
 * `pop`-in-place idiom for a rest parameter.
 */
export function extractOptionsBang<T>(args: T[]): [T[], AnyObject] {
  const last = args[args.length - 1];
  const isHash = isPlainObject(last) || last instanceof HashWithIndifferentAccess;
  if (args.length > 0 && isHash && isExtractableOptions(last)) {
    return [args.slice(0, -1), last as unknown as AnyObject];
  }
  return [args, {}];
}

/**
 * Convert all keys to strings (Rails' stringify_keys).
 */
export function stringifyKeys<T extends AnyObject>(obj: T): Record<string, unknown> {
  return transformKeys(obj, (k) => String(k));
}

/**
 * Destructively converts all keys to strings — Ruby's `Hash#stringify_keys!`
 * (core_ext/hash/keys.rb:15-17). Mutates the receiver and returns it.
 */
export function stringifyKeysBang<T extends AnyObject>(hash: T): T {
  return transformKeysBang(hash, (k) => String(k));
}

/**
 * Recursively convert all keys to strings (Rails' deep_stringify_keys).
 */
export function deepStringifyKeys(obj: unknown): unknown {
  return deepTransformKeys(obj, (key) => String(key));
}

/**
 * Convert all keys to symbols — in TypeScript we use strings, so this is
 * equivalent to stringifyKeys but mirrors Rails' symbolize_keys semantics.
 */
export function symbolizeKeys<T extends AnyObject>(obj: T): Record<string, unknown> {
  return transformKeys(obj, (key) => key);
}

/**
 * Destructively converts all keys to symbols — Ruby's `Hash#symbolize_keys!`
 * (core_ext/hash/keys.rb:33-35). A Ruby Symbol is a JS string, so this is
 * `stringify_keys!`'s transform, exactly as `symbolize_keys` is
 * `stringify_keys`'s here.
 */
export function symbolizeKeysBang<T extends AnyObject>(hash: T): T {
  return transformKeysBang(hash, (key) => key);
}

/**
 * `alias_method :to_options, :symbolize_keys` (core_ext/hash/keys.rb:30).
 */
export const toOptions = symbolizeKeys;

/**
 * `alias_method :to_options!, :symbolize_keys!` (core_ext/hash/keys.rb:36).
 */
export const toOptionsBang = symbolizeKeysBang;

/**
 * Recursively convert all keys to symbols (strings in TS).
 */
export function deepSymbolizeKeys(obj: unknown): unknown {
  return deepStringifyKeys(obj);
}

/**
 * Destructively converts all keys by the block operation, through the root
 * hash and every nested hash and array — Ruby's `Hash#deep_transform_keys!`
 * (core_ext/hash/keys.rb:74-76).
 */
export function deepTransformKeysBang(hash: AnyObject, block: (key: string) => string): AnyObject {
  return _deepTransformKeysInObjectBang(hash, block) as AnyObject;
}

/**
 * Ruby's `Hash#deep_stringify_keys!` (core_ext/hash/keys.rb:90-92).
 */
export function deepStringifyKeysBang(hash: AnyObject): AnyObject {
  return deepTransformKeysBang(hash, (k) => String(k));
}

/**
 * Ruby's `Hash#deep_symbolize_keys!` (core_ext/hash/keys.rb:110-112).
 */
export function deepSymbolizeKeysBang(hash: AnyObject): AnyObject {
  return deepTransformKeysBang(hash, (key) => String(key));
}

/**
 * Support method for deep transforming nested hashes and arrays — Ruby's
 * private `Hash#_deep_transform_keys_in_object` (core_ext/hash/keys.rb:116-125).
 * @internal
 */
export function _deepTransformKeysInObject(
  object: unknown,
  block: (key: string) => string,
): unknown {
  if (isPlainObject(object)) {
    const result: AnyObject = {};
    for (const key of Object.keys(object)) {
      result[block(key)] = _deepTransformKeysInObject(object[key], block);
    }
    return result;
  } else if (Array.isArray(object)) {
    return object.map((e) => _deepTransformKeysInObject(e, block));
  } else {
    return object;
  }
}

/**
 * Ruby's private `Hash#_deep_transform_keys_in_object!`
 * (core_ext/hash/keys.rb:127-138). Ruby's `Array#map!` mutates in place; so
 * does this, so array identity survives the transform as it does in Ruby.
 * @internal
 */
export function _deepTransformKeysInObjectBang(
  object: unknown,
  block: (key: string) => string,
): unknown {
  if (isPlainObject(object)) {
    for (const key of Object.keys(object)) {
      const value = object[key];
      delete object[key];
      object[block(key)] = _deepTransformKeysInObjectBang(value, block);
    }
    return object;
  } else if (Array.isArray(object)) {
    for (let i = 0; i < object.length; i++) {
      object[i] = _deepTransformKeysInObjectBang(object[i], block);
    }
    return object;
  } else {
    return object;
  }
}

/**
 * Ruby's `Hash#transform_keys` — a new hash with each key replaced by the
 * block's result. The primitive the `keys.rb` key casts are written on top of.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Hash`, not Rails. `keys.rb` writes
 * every key cast on top of it (keys.rb:11, :22) but never defines it, so there
 * is no Rails method for the port to converge on; JS objects have no such
 * primitive, so it is spelled here in the file that consumes it.
 */
export function transformKeys<T extends AnyObject>(
  hash: T,
  block: (key: string) => string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(hash)) {
    result[block(key)] = hash[key];
  }
  return result;
}

/**
 * Ruby's `Hash#transform_keys!`, the in-place primitive the `keys.rb` bang
 * forms are written on top of.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Hash`, as {@link transformKeys} is.
 */
export function transformKeysBang<T extends AnyObject>(hash: T, block: (key: string) => string): T {
  for (const key of Object.keys(hash)) {
    const value = hash[key];
    delete hash[key];
    (hash as AnyObject)[block(key)] = value;
  }
  return hash;
}

/**
 * Merges the caller into `otherHash` — Ruby's `Hash#reverse_merge`
 * (core_ext/hash/reverse_merge.rb:14-16), which is literally
 * `other_hash.merge(self)`, so the result carries `other_hash`'s key ORDER
 * with the receiver's values winning (hash_ext_test.rb:317 asserts it).
 */
export function reverseMerge<T extends AnyObject>(obj: T, otherHash: AnyObject): T {
  return { ...otherHash, ...obj } as T;
}

/**
 * `alias_method :with_defaults, :reverse_merge`
 * (core_ext/hash/reverse_merge.rb:16).
 */
export const withDefaults = reverseMerge;

/**
 * Destructive `reverse_merge` — Ruby's `Hash#reverse_merge!`
 * (core_ext/hash/reverse_merge.rb:19-21), which `replace`s the receiver.
 */
export function reverseMergeBang<T extends AnyObject>(hash: T, otherHash: AnyObject): T {
  const merged = reverseMerge(hash, otherHash);
  for (const key of Object.keys(hash)) delete hash[key];
  Object.assign(hash, merged);
  return hash;
}

/**
 * `alias_method :reverse_update, :reverse_merge!`
 * (core_ext/hash/reverse_merge.rb:22).
 */
export const reverseUpdate = reverseMergeBang;

/**
 * `alias_method :with_defaults!, :reverse_merge!`
 * (core_ext/hash/reverse_merge.rb:23).
 */
export const withDefaultsBang = reverseMergeBang;

/**
 * Replaces the hash with only the given keys, returning the removed
 * key/value pairs — Ruby's `Hash#slice!` (core_ext/hash/slice.rb:10-17).
 */
export function sliceBang<T extends AnyObject>(hash: T, ...keys: string[]): Partial<T> {
  const omit = slice(hash, ...(Object.keys(hash).filter((k) => !keys.includes(k)) as (keyof T)[]));
  const result = slice(hash, ...(keys as (keyof T)[]));
  for (const key of Object.keys(hash)) delete hash[key];
  Object.assign(hash, result);
  return omit as Partial<T>;
}

/**
 * Removes the given keys from the hash and returns it — Ruby's `Hash#except!`
 * (core_ext/hash/except.rb:8-11).
 */
export function exceptBang<T extends AnyObject>(hash: T, ...keys: string[]): T {
  keys.forEach((key) => delete hash[key]);
  return hash;
}

/**
 * Returns a HashWithIndifferentAccess out of its receiver — Ruby's
 * `Hash#with_indifferent_access` (core_ext/hash/indifferent_access.rb:9). The
 * receiver is the first argument here because TypeScript has no way to define
 * the method on `Object.prototype`.
 */
export function withIndifferentAccess(obj: AnyObject): HashWithIndifferentAccess<unknown> {
  return new HashWithIndifferentAccess(obj);
}

/**
 * `alias nested_under_indifferent_access with_indifferent_access`
 * (core_ext/hash/indifferent_access.rb:23).
 */
export const nestedUnderIndifferentAccess = withIndifferentAccess;

/**
 * Assert that all keys in obj are within the allowed set of validKeys.
 * Throws ArgumentError if any key is invalid (Rails' assert_valid_keys).
 */
export function assertValidKeys(obj: AnyObject, validKeys: string[]): void {
  const validSet = new Set(validKeys);
  // Rails builds the message with Symbol#inspect on each key, so keys carry a
  // leading `:` (keys.rb:52). Our keys are strings, but we mirror the symbol
  // rendering to match hash_ext_test.rb:254's exact expectation. Symbol#inspect
  // bare-renders identifier-shaped symbols (`:name`) and quotes the rest
  // (`:"foo bar"`), so we branch on the same identifier shape.
  const inspect = (key: string): string =>
    /^[a-zA-Z_][a-zA-Z0-9_]*[?!=]?$/.test(key) ? `:${key}` : `:${JSON.stringify(key)}`;
  for (const key of Object.keys(obj)) {
    if (!validSet.has(key)) {
      throw new ArgumentError(
        `Unknown key: ${inspect(key)}. Valid keys are: ${validKeys.map(inspect).join(", ")}`,
      );
    }
  }
}

/**
 * Recursively transform all values using the provided function.
 */
export function deepTransformValues(obj: unknown, fn: (value: unknown) => unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => deepTransformValues(item, fn));
  }
  if (obj !== null && typeof obj === "object" && isPlainObject(obj)) {
    const result: AnyObject = {};
    for (const key of Object.keys(obj)) {
      result[key] = deepTransformValues(obj[key], fn);
    }
    return result;
  }
  return fn(obj);
}

export function isPlainObject(value: unknown): value is AnyObject {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Convert a value to its URL parameter representation (Rails' to_param).
 *
 * - null/undefined → null
 * - boolean → the boolean itself
 * - Array → each element's toParam joined with "/"
 * - objects with a toParam method → call it
 * - plain objects → URL query string (delegated to toQuery)
 * - everything else → String(value)
 */
export function toParam(value: unknown): string | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        const p = toParam(v);
        return p === null ? "" : String(p);
      })
      .join("/");
  }
  if (typeof value === "object") {
    if (typeof (value as any).toParam === "function") {
      return (value as any).toParam();
    }
    if (isPlainObject(value)) {
      // If toString is overridden, use it (mirrors Ruby Object#to_param → to_s)
      if (value.toString !== Object.prototype.toString) {
        return String(value);
      }
      return toQuery(value as Record<string, unknown>);
    }
  }
  return String(value);
}

function encodeQueryValue(val: unknown): string {
  return encodeURIComponent(String(val ?? "")).replace(/%20/g, "+");
}

function encodeQueryKey(key: string): string {
  return encodeURIComponent(key).replace(/%20/g, "+");
}

function buildQueryParts(value: unknown, prefix: string): string[] {
  if (value === null || value === undefined) {
    return [`${encodeQueryKey(prefix)}=`];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    return value.flatMap((v) => buildQueryParts(v, `${prefix}[]`));
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return [];
    return keys.flatMap((k) =>
      buildQueryParts((value as Record<string, unknown>)[k], `${prefix}[${k}]`),
    );
  }
  return [`${encodeQueryKey(prefix)}=${encodeQueryValue(value)}`];
}

/**
 * Convert an object to a URL query string with nested key support.
 * Mirrors Rails' Hash#to_query / Hash#to_param.
 */
export function toQuery(obj: Record<string, unknown>, namespace?: string): string {
  const sortedKeys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const key of sortedKeys) {
    const fullKey = namespace ? `${namespace}[${key}]` : key;
    parts.push(...buildQueryParts(obj[key], fullKey));
  }
  return parts.join("&");
}

/**
 * Remove null and undefined values from a plain object (Rails' compact).
 */
export function compact<T extends AnyObject>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== null && obj[key] !== undefined) {
      result[key as keyof T] = obj[key] as T[keyof T];
    }
  }
  return result;
}

/**
 * Remove blank values from a plain object (Rails' compact_blank for hashes).
 * Blank: null, undefined, empty string, empty array, empty object, false.
 */
export function compactBlankObj<T extends AnyObject>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (!_isBlankValue(val)) {
      result[key as keyof T] = val as T[keyof T];
    }
  }
  return result;
}

function _isBlankValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object" && value !== null) {
    return Object.keys(value).length === 0;
  }
  return false;
}
