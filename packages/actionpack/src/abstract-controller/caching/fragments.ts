/** @internal */

import { Module, NoMethodError, rbObjRespondTo } from "@blazetrails/ruby-compat";
import {
  classAttribute,
  Concern,
  extend,
  mattrWriter,
  Notifications,
} from "@blazetrails/activesupport";
import type { CacheOptions, CacheStore } from "@blazetrails/activesupport";

export type FragmentCacheKeyBlock = (this: FragmentsHost) => unknown;

export interface FragmentsClassMethods {
  fragmentCacheKeys?: FragmentCacheKeyBlock[];
  cacheStore?: CacheStore | null;
  performCaching?: boolean;
}

export interface FragmentsHost {
  constructor: FragmentsClassMethods;
  cacheStore?: CacheStore | null;
  performCaching?: boolean;
  isCacheConfigured(): unknown;
  urlFor?(options: unknown): string;
  instrumentName(): string;
  instrumentPayload(key: unknown): Record<string, unknown>;
}

export function fragmentCacheKey(
  this: FragmentsClassMethods,
  value: unknown = null,
  key?: FragmentCacheKeyBlock,
): void {
  this.fragmentCacheKeys = [...this.fragmentCacheKeys!, key || (() => value)];
}

export const ClassMethods = new Module((mod) => {
  mod.defineMethod("fragmentCacheKey", fragmentCacheKey);
});

export const Fragments = new Module((mod) => {
  extend(mod, Concern);

  (
    mod as unknown as {
      included(
        base: null,
        block: (this: FragmentsClassMethods & { helperMethod(...methods: string[]): void }) => void,
      ): void;
    }
  ).included(null, function () {
    if (rbObjRespondTo(this, "classAttribute")) {
      classAttribute.call(this, "fragmentCacheKeys");
    } else {
      mattrWriter.call(this, "fragmentCacheKeys");
    }

    this.fragmentCacheKeys = [];

    if (rbObjRespondTo(this, "helperMethod")) {
      this.helperMethod("combinedFragmentCacheKey");
    }
  });

  mod.defineMethod("combinedFragmentCacheKey", combinedFragmentCacheKey);
  mod.defineMethod("writeFragment", writeFragment);
  mod.defineMethod("readFragment", readFragment);
  mod.defineMethod("fragmentExist", fragmentExist);
  mod.defineMethod("expireFragment", expireFragment);
  mod.defineMethod("instrumentFragmentCache", instrumentFragmentCache);
}) as Module<{
  combinedFragmentCacheKey: typeof combinedFragmentCacheKey;
  writeFragment: typeof writeFragment;
  readFragment: typeof readFragment;
  fragmentExist: typeof fragmentExist;
  expireFragment: typeof expireFragment;
  instrumentFragmentCache: typeof instrumentFragmentCache;
}> & { ClassMethods: typeof ClassMethods };
Fragments.ClassMethods = ClassMethods;

export function combinedFragmentCacheKey(this: FragmentsHost, key: unknown): unknown[] {
  const heads = this.constructor.fragmentCacheKeys!.map((k) => k.call(this));
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
  if (!this.isCacheConfigured()) return content;
  key = stringifyKey(combinedFragmentCacheKey.call(this, key));
  instrumentFragmentCache.call(this, "write_fragment", key, () => {
    content = toStr(content);
    this.cacheStore!.write(key as string, content, options);
  });
  return content;
}

export function readFragment(this: FragmentsHost, key: unknown, options?: CacheOptions): unknown {
  if (!this.isCacheConfigured()) return undefined;
  key = stringifyKey(combinedFragmentCacheKey.call(this, key));
  return instrumentFragmentCache.call(this, "read_fragment", key, () =>
    this.cacheStore!.read(key as string, options),
  );
}

export function fragmentExist(
  this: FragmentsHost,
  key: unknown,
  options?: CacheOptions,
): boolean | undefined {
  if (!this.isCacheConfigured()) return undefined;
  key = stringifyKey(combinedFragmentCacheKey.call(this, key));
  return instrumentFragmentCache.call(this, "exist_fragment?", key, () =>
    this.cacheStore!.exist(key as string, options),
  ) as boolean | undefined;
}

export function expireFragment(this: FragmentsHost, key: unknown, options?: CacheOptions): unknown {
  if (!this.isCacheConfigured()) return undefined;
  if (!(key instanceof RegExp)) key = stringifyKey(combinedFragmentCacheKey.call(this, key));

  return instrumentFragmentCache.call(this, "expire_fragment", key, () => {
    if (key instanceof RegExp) {
      return this.cacheStore!.deleteMatched(key, options);
    } else {
      return this.cacheStore!.delete(key as string, options);
    }
  });
}

export function instrumentFragmentCache<T>(
  this: FragmentsHost,
  name: string,
  key: unknown,
  block: () => T,
): T {
  return Notifications.instrument(
    `${name}.${this.instrumentName()}`,
    this.instrumentPayload(key),
    block,
  ) as T;
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
