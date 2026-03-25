import { QueryCacheStore } from "../../query-cache.js";

/**
 * Store — query cache storage.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache::Store
 *
 * Alias for QueryCacheStore in the Rails-canonical file location.
 */
export class Store extends QueryCacheStore {}
