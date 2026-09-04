import { ArgumentError, valuesAt } from "@blazetrails/ruby-compat";
import { isBlank } from "./core-ext/object/blank.js";
import * as XmlMini from "./xml-mini.js";
import { XMLConverter } from "./core-ext/hash/conversions.js";
import type { StringIO } from "@blazetrails/ruby-compat";

type AnyObject = Record<string, unknown>;

export { ArgumentError, valuesAt };

export function deepMerge<T extends AnyObject>(target: T, other: AnyObject): T {
  const result = { ...target } as AnyObject;
  for (const key of Object.keys(other)) {
    const thisVal = result[key];
    const otherVal = other[key];
    if (isPlainObject(thisVal) && isPlainObject(otherVal)) {
      result[key] = deepMerge(thisVal, otherVal);
    } else {
      result[key] = otherVal;
    }
  }
  return result as T;
}

export function deepMergeBang<T extends AnyObject>(target: T, other: AnyObject): T {
  for (const key of Object.keys(other)) {
    const thisVal = target[key as keyof T];
    const otherVal = other[key];
    if (isPlainObject(thisVal) && isPlainObject(otherVal)) {
      deepMergeBang(thisVal as AnyObject, otherVal);
    } else {
      (target as AnyObject)[key] = otherVal;
    }
  }
  return target;
}

export function deepDup<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item) => deepDup(item)) as T;
  if (typeof (obj as { deepDup?: unknown }).deepDup === "function") {
    return (obj as unknown as { deepDup(): T }).deepDup();
  }
  if (typeof obj === "object" && isPlainObject(obj)) {
    const result: AnyObject = {};
    for (const key of Object.keys(obj as AnyObject)) {
      result[key] = deepDup((obj as AnyObject)[key]);
    }
    return result as T;
  }
  return obj;
}

export function slice<T extends AnyObject, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (Object.hasOwn(obj, key as string)) {
      result[key] = obj[key];
    }
  }
  return result;
}

/** @noRailsEquivalent PERMANENT */
export function merge<T extends AnyObject>(hash: T, otherHash: AnyObject): T {
  return { ...hash, ...otherHash } as T;
}

/** @noRailsEquivalent PERMANENT */
export function mergeBang<T extends AnyObject>(hash: T, otherHash: AnyObject): T {
  return Object.assign(hash, otherHash);
}

export function deepTransformKeys(obj: unknown, block: (key: string) => string): unknown {
  return _deepTransformKeysInObject.call(obj as AnyObject, obj, block);
}

export function deepCamelizeKeys(obj: unknown): unknown {
  return deepTransformKeys(obj, (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()));
}

export function deepUnderscoreKeys(obj: unknown): unknown {
  return deepTransformKeys(obj, (key) =>
    key
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .replace(/^_/, ""),
  );
}

export function isExtractableOptions(self: unknown): boolean {
  if (self !== null && typeof self === "object" && "isExtractableOptions" in self) {
    return (self as { isExtractableOptions(): boolean }).isExtractableOptions();
  }
  return isPlainObject(self);
}

export function extractOptionsBang<T>(args: T[]): [T[], AnyObject] {
  const last = args[args.length - 1];
  const isHash =
    isPlainObject(last) ||
    (last !== null && typeof last === "object" && "isExtractableOptions" in last);
  if (args.length > 0 && isHash && isExtractableOptions(last)) {
    return [args.slice(0, -1), last as unknown as AnyObject];
  }
  return [args, {}];
}

export function stringifyKeys<T extends AnyObject>(obj: T): Record<string, unknown> {
  return transformKeys(obj, (k) => String(k));
}

export function stringifyKeysBang<T extends Map<string, unknown>>(hash: T): T;
export function stringifyKeysBang<T extends AnyObject>(hash: T): T;
export function stringifyKeysBang(
  hash: AnyObject | Map<string, unknown>,
): AnyObject | Map<string, unknown> {
  return transformKeysBang(hash as Map<string, unknown>, (k) => String(k));
}

export function deepStringifyKeys(obj: unknown): unknown {
  return deepTransformKeys(obj, (key) => String(key));
}

export function symbolizeKeys<T extends AnyObject>(obj: T): Record<string, unknown> {
  return transformKeys(obj, (key) => key);
}

