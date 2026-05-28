import { Notifications } from "@blazetrails/activesupport";
import { typeCastedBinds, type DatabaseStatementsHost } from "./database-statements.js";
import {
  executionContextId,
  registerContextExitHook,
} from "./connection-pool/execution-context.js";

const DEFAULT_MAX_SIZE = 100;

/**
 * LRU cache store for query results.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache::Store
 */
export class Store {
  private _map = new Map<string, Record<string, unknown>[]>();
  private _maxSize: number;
  private _version: { value: number } | null;
  private _currentVersion: number;
  enabled = false;
  dirties = true;

  constructor(version: { value: number } | null = null, maxSize: number = DEFAULT_MAX_SIZE) {
    this._maxSize = maxSize;
    this._version = version;
    this._currentVersion = version?.value ?? 0;
  }

  /** @internal */
  private checkVersion(): void {
    if (this._version && this._version.value !== this._currentVersion) {
      this._map.clear();
      this._currentVersion = this._version.value;
    }
  }

  get size(): number {
    this.checkVersion();
    return this._map.size;
  }

  get empty(): boolean {
    this.checkVersion();
    return this._map.size === 0;
  }

  isDirties(): boolean {
    return this.dirties;
  }

  get(key: string): Record<string, unknown>[] | undefined {
    this.checkVersion();
    if (!this.enabled) return undefined;
    const entry = this._map.get(key);
    if (entry) {
      // Move to end (LRU)
      this._map.delete(key);
      this._map.set(key, entry);
    }
    return entry;
  }

  computeIfAbsent(
    key: string,
    compute: () => Promise<Record<string, unknown>[]>,
  ): Promise<Record<string, unknown>[]> {
    this.checkVersion();
    if (!this.enabled) return compute();

    const cached = this.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cached.map((row) => ({ ...row })));
    }

    return compute().then((result) => {
      if (this._maxSize <= 0) {
        // maxSize of 0 or negative disables caching — return without storing
        return result;
      }
      if (this._map.size >= this._maxSize) {
        const firstKey = this._map.keys().next().value;
        if (firstKey !== undefined) this._map.delete(firstKey);
      }
      this._map.set(key, result);
      return result.map((row) => ({ ...row }));
    });
  }

  clear(): void {
    this._map.clear();
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

  deleteStore(key: string): void {
    this._caches.delete(key);
  }
}

/**
 * Module-level registry of live ConnectionPoolConfigurations. Wired so the
 * execution-context exit hook in `withExecutionContext` can evict each pool's
 * per-context Store, mirroring Rails' GC of `IsolatedExecutionState.context`.
 */
const ACTIVE_CACHE_CONFIGS = new Set<WeakRef<ConnectionPoolConfiguration>>();

function evictQueryCacheStoresForContext(contextId: string): void {
  for (const ref of ACTIVE_CACHE_CONFIGS) {
    const cfg = ref.deref();
    if (!cfg) {
      ACTIVE_CACHE_CONFIGS.delete(ref);
      continue;
    }
    cfg.deleteStore(contextId);
  }
}

