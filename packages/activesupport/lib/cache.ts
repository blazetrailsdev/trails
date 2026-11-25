import { LoadError } from "@blazetrails/ruby-compat/load-error";
import { RuntimeError } from "@blazetrails/ruby-compat/runtime-error";
import { constGet } from "@blazetrails/ruby-compat/variable";
import { toParam } from "./hash-utils.js";
import { extractOptionsBang } from "./core-ext/array/extract-options.js";
import { env } from "@blazetrails/ruby-compat/process-adapter";
import { MemoryStore } from "./cache/memory-store.js";
import { OrderedOptions } from "./ordered-options.js";
import "./cache/null-store.js";
import "./cache/file-store.js";
import { camelize } from "./inflector.js";
import type { CacheStore } from "./cache/index.js";
import { ActiveSupport } from "./namespaces.js";
import { Store, ArgumentError, NotImplementedError, WriteOptions } from "./cache/store.js";
import { DeserializationError } from "./cache/deserialization-error.js";

export { Store, ArgumentError, NotImplementedError, WriteOptions } from "./cache/store.js";
export type { CacheLogger, StoreOptions } from "./cache/store.js";
export { DeserializationError } from "./cache/deserialization-error.js";
export { Entry } from "./cache/entry.js";

export function lookupStore(store?: unknown, ...parameters: unknown[]): CacheStore {
  if (typeof store === "string" && store.startsWith(":")) {
    const extracted = extractOptionsBang(parameters);
    const options = extracted instanceof OrderedOptions ? extracted.toH() : extracted;
    const rest = parameters;
    return new (retrieveStoreClass(store))(
      ...rest,
      ...(Object.keys(options).length === 0 ? [] : [options]),
    );
  }
  if (Array.isArray(store)) {
    return lookupStore(...(store as unknown[]));
  }
  if (store == null) {
    return new MemoryStore();
  }
  return store as CacheStore;
}

export function expandCacheKey(key: unknown, namespace?: string | null): string {
  let expandedCacheKey = namespace != null ? `${namespace}/` : "";

  const prefix = env["TRAILS_CACHE_ID"] ?? env["TRAILS_APP_VERSION"];
  if (prefix != null) {
    expandedCacheKey += `${prefix}/`;
  }

  expandedCacheKey += retrieveCacheKey(key);
  return expandedCacheKey;
}

type CacheKeyable = {
  cacheKeyWithVersion?: () => unknown;
  cacheKey?: () => unknown;
};

/** @internal */
function retrieveCacheKey(key: unknown): string {
  let value: unknown;
  if (typeof (key as CacheKeyable)?.cacheKeyWithVersion === "function") {
    value = (key as CacheKeyable).cacheKeyWithVersion!();
  } else if (typeof (key as CacheKeyable)?.cacheKey === "function") {
    value = (key as CacheKeyable).cacheKey!();
  } else if (Array.isArray(key)) {
    value = toParam(key.map((element) => retrieveCacheKey(element)));
  } else if (key != null && typeof key === "object" && Symbol.iterator in key) {
    value = retrieveCacheKey([...(key as Iterable<unknown>)]);
  } else {
    value = toParam(key);
  }
  return value === null || value === undefined ? "" : String(value);
}

/** @internal */
function retrieveStoreClass(store: string): new (...args: any[]) => CacheStore {
  if (!Object.hasOwn(ActiveSupport.Cache, camelize(store.slice(1)))) {
    const e = new LoadError(`cannot load such file -- active_support/cache/${store.slice(1)}`);
    throw new RuntimeError(
      `Could not find cache store adapter for ${store.slice(1)} (${e.message})`,
    );
  }
  return constGet(ActiveSupport.Cache, camelize(store.slice(1))) as new (
    ...args: any[]
  ) => CacheStore;
}

Object.assign(ActiveSupport.Cache, {
  Store,
  ArgumentError,
  NotImplementedError,
  WriteOptions,
  DeserializationError,
  lookupStore,
  expandCacheKey,
});

Object.defineProperty(ActiveSupport.Cache, "formatVersion", {
  get(): number {
    return ActiveSupport.Cache._formatVersion;
  },
  set(value: number) {
    ActiveSupport.Cache._formatVersion = value;
  },
  enumerable: true,
  configurable: true,
});