export function symbolizeKeysBang<T extends Map<string, unknown>>(hash: T): T;
export function symbolizeKeysBang<T extends AnyObject>(hash: T): T;
export function symbolizeKeysBang(
  hash: AnyObject | Map<string, unknown>,
): AnyObject | Map<string, unknown> {
  return transformKeysBang(hash as Map<string, unknown>, (key) => key);
}

export const toOptions = symbolizeKeys;

export const toOptionsBang = symbolizeKeysBang;

/** @missingRailsArgs deep_transform_keys — PERMANENT */
export function deepSymbolizeKeys(obj: unknown): unknown {
  return deepTransformKeys(obj, (key) => key);
}

export function deepTransformKeysBang<T extends Map<string, unknown>>(
  hash: T,
  block: (key: string) => string,
): T;
export function deepTransformKeysBang<T extends AnyObject>(
  hash: T,
  block: (key: string) => string,
): T;
export function deepTransformKeysBang(
  hash: AnyObject | Map<string, unknown>,
  block: (key: string) => string,
): AnyObject | Map<string, unknown> {
  return _deepTransformKeysInObjectBang(hash, block) as AnyObject | Map<string, unknown>;
}

export function deepStringifyKeysBang<T extends Map<string, unknown>>(hash: T): T;
export function deepStringifyKeysBang<T extends AnyObject>(hash: T): T;
export function deepStringifyKeysBang(
  hash: AnyObject | Map<string, unknown>,
): AnyObject | Map<string, unknown> {
  return deepTransformKeysBang(hash as Map<string, unknown>, (k) => String(k));
}

export function deepSymbolizeKeysBang<T extends Map<string, unknown>>(hash: T): T;
export function deepSymbolizeKeysBang<T extends AnyObject>(hash: T): T;
export function deepSymbolizeKeysBang(
  hash: AnyObject | Map<string, unknown>,
): AnyObject | Map<string, unknown> {
  return deepTransformKeysBang(hash as Map<string, unknown>, (key) => key);
}

/** @internal */
export function _deepTransformKeysInObject(
  this: AnyObject | Map<string, unknown>,
  object: unknown,
  block: (key: string) => string,
): unknown {
  if (object instanceof Map) {
    const result = new (this.constructor as new () => Map<string, unknown>)();
    for (const [key, value] of object) {
      result.set(block(String(key)), _deepTransformKeysInObject.call(this, value, block));
    }
    return result;
  } else if (isPlainObject(object)) {
    const result: AnyObject = {};
    for (const key of Object.keys(object)) {
      result[block(key)] = _deepTransformKeysInObject.call(this, object[key], block);
    }
    return result;
  } else if (Array.isArray(object)) {
    return object.map((e) => _deepTransformKeysInObject.call(this, e, block));
  } else {
    return object;
  }
}

