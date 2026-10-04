/** @internal */

import { expandCacheKey, lookupStore } from "@blazetrails/activesupport/cache";
import { classAttribute, extend, include, included } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Fragments } from "./caching/fragments.js";
import type { CacheOptions, CacheStore, Configuration } from "@blazetrails/activesupport";

export type ViewCacheDependency = (this: CachingHost) => unknown;

type LookupStoreArgument = CacheStore | `:${string}` | readonly [`:${string}`, ...unknown[]] | null;

export interface CachingClassMethods {
  get cacheStore(): CacheStore | null;
  set cacheStore(store: LookupStoreArgument);
  performCaching?: boolean;
  defaultStaticExtension?: string;
  enableFragmentCacheLogging?: boolean;
  _viewCacheDependencies?: ViewCacheDependency[];
}

export interface CachingHost {
  constructor: CachingClassMethods;
  get cacheStore(): CacheStore | null;
  set cacheStore(store: LookupStoreArgument);
  performCaching?: boolean;
  isCacheConfigured(): CacheStore | boolean | null | undefined;
}

type ConfigReceiver = { config(): Configuration & { cacheStore: CacheStore | null } };

export const ConfigMethods = {
  get cacheStore(): CacheStore | null {
    return (this as unknown as ConfigReceiver).config().cacheStore;
  },

  set cacheStore(store: LookupStoreArgument) {
    (this as unknown as ConfigReceiver).config().cacheStore = lookupStore(store);
  },

  /** @internal */
  isCacheConfigured(this: Omit<CachingHost, "constructor" | "isCacheConfigured">) {
    return this.performCaching && this.cacheStore;
  },
};

export class Caching {
  static [included](
    base: CachingClassMethods & {
      configAccessor(...names: string[]): void;
      helperMethod?(...methods: string[]): void;
    },
  ): void {
    include(base, Fragments);
    extend(base, ConfigMethods);

    base.configAccessor("defaultStaticExtension");
    base.defaultStaticExtension ??= ".html";

    base.configAccessor("performCaching");
    if (base.performCaching == null) base.performCaching = true;

    base.configAccessor("enableFragmentCacheLogging");
    base.enableFragmentCacheLogging = false;

    classAttribute.call(base, "_viewCacheDependencies", { default: [] });
    if (rbObjRespondTo(base, "helperMethod")) base.helperMethod!("viewCacheDependencies");
  }
}

export function viewCacheDependency(
  this: CachingClassMethods,
  dependency: ViewCacheDependency,
): void {
  this._viewCacheDependencies = [...(this._viewCacheDependencies ?? []), dependency];
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

  if (this.isCacheConfigured()) {
    return this.cacheStore!.fetch(expandCacheKey(key, "controller"), options, block) as T;
  } else {
    return block();
  }
}
