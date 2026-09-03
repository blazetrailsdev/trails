import { RuntimeError } from "@blazetrails/ruby-compat";
import { extractOptionsBang, toParam } from "./hash-utils.js";
import { env } from "@blazetrails/ruby-compat";
import { MemoryStore } from "./cache/memory-store.js";
// Imported for the registration side effect: each store module registers its
// class under its symbol name, which is what requiring the file does in Ruby.
import "./cache/null-store.js";
import "./cache/file-store.js";
import { lookupStoreClass } from "./cache/store-registry.js";
import type { CacheStore } from "./cache/index.js";
import { getFormatVersion } from "./cache/format-version-slot.js";

export { Store, ArgumentError, NotImplementedError, WriteOptions } from "./cache/store.js";
export type { CacheLogger, StoreOptions } from "./cache/store.js";
export { DeserializationError } from "./cache/deserialization-error.js";

/** Mirrors Rails `ActiveSupport::Cache.format_version` (cache.rb:58). */
export function formatVersion(): number {
  return getFormatVersion();
}

/** Mirrors Rails `ActiveSupport::Cache.format_version=` (cache.rb:58). */
export { setFormatVersion } from "./cache/format-version-slot.js";

/**
 * Creates a new Store object according to the given options. A Ruby Symbol is
 * a colon-prefixed string in trails, which is the discriminator Rails' `when
 * Symbol` arm reads: `:memory_store` names a store class to build, anything
 * else is returned as-is.
 *
 * Ruby's `new(*parameters, **options)` (cache.rb:89) passes no argument at all
 * when `options` is empty, so a store whose only positional is required still
 * raises ArgumentError rather than receiving the empty hash as it.
 *
 * Mirrors: ActiveSupport::Cache.lookup_store (cache.rb:85-97)
 */
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
 * cannot be built from a runtime name — so the store modules register
 * themselves under their symbol name (the way requiring the file defines the
 * constant) and the lookup reads that registry, which stands in for the
 * `ActiveSupport::Cache` namespace `const_get` reads. A name nothing has
 * registered raises with the message Ruby's rescued LoadError produces.
 *
 * Mirrors: ActiveSupport::Cache.retrieve_store_class (cache.rb:135-144)
 *
 * @internal
 */
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