/** @internal */
export function _deepTransformKeysInObjectBang(
  object: unknown,
  block: (key: string) => string,
): unknown {
  if (object instanceof Map) {
    for (const [key, value] of [...object]) {
      object.delete(key);
      object.set(block(String(key)), _deepTransformKeysInObjectBang(value, block));
    }
    return object;
  } else if (isPlainObject(object)) {
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

/** @noRailsEquivalent PERMANENT */
export function transformKeys<V>(
  hash: Map<string, V>,
  block: (key: string) => string,
): Map<string, V>;
export function transformKeys<T extends AnyObject>(
  hash: T,
  block: (key: string) => string,
): Record<string, unknown>;
export function transformKeys(
  hash: AnyObject | Map<string, unknown>,
  block: (key: string) => string,
): Record<string, unknown> | Map<string, unknown> {
  if (hash instanceof Map) {
    const result = new Map<string, unknown>();
    for (const [key, value] of hash) result.set(block(key), value);
    return result;
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(hash)) {
    result[block(key)] = hash[key];
  }
  return result;
}

/** @noRailsEquivalent PERMANENT */
export function transformKeysBang<T extends Map<string, unknown>>(
  hash: T,
  block: (key: string) => string,
): T;
export function transformKeysBang<T extends AnyObject>(hash: T, block: (key: string) => string): T;
export function transformKeysBang(
  hash: AnyObject | Map<string, unknown>,
  block: (key: string) => string,
): AnyObject | Map<string, unknown> {
  if (hash instanceof Map) {
    for (const [key, value] of [...hash]) {
      hash.delete(key);
      hash.set(block(key), value);
    }
    return hash;
  }
  for (const key of Object.keys(hash)) {
    const value = hash[key];
    delete hash[key];
    hash[block(key)] = value;
  }
  return hash;
}

export function reverseMerge<T extends AnyObject>(obj: T, otherHash: AnyObject): T {
  return { ...otherHash, ...obj } as T;
}

export const withDefaults = reverseMerge;

export function reverseMergeBang<T extends AnyObject>(hash: T, otherHash: AnyObject): T {
  const merged = reverseMerge(hash, otherHash);
  for (const key of Object.keys(hash)) delete hash[key];
  Object.assign(hash, merged);
  return hash;
}

export const reverseUpdate = reverseMergeBang;

export const withDefaultsBang = reverseMergeBang;

export function exceptBang<T extends AnyObject>(hash: T, ...keys: string[]): T {
  keys.forEach((key) => delete hash[key]);
  return hash;
}

export {
  withIndifferentAccess,
  nestedUnderIndifferentAccess,
} from "./core-ext/hash/indifferent-access.js";

export function assertValidKeys(obj: AnyObject, validKeys: string[]): void {
  validKeys = validKeys.flat(Infinity);
  const inspect = (key: string): string =>
    /^[a-zA-Z_][a-zA-Z0-9_]*[?!=]?$/.test(key) ? `:${key}` : `:${JSON.stringify(key)}`;
  for (const key of Object.keys(obj)) {
    if (!validKeys.includes(key)) {
      throw new ArgumentError(
        `Unknown key: ${inspect(key)}. Valid keys are: ${validKeys.map(inspect).join(", ")}`,
      );
    }
  }
}

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
    if (value instanceof Map) return toQuery(value);
    if (isPlainObject(value)) {
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
    if (typeof (value as { toParam?: unknown }).toParam === "function") {
      return [`${encodeQueryKey(prefix)}=${encodeQueryValue(toParam(value))}`];
    }
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return [];
    return keys.flatMap((k) =>
      buildQueryParts((value as Record<string, unknown>)[k], `${prefix}[${k}]`),
    );
  }
  return [`${encodeQueryKey(prefix)}=${encodeQueryValue(value)}`];
}

export function toQuery(
  obj: Record<string, unknown> | Map<unknown, unknown>,
  namespace?: string,
): string {
  const entries: [string, unknown][] = (
    obj instanceof Map ? [...obj.entries()] : Object.entries(obj)
  ).map(([key, value]) => [String(toParam(key)), value]);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const parts: string[] = [];
  for (const [key, value] of entries) {
    const fullKey = namespace ? `${namespace}[${key}]` : key;
    parts.push(...buildQueryParts(value, fullKey));
  }
  return parts.join("&");
}

export function compact<T extends AnyObject>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== null && obj[key] !== undefined) {
      result[key as keyof T] = obj[key] as T[keyof T];
    }
  }
  return result;
}

export function compactBlank<T extends AnyObject>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (!isBlank(val)) {
      result[key as keyof T] = val as T[keyof T];
    }
  }
  return result;
}

export function compactBlankBang<T extends AnyObject>(hash: T): T {
  for (const key of Object.keys(hash)) {
    if (isBlank(hash[key])) delete hash[key];
  }
  return hash;
}

export function toXml(
  self: AnyObject,
  options: XmlMini.ToXmlOptions = {},
  block?: (builder: XmlMini.XmlBuilder) => void,
): string {
  options = { ...options };
  options.indent ??= 2;
  options.root ??= "hash";
  options.builder ??= new XmlMini.IndentedXmlStringBuilder("", options.indent);

  const builder = options.builder;
  const skipInstruct = options.skipInstruct;
  delete options.skipInstruct;
  if (!skipInstruct) builder.instruct();

  const root = XmlMini.renameKey(String(options.root), options);

  builder.openTag(root);
  for (const [key, value] of Object.entries(self)) {
    XmlMini.toTag(key, value, options as XmlMini.ToTagOptions);
  }
  if (block) block(builder);
  builder.closeTag(root);
  return builder.target();
}

export function fromXml(
  xml: string | StringIO | null | undefined,
  disallowedTypes?: string[] | null,
): unknown {
  return new XMLConverter(xml, disallowedTypes).toH();
}

export function fromTrustedXml(xml: string | StringIO | null | undefined): unknown {
  return fromXml(xml, []);
}
