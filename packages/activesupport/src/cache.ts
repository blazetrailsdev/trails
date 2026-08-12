import { extractOptions, toParam } from "./hash-utils.js";
import { env } from "./process-adapter.js";
import { MemoryStore } from "./cache/memory-store.js";
import { NullStore } from "./cache/null-store.js";
import { FileStore } from "./cache/file-store.js";
import type { CacheStore } from "./cache/index.js";

export { Store, ArgumentError, NotImplementedError, WriteOptions } from "./cache/store.js";
export type { CacheLogger, StoreOptions } from "./cache/store.js";
export { DeserializationError } from "./cache/deserialization-error.js";

/**
 * Mirror of Ruby's `RuntimeError` — what `retrieve_store_class`'s bare
 * `raise "Could not find cache store adapter for ..."` produces. @internal
 */
class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeError";
  }
}

/** Mirrors Rails `@format_version = 7.0` (cache.rb:55). */
let _formatVersion = 7.0;

/** Mirrors Rails `ActiveSupport::Cache.format_version` (cache.rb:58). */
export function formatVersion(): number {
  return _formatVersion;
}

/** Mirrors Rails `ActiveSupport::Cache.format_version=` (cache.rb:58). */
export function setFormatVersion(value: number): void {
  _formatVersion = value;
}

/**
 * Creates a new Store object according to the given options. A Ruby Symbol is
 * a colon-prefixed string in trails, which is the discriminator Rails' `when
 * Symbol` arm reads: `:memory_store` names a store class to build, anything
 * else is returned as-is.
 *
 * Mirrors: ActiveSupport::Cache.lookup_store (cache.rb:85-97)
 */
export function lookupStore(store?: unknown, ...parameters: unknown[]): CacheStore {
  if (typeof store === "string" && store.startsWith(":")) {
    const [rest, options] = extractOptions(parameters);
    return new (retrieveStoreClass(store))(...rest, options);
  }
  if (Array.isArray(store)) {
    return lookupStore(...(store as unknown[]));
  }
  if (store == null) {
    return new MemoryStore();
  }
  return store as CacheStore;
}

/**
 * Expands out the `key` argument into a key that can be used for the cache
 * store, optionally scoped within a namespace.
 *
 * Mirrors: ActiveSupport::Cache.expand_cache_key (cache.rb:111-121)
 */
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

/**
 * Mirrors: ActiveSupport::Cache.retrieve_cache_key (cache.rb:123-131)
 *
 * @internal
 */
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

/**
 * Obtains the specified cache store class, given the name of the `store`.
 * Raises an error when the store class cannot be found.
 *
 * Ruby resolves the class by `require "active_support/cache/#{store}"` plus a
 * `const_get` on the camelized name, so a store shipped by another gem
 * resolves too. ESM has no such call-time autoload — an import is eager and
 * cannot be built from a runtime name — so the stores this package ships are
 * named directly, and any other name raises with the message Ruby's rescued
 * LoadError produces.
 *
 * Mirrors: ActiveSupport::Cache.retrieve_store_class (cache.rb:135-144)
 *
 * @internal
 */
function retrieveStoreClass(store: string): new (...args: any[]) => CacheStore {
  switch (store) {
    case ":memory_store":
      return MemoryStore as unknown as new (...args: any[]) => CacheStore;
    case ":null_store":
      return NullStore as unknown as new (...args: any[]) => CacheStore;
    case ":file_store":
      return FileStore as unknown as new (...args: any[]) => CacheStore;
    default: {
      const name = store.slice(1);
      throw new RuntimeError(
        `Could not find cache store adapter for ${name} ` +
          `(cannot load such file -- active_support/cache/${name})`,
      );
    }
  }
}
