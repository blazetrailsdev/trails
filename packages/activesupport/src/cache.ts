import { RuntimeError } from "@blazetrails/ruby-compat";
import { extractOptionsBang, toParam } from "./hash-utils.js";
import { env } from "@blazetrails/ruby-compat";
import { MemoryStore } from "./cache/memory-store.js";
import "./cache/null-store.js";
import "./cache/file-store.js";
import { lookupStoreClass } from "./cache/store-registry.js";
import type { CacheStore } from "./cache/index.js";
import { getFormatVersion } from "./cache/format-version-slot.js";

export { Store, ArgumentError, NotImplementedError, WriteOptions } from "./cache/store.js";
export type { CacheLogger, StoreOptions } from "./cache/store.js";
export { DeserializationError } from "./cache/deserialization-error.js";

export function formatVersion(): number {
  return getFormatVersion();
}

export { setFormatVersion } from "./cache/format-version-slot.js";

export function lookupStore(store?: unknown, ...parameters: unknown[]): CacheStore {
  if (typeof store === "string" && store.startsWith(":")) {
    const [rest, options] = extractOptionsBang(parameters);
    return new (retrieveStoreClass(store))(
      ...rest,
      ...(Object.keys(options as object).length === 0 ? [] : [options]),
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

  const prefix = env["RAILS_CACHE_ID"] ?? env["RAILS_APP_VERSION"];
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
  const klass = lookupStoreClass(store);
  if (klass === undefined) {
    const name = store.slice(1);
    throw new RuntimeError(
      `Could not find cache store adapter for ${name} ` +
        `(cannot load such file -- active_support/cache/${name})`,
    );
  }
  return klass;
}
