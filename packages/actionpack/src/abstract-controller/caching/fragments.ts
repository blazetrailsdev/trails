/** @internal */

import { NoMethodError } from "@blazetrails/ruby-compat";
import { Notifications } from "@blazetrails/activesupport";
import type { CacheOptions, CacheStore } from "@blazetrails/activesupport";

function cacheConfigured(host: FragmentsHost): boolean {
  const cls = host.constructor;
  return Boolean(cls.performCaching && cls.cacheStore);
}

export type FragmentCacheKeyBlock = (this: FragmentsHost) => unknown;

export interface FragmentsClassMethods {
  fragmentCacheKeys?: FragmentCacheKeyBlock[];
  cacheStore?: CacheStore | null;
  performCaching?: boolean;
}

export interface FragmentsHost {
  constructor: FragmentsClassMethods;
  urlFor?(options: unknown): string;
  instrumentName?(): string;
  instrumentPayload?(key: unknown): Record<string, unknown>;
}

export function fragmentCacheKey(
  this: FragmentsClassMethods,
  value?: unknown | FragmentCacheKeyBlock,
  key?: FragmentCacheKeyBlock,
): void {
  const entry: FragmentCacheKeyBlock =
    key ?? (typeof value === "function" ? (value as FragmentCacheKeyBlock) : () => value);
  this.fragmentCacheKeys = [...(this.fragmentCacheKeys ?? []), entry];
}

export function combinedFragmentCacheKey(this: FragmentsHost, key: unknown): unknown[] {
  const heads = (this.constructor.fragmentCacheKeys ?? []).map((k) => k.call(this));
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const version = env?.RAILS_CACHE_ID || env?.RAILS_APP_VERSION || null;

  let tail: unknown;
  if (isPlainObject(key)) {
    if (typeof this.urlFor !== "function") {
      throw new TypeError("combinedFragmentCacheKey: hash key requires a host with `urlFor`");
    }
    const url = this.urlFor(key);
    if (typeof url !== "string") {
      throw new TypeError(
        `combinedFragmentCacheKey: urlFor must return a string, got ${typeof url}`,
      );
    }
    const idx = url.indexOf("://");
    tail = idx >= 0 ? url.slice(idx + 3) : url;
  } else {
    tail = key;
  }

  const out: unknown[] = ["views", version];
  for (const h of heads) flattenOne(out, h);
  flattenOne(out, tail);
  return out.filter((v) => v != null);
}

function flattenOne(out: unknown[], value: unknown): void {
  if (Array.isArray(value)) for (const v of value) out.push(v);
  else out.push(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function toStr(content: unknown): string {
  if (typeof content === "string") return content;
  const toStrMethod = (content as { toStr?: unknown } | null)?.toStr;
  if (typeof toStrMethod === "function") return (toStrMethod as () => string).call(content);
  throw new NoMethodError(`undefined method 'to_str' for ${String(content)}`);
}

export function writeFragment(
  this: FragmentsHost,
  key: unknown,
  content: unknown,
  options?: CacheOptions,
): unknown {
  if (!cacheConfigured(this)) return content;
  key = stringifyKey(combinedFragmentCacheKey.call(this, key));
  instrumentFragmentCache(this, "write_fragment", key, () => {
    content = toStr(content);
    this.constructor.cacheStore!.write(key as string, content, options);
  });
  return content;
}

export function readFragment(this: FragmentsHost, key: unknown, options?: CacheOptions): unknown {
  if (!cacheConfigured(this)) return undefined;
  key = stringifyKey(combinedFragmentCacheKey.call(this, key));
  return instrumentFragmentCache(this, "read_fragment", key, () =>
    this.constructor.cacheStore!.read(key as string, options),
  );
}

export function fragmentExist(
  this: FragmentsHost,
  key: unknown,
  options?: CacheOptions,
): boolean | undefined {
  if (!cacheConfigured(this)) return undefined;
  key = stringifyKey(combinedFragmentCacheKey.call(this, key));
  return instrumentFragmentCache(this, "exist_fragment?", key, () =>
    this.constructor.cacheStore!.exist(key as string, options),
  );
}

export function expireFragment(this: FragmentsHost, key: unknown, options?: CacheOptions): unknown {
  if (!cacheConfigured(this)) return undefined;
  if (!(key instanceof RegExp)) key = stringifyKey(combinedFragmentCacheKey.call(this, key));

  return instrumentFragmentCache(this, "expire_fragment", key, () => {
    if (key instanceof RegExp) {
      return this.constructor.cacheStore!.deleteMatched(key, options);
    } else {
      return this.constructor.cacheStore!.delete(key as string, options);
    }
  });
}

export function instrumentFragmentCache<T>(
  host: FragmentsHost,
  name: string,
  key: unknown,
  block: () => T,
): T {
  const ns = host.instrumentName?.() ?? "abstract_controller";
  const payload = host.instrumentPayload?.(key) ?? { key };
  return Notifications.instrument(`${name}.${ns}`, payload, block) as T;
}

function stringifyKey(parts: unknown[]): string {
  return parts.map(stringifyPart).join("/");
}

function stringifyPart(part: unknown): string {
  if (part == null) return "";
  if (typeof part === "string") return part;
  if (typeof part === "number" || typeof part === "boolean" || typeof part === "bigint") {
    return String(part);
  }
  const maybe = (part as { cacheKey?: () => string }).cacheKey;
  if (typeof maybe === "function") return maybe.call(part);
  try {
    return JSON.stringify(part) ?? "";
  } catch {
    return String(part);
  }
}
