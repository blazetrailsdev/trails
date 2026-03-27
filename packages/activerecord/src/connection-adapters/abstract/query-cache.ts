import { QueryCacheStore } from "../../query-cache.js";

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache
 */
export interface QueryCache {
  enableQueryCache(): void;
  disableQueryCache(): void;
  clearQueryCache(): void;
  queryCacheEnabled: boolean;
}

/**
 * Store — query cache storage.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache::Store
 */
export class Store extends QueryCacheStore {}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache::QueryCacheRegistry
 */
export class QueryCacheRegistry {
  private _caches = new Map<string, Store>();

  getCache(key: string): Store {
    let cache = this._caches.get(key);
    if (!cache) {
      cache = new Store();
      this._caches.set(key, cache);
    }
    return cache;
  }

  clearAll(): void {
    for (const cache of this._caches.values()) {
      cache.clear();
    }
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache::ConnectionPoolConfiguration
 */
export interface ConnectionPoolConfiguration {
  enableQueryCache(): void;
  disableQueryCache(): void;
  clearQueryCache(): void;
}
