/** @internal */

import type { CacheOptions, CacheStore } from "@blazetrails/activesupport";

import {
  combinedFragmentCacheKey as _combinedFragmentCacheKey,
  expireFragment as _expireFragment,
  fragmentExist as _fragmentExist,
  instrumentFragmentCache as _instrumentFragmentCache,
  readFragment as _readFragment,
  writeFragment as _writeFragment,
  type FragmentsHost,
} from "./caching/fragments.js";

const SLOTS = ["defaultStaticExtension", "performCaching", "enableFragmentCacheLogging"] as const;

export type CachingSlot = (typeof SLOTS)[number];

export const CACHING_SLOTS: readonly CachingSlot[] = SLOTS;

export const CACHING_DEFAULTS = {
  defaultStaticExtension: ".html",
  performCaching: true,
  enableFragmentCacheLogging: false,
} as const;

export type ViewCacheDependency = (this: CachingHost) => unknown;

export interface CachingClassMethods {
  cacheStore?: CacheStore | null;
  performCaching?: boolean;
  defaultStaticExtension?: string;
  enableFragmentCacheLogging?: boolean;
  _viewCacheDependencies?: ViewCacheDependency[];
}

export interface CachingHost {
  constructor: CachingClassMethods;
}

export class ConfigMethods {
  get cacheStore(): CacheStore | null {
    return (this as unknown as CachingHost).constructor.cacheStore ?? null;
  }

  set cacheStore(store: CacheStore | null) {
    (this as unknown as CachingHost).constructor.cacheStore = store;
  }
}

/** @internal */
export function cacheConfigured(host: CachingHost): boolean {
  const cls = host.constructor;
  return Boolean(cls.performCaching && cls.cacheStore);
}

export function viewCacheDependency(cls: CachingClassMethods, block: ViewCacheDependency): void {
  const existing = cls._viewCacheDependencies ?? [];
  cls._viewCacheDependencies = [...existing, block];
}

export function viewCacheDependencies(this: CachingHost): unknown[] {
  const deps = this.constructor._viewCacheDependencies ?? [];
  const out: unknown[] = [];
  for (const dep of deps) {
    const value = dep.call(this);
    if (value != null) out.push(value);
  }
  return out;
}

export function cache<T>(this: CachingHost, key: unknown, options: CacheOptions, block: () => T): T;
export function cache<T>(this: CachingHost, key: unknown, block: () => T): T;
export function cache<T>(
  this: CachingHost,
  key: unknown,
  optionsOrBlock: CacheOptions | (() => T),
  maybeBlock?: () => T,
): T {
  const block = typeof optionsOrBlock === "function" ? (optionsOrBlock as () => T) : maybeBlock!;
  const options = typeof optionsOrBlock === "function" ? ({} as CacheOptions) : optionsOrBlock;

  if (!cacheConfigured(this)) return block();

  const store = this.constructor.cacheStore!;
  const expanded = expandControllerCacheKey(key);
  return store.fetch(expanded, options, block) as T;
}

function expandControllerCacheKey(key: unknown): string {
  const flat = Array.isArray(key) ? key.map(stringify).join("/") : stringify(key);
  return `controller/${flat}`;
}

export function combinedFragmentCacheKey(this: FragmentsHost, key: unknown): unknown[] {
  return _combinedFragmentCacheKey.call(this, key);
}

export function writeFragment(
  this: FragmentsHost,
  key: unknown,
  content: unknown,
  options?: CacheOptions,
): unknown {
  return _writeFragment.call(this, key, content, options);
}

export function readFragment(this: FragmentsHost, key: unknown, options?: CacheOptions): unknown {
  return _readFragment.call(this, key, options);
}

export function fragmentExist(
  this: FragmentsHost,
  key: unknown,
  options?: CacheOptions,
): boolean | undefined {
  return _fragmentExist.call(this, key, options);
}

export function expireFragment(this: FragmentsHost, key: unknown, options?: CacheOptions): unknown {
  return _expireFragment.call(this, key, options);
}

export function instrumentFragmentCache<T>(
  host: FragmentsHost,
  name: string,
  key: unknown,
  block: () => T,
): T {
  return _instrumentFragmentCache(host, name, key, block);
}

function stringify(part: unknown): string {
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
