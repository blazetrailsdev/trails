/**
 * Hash/object utilities mirroring Rails ActiveSupport hash extensions.
 */

type AnyObject = Record<string, unknown>;

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
      result[key] = deepMerge(targetVal as AnyObject, sourceVal as AnyObject);
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
      deepMergeInPlace(targetVal as AnyObject, sourceVal as AnyObject);
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
    for (const key of Object.keys(obj as AnyObject)) {
      result[fn(key)] = deepTransformKeys((obj as AnyObject)[key], fn);
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
 * Pop an options hash from the end of an arguments array (Rails convention).
 * If the last element is a plain object, it is removed and returned.
 * Otherwise returns an empty object.
 */
export function extractOptions<T>(args: T[]): [T[], AnyObject] {
  if (args.length > 0 && isPlainObject(args[args.length - 1])) {
    const options = args[args.length - 1] as unknown as AnyObject;
    return [args.slice(0, -1), options];
  }
  return [args, {}];
}

/**
 * Convert all keys to strings (Rails' stringify_keys).
 */
export function stringifyKeys<T extends AnyObject>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    result[String(key)] = obj[key];
  }
  return result;
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
  return stringifyKeys(obj);
}

/**
 * Recursively convert all keys to symbols (strings in TS).
 */
export function deepSymbolizeKeys(obj: unknown): unknown {
  return deepStringifyKeys(obj);
}

/**
 * Merge defaults into obj without overwriting existing keys (Rails' reverse_merge).
 */
export function reverseMerge<T extends AnyObject>(obj: T, defaults: AnyObject): T {
  const result = { ...obj } as AnyObject;
  for (const key of Object.keys(defaults)) {
    if (!(key in result)) {
      result[key] = defaults[key];
    }
  }
  return result as T;
}

/**
 * Assert that all keys in obj are within the allowed set of validKeys.
 * Throws ArgumentError if any key is invalid (Rails' assert_valid_keys).
 */
export function assertValidKeys(obj: AnyObject, validKeys: string[]): void {
  const validSet = new Set(validKeys);
  for (const key of Object.keys(obj)) {
    if (!validSet.has(key)) {
      throw new Error(`Unknown key: ${key}. Valid keys are: ${validKeys.join(", ")}`);
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
    for (const key of Object.keys(obj as AnyObject)) {
      result[key] = deepTransformValues((obj as AnyObject)[key], fn);
    }
    return result;
  }
  return fn(obj);
}

/**
 * Extract the specified keys from obj, removing them in-place and returning
 * them as a new object (Rails' extract!).
 */
export function extractKeys<T extends AnyObject>(obj: T, ...keys: string[]): Partial<T> {
  const result: Partial<T> = {};
  for (const key of keys) {
    if (key in obj) {
      result[key as keyof T] = obj[key as keyof T];
      delete obj[key as keyof T];
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is AnyObject {
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
