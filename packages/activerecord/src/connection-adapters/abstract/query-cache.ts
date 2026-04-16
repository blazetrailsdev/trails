import { Notifications } from "@blazetrails/activesupport";
import { QueryCacheStore } from "../../query-cache.js";
import type { DatabaseStatementsHost } from "./database-statements.js";

const DEFAULT_SIZE = 100;

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache::Store
 */
export class Store extends QueryCacheStore {
  isDirties(): boolean {
    return this.dirties;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache::QueryCacheRegistry
 */
export class QueryCacheRegistry {
  private _caches = new Map<string, Store>();

  computeIfAbsent(key: string, create: () => Store): Store {
    let cache = this._caches.get(key);
    if (!cache) {
      cache = create();
      this._caches.set(key, cache);
    }
    return cache;
  }

  getCache(key: string): Store {
    return this.computeIfAbsent(key, () => new Store());
  }

  clear(): void {
    for (const cache of this._caches.values()) {
      cache.clear();
    }
    this._caches.clear();
  }
}

/**
 * Host interface for QueryCache connection-level mixin methods.
 */
export interface QueryCachePool {
  enableQueryCache?<T>(fn: () => T | Promise<T>): T | Promise<T>;
  disableQueryCache?<T>(fn: () => T | Promise<T>, opts?: { dirties?: boolean }): T | Promise<T>;
  enableQueryCacheBang?(): void;
  disableQueryCacheBang?(): void;
  clearQueryCache?(): void;
  dirtiesQueryCache?: boolean;
}

export interface QueryCacheHost extends DatabaseStatementsHost {
  _queryCache: Store | null;
  pool?: DatabaseStatementsHost["pool"] & QueryCachePool;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache::ConnectionPoolConfiguration
 *
 * Mixin for connection pools that manages the per-thread query cache.
 */
export class ConnectionPoolConfiguration {
  private _threadQueryCaches = new QueryCacheRegistry();
  private _queryCacheMaxSize: number | null;

  constructor(queryCacheConfig?: number | false | null) {
    if (queryCacheConfig === 0 || queryCacheConfig === false) {
      this._queryCacheMaxSize = null;
    } else if (typeof queryCacheConfig === "number") {
      this._queryCacheMaxSize = queryCacheConfig;
    } else {
      this._queryCacheMaxSize = DEFAULT_SIZE;
    }
  }

  checkoutAndVerify(connection: QueryCacheHost): QueryCacheHost {
    connection._queryCache = this.queryCache;
    return connection;
  }

  async disableQueryCache<T>(
    fn: () => T | Promise<T>,
    options: { dirties?: boolean } = {},
  ): Promise<T> {
    const { dirties = true } = options;
    const qc = this.queryCache;
    const oldEnabled = qc.enabled;
    const oldDirties = qc.dirties;
    qc.enabled = false;
    qc.dirties = dirties;
    try {
      return await fn();
    } finally {
      qc.enabled = oldEnabled;
      qc.dirties = oldDirties;
    }
  }

  async enableQueryCache<T>(fn: () => T | Promise<T>): Promise<T> {
    const qc = this.queryCache;
    const oldEnabled = qc.enabled;
    const oldDirties = qc.dirties;
    qc.enabled = true;
    qc.dirties = true;
    try {
      return await fn();
    } finally {
      qc.enabled = oldEnabled;
      qc.dirties = oldDirties;
    }
  }

  enableQueryCacheBang(): void {
    const qc = this.queryCache;
    qc.enabled = true;
    qc.dirties = true;
  }

  disableQueryCacheBang(): void {
    const qc = this.queryCache;
    qc.enabled = false;
    qc.dirties = true;
  }

  get queryCacheEnabled(): boolean {
    return this.queryCache.enabled;
  }

  get dirtiesQueryCache(): boolean {
    return this.queryCache.dirties;
  }

  clearQueryCache(): void {
    this.queryCache.clear();
  }

  get queryCache(): Store {
    return this._threadQueryCaches.computeIfAbsent("default", () => {
      return new Store(this._queryCacheMaxSize ?? 0);
    });
  }
}

// ---------------------------------------------------------------------------
// Connection-level mixin functions
// Mirrors: ActiveRecord::ConnectionAdapters::QueryCache (module mixed into connection)
// ---------------------------------------------------------------------------

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#query_cache (attr_accessor)
 */
export function queryCache(this: QueryCacheHost): Store | null {
  return this._queryCache;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#query_cache_enabled
 */
export function queryCacheEnabled(this: QueryCacheHost): boolean {
  return this._queryCache?.enabled ?? false;
}

/**
 * Enable the query cache within the block.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#cache
 */
export async function cache<T>(this: QueryCacheHost, fn: () => T | Promise<T>): Promise<T> {
  if (this.pool?.enableQueryCache) {
    return this.pool.enableQueryCache(fn) as Promise<T>;
  }
  const qc = this._queryCache;
  if (!qc) return fn() as Promise<T>;
  const oldEnabled = qc.enabled;
  const oldDirties = qc.dirties;
  qc.enabled = true;
  qc.dirties = true;
  try {
    return await fn();
  } finally {
    qc.enabled = oldEnabled;
    qc.dirties = oldDirties;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#enable_query_cache!
 */
export function enableQueryCacheBang(this: QueryCacheHost): void {
  if (this.pool?.enableQueryCacheBang) {
    this.pool.enableQueryCacheBang();
    return;
  }
  const qc = this._queryCache;
  if (qc) {
    qc.enabled = true;
    qc.dirties = true;
  }
}

/**
 * Disable the query cache within the block.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#uncached
 */
export async function uncached<T>(
  this: QueryCacheHost,
  fn: () => T | Promise<T>,
  options: { dirties?: boolean } = {},
): Promise<T> {
  const { dirties = true } = options;
  if (this.pool?.disableQueryCache) {
    return this.pool.disableQueryCache(fn, { dirties }) as Promise<T>;
  }
  const qc = this._queryCache;
  if (!qc) return fn() as Promise<T>;
  const oldEnabled = qc.enabled;
  const oldDirties = qc.dirties;
  qc.enabled = false;
  qc.dirties = dirties;
  try {
    return await fn();
  } finally {
    qc.enabled = oldEnabled;
    qc.dirties = oldDirties;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#disable_query_cache!
 */
export function disableQueryCacheBang(this: QueryCacheHost): void {
  if (this.pool?.disableQueryCacheBang) {
    this.pool.disableQueryCacheBang();
    return;
  }
  const qc = this._queryCache;
  if (qc) {
    qc.enabled = false;
    qc.dirties = true;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#clear_query_cache
 */
export function clearQueryCache(this: QueryCacheHost): void {
  if (this.pool?.clearQueryCache) {
    this.pool.clearQueryCache();
    return;
  }
  this._queryCache?.clear();
}

/**
 * Creates a cached selectAll that wraps the original. When the query cache
 * is enabled and the query is not locked (FOR UPDATE), results are served
 * from cache. Otherwise delegates to the original.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#select_all
 */
export function selectAll(
  original: (
    sql: string,
    name?: string | null,
    binds?: unknown[],
  ) => Promise<Record<string, unknown>[]>,
): (
  this: QueryCacheHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
) => Promise<Record<string, unknown>[]> {
  return async function cachedSelectAll(
    this: QueryCacheHost,
    sql: string,
    name?: string | null,
    binds?: unknown[],
  ): Promise<Record<string, unknown>[]> {
    const qc = this._queryCache;
    if (qc?.enabled) {
      if (/\bFOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i.test(sql)) {
        return original.call(this, sql, name, binds);
      }

      const key = binds && binds.length > 0 ? JSON.stringify([sql, binds]) : sql;

      // Check for cache hit first (Rails: lookup_sql_cache)
      const cached = qc.get(key);
      if (cached !== undefined) {
        const bindArray = binds ?? [];
        Notifications.instrument("sql.active_record", {
          sql,
          name: name ?? "SQL",
          binds: bindArray,
          type_casted_binds: bindArray.map((b: any) => {
            if (b && typeof b === "object" && typeof b.valueForDatabase === "function") {
              return b.valueForDatabase();
            }
            return b && typeof b === "object" && "value" in b ? b.value : b;
          }),
          connection: this,
          cached: true,
          row_count: cached.length,
        });
        return cached.map((r) => ({ ...r }));
      }

      // Cache miss — execute and store
      return qc.computeIfAbsent(key, async () => {
        return original.call(this, sql, name, binds);
      });
    }
    return original.call(this, sql, name, binds);
  };
}

/**
 * Wraps adapter methods to clear query caches before execution when
 * the dirties flag is set. In Rails this uses class_eval to monkey-patch
 * each method; in TypeScript the cache invalidation is handled by the
 * QueryCacheAdapter wrapper's executeMutation/rollback methods.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache.dirties_query_cache
 */
export function dirtiesQueryCache(
  _base: { prototype: Record<string, unknown> },
  ...methodNames: string[]
): void {
  for (const methodName of methodNames) {
    const original = _base.prototype[methodName];
    if (typeof original !== "function") continue;

    _base.prototype[methodName] = function (this: QueryCacheHost, ...args: unknown[]) {
      if (this._queryCache?.dirties) {
        this._queryCache.clear();
      }
      return original.apply(this, args);
    };
  }
}
