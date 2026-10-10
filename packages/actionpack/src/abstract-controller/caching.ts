/** @internal */

import { expandCacheKey, lookupStore } from "@blazetrails/activesupport/cache";
import { classAttribute, Concern, extend, include } from "@blazetrails/activesupport";
import { Module, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Fragments } from "./caching/fragments.js";
import type { CacheOptions, CacheStore, Configuration } from "@blazetrails/activesupport";

export type ViewCacheDependency = (this: CachingHost) => unknown;

export type LookupStoreArgument =
  | CacheStore
  | `:${string}`
  | readonly [`:${string}`, ...unknown[]]
  | null;

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

export const ConfigMethods = new Module().include({
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
});

export function viewCacheDependency(
  this: CachingClassMethods,
  dependency: ViewCacheDependency,
): void {
  this._viewCacheDependencies = [...this._viewCacheDependencies!, dependency];
}

export const ClassMethods = new Module((mod) => {
  mod.defineMethod("viewCacheDependency", viewCacheDependency);
});

export const Caching = new Module((mod) => {
  extend(mod, Concern);

  mod.include(ConfigMethods);
  include(mod, Fragments);

  (
    mod as unknown as {
      included(
        base: null,
        block: (
          this: CachingClassMethods & {
            configAccessor(...names: string[]): void;
            helperMethod(...methods: string[]): void;
          },
        ) => void,
      ): void;
    }
  ).included(null, function () {
    extend(this, ConfigMethods);

    this.configAccessor("defaultStaticExtension");
    this.defaultStaticExtension ||= ".html";

    this.configAccessor("performCaching");
    if (this.performCaching == null) this.performCaching = true;

    this.configAccessor("enableFragmentCacheLogging");
    this.enableFragmentCacheLogging = false;

    classAttribute.call(this, "_viewCacheDependencies", { default: [] });
    if (rbObjRespondTo(this, "helperMethod")) this.helperMethod("viewCacheDependencies");
  });

  mod.defineMethod("viewCacheDependencies", viewCacheDependencies);
  mod.defineMethod("cache", cache);
}) as Module<{ viewCacheDependencies: typeof viewCacheDependencies; cache: typeof cache }> & {
  ClassMethods: typeof ClassMethods;
};
Caching.ClassMethods = ClassMethods;

export function viewCacheDependencies(this: CachingHost): unknown[] {
  const out: unknown[] = [];
  for (const dep of this.constructor._viewCacheDependencies!) {
    const value = dep.call(this);
    if (value != null && value !== false) out.push(value);
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