registerContextExitHook(evictQueryCacheStoresForContext);

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
  private _queryCacheVersion = { value: 0 };
  private _pinnedCount = 0;

  constructor(queryCacheConfig?: number | false | null) {
    if (queryCacheConfig === 0 || queryCacheConfig === false) {
      this._queryCacheMaxSize = null;
    } else if (typeof queryCacheConfig === "number") {
      this._queryCacheMaxSize = queryCacheConfig;
    } else {
      this._queryCacheMaxSize = DEFAULT_MAX_SIZE;
    }
    ACTIVE_CACHE_CONFIGS.add(new WeakRef(this));
  }

  /** @internal */
  deleteStore(contextId: string): void {
    this._threadQueryCaches.deleteStore(contextId);
  }

  checkoutAndVerify(connection: QueryCacheHost): QueryCacheHost {
    // Mirrors Rails' `connection.query_cache ||= query_cache`: only assign if
    // the connection has no cache yet. Checkin nulls `_queryCache`, so this
    // is equivalent to an unconditional set in steady state — but matches
    // Rails for callers that wire a Store directly before pool adoption.
    if (!connection._queryCache) connection._queryCache = this.queryCache;
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
    if (this._queryCacheMaxSize === null) return await fn();
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
    if (this._queryCacheMaxSize === null) return;
    const qc = this.queryCache;
    qc.enabled = true;
    qc.dirties = true;
  }

  disableQueryCacheBang(): void {
    if (this._queryCacheMaxSize === null) return;
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
    if (this._pinnedCount > 0) {
      this._queryCacheVersion.value++;
    }
    this.queryCache.clear();
  }

  get queryCache(): Store {
    return this._threadQueryCaches.computeIfAbsent(String(executionContextId()), () => {
      return new Store(this._queryCacheVersion, this._queryCacheMaxSize ?? 0);
    });
  }

  /** @internal */
  incrementPinnedCount(): void {
    this._pinnedCount++;
  }

  /** @internal */
  decrementPinnedCount(): void {
    this._pinnedCount--;
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

      const cached = lookupSqlCache.call(this, sql, name, binds ?? []);
      if (cached !== undefined) {
        return cached.map((r) => ({ ...r }));
      }

      return cacheSql.call(this, sql, name, binds ?? [], () =>
        original.call(this, sql, name, binds),
      );
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

/**
 * No-op base implementation. Each concrete adapter overrides
 * `AbstractAdapter#checkVersion` directly to raise when incompatible.
 *
 * @internal
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#check_version
 */
export function checkVersion(this: QueryCacheHost): void {}

/** @internal */
function unsetQueryCacheBang(this: QueryCacheHost): void {
  this._queryCache = null;
}

/** @internal */
function cacheNotificationInfo(
  this: QueryCacheHost,
  sql: string,
  name: string | null | undefined,
  binds: unknown[],
): Record<string, unknown> {
  const userTx = (this as any).currentTransaction?.()?.userTransaction ?? null;
  const transaction =
    userTx !== null && typeof userTx?.isOpen === "function" && userTx.isOpen() ? userTx : null;
  return {
    sql,
    binds,
    type_casted_binds: typeCastedBinds(binds),
    name: name ?? "SQL",
    connection: this,
    cached: true,
    transaction,
  };
}

/** @internal */
function cacheNotificationInfoResult(
  this: QueryCacheHost,
  sql: string,
  name: string | null | undefined,
  binds: unknown[],
  result: Record<string, unknown>[],
): Record<string, unknown> {
  const payload = cacheNotificationInfo.call(this, sql, name, binds);
  payload["row_count"] = result.length;
  return payload;
}

/** @internal */
function lookupSqlCache(
  this: QueryCacheHost,
  sql: string,
  name: string | null | undefined,
  binds: unknown[],
): Record<string, unknown>[] | undefined {
  const qc = this._queryCache;
  if (!qc) return undefined;
  const key = binds && binds.length > 0 ? JSON.stringify([sql, binds]) : sql;
  const result = qc.get(key);
  if (result !== undefined) {
    Notifications.instrument(
      "sql.active_record",
      cacheNotificationInfoResult.call(this, sql, name, binds, result),
    );
  }
  return result;
}

/** @internal */
function cacheSql(
  this: QueryCacheHost,
  sql: string,
  name: string | null | undefined,
  binds: unknown[],
  execute: () => Promise<Record<string, unknown>[]>,
): Promise<Record<string, unknown>[]> {
  const qc = this._queryCache;
  if (!qc) return execute();
  const key = binds && binds.length > 0 ? JSON.stringify([sql, binds]) : sql;
  return qc.computeIfAbsent(key, execute);
}

/**
 * Mixin object for AbstractAdapter: bundles private QueryCache helpers so
 * `include(AbstractAdapter, QueryCache)` credits them to the host class.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache (included in AbstractAdapter)
 */
export const QueryCache = {
  unsetQueryCacheBang,
  lookupSqlCache,
  cacheSql,
  cacheNotificationInfoResult,
  cacheNotificationInfo,
};
