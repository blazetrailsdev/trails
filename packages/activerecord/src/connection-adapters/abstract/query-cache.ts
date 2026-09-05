import { Attribute as ModelAttribute } from "@blazetrails/activemodel";
import { Notifications } from "@blazetrails/activesupport";
import {
  toSqlAndBinds,
  arelFromRelation,
  type DatabaseStatementsHost,
} from "./database-statements.js";
import { Result } from "../../result.js";
import { FutureResult, Complete as FutureResultComplete } from "../../future-result.js";
import {
  executionContextId,
  registerContextExitHook,
} from "./connection-pool/execution-context.js";
import { ExecutorHooks } from "./connection-pool.js";

const LOCKED_QUERY = /\bFOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i;

const DEFAULT_MAX_SIZE = 100;

export class Store {
  private _map = new Map<string, Record<string, unknown>[]>();
  private _maxSize: number | null;
  private _version: { value: number } | null;
  private _currentVersion: number;
  enabled = false;
  dirties = true;

  constructor(version: { value: number } | null = null, maxSize: number | null = DEFAULT_MAX_SIZE) {
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

    const entry = this._map.get(key);
    if (entry) {
      this._map.delete(key);
      this._map.set(key, entry);
      return Promise.resolve(entry);
    }

    if (this._maxSize != null && this._map.size >= this._maxSize) {
      const oldestKey = this._map.keys().next().value;
      if (oldestKey !== undefined) this._map.delete(oldestKey);
    }

    return compute().then((result) => {
      const stored = this._map.get(key);
      if (stored) return stored;
      this._map.set(key, result);
      return result;
    });
  }

  clear(): void {
    this._map.clear();
  }
}

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

export interface QueryCachePool {
  enableQueryCache<T>(fn: () => T | Promise<T>): T | Promise<T>;
  disableQueryCache<T>(fn: () => T | Promise<T>, opts?: { dirties?: boolean }): T | Promise<T>;
  enableQueryCacheBang(): void;
  disableQueryCacheBang(): void;
  clearQueryCache(): void;
  dirtiesQueryCache?: boolean;
}

export interface QueryCacheHost extends DatabaseStatementsHost {
  _queryCache: Store | null;
  pool: DatabaseStatementsHost["pool"] & QueryCachePool;
  /** @internal */
  cacheNotificationInfo(
    sql: string,
    name: string | null | undefined,
    binds: unknown[],
  ): Record<string, unknown>;
  /** @internal */
  cacheNotificationInfoResult(
    sql: string,
    name: string | null | undefined,
    binds: unknown[],
    result: Record<string, unknown>[],
  ): Record<string, unknown>;
  /** @internal */
  lookupSqlCache(
    sql: string,
    name: string | null | undefined,
    binds: unknown[],
  ): Record<string, unknown>[] | undefined;
  /** @internal */
  cacheSql(
    sql: string,
    name: string | null | undefined,
    binds: unknown[],
    block: () => Promise<Record<string, unknown>[]>,
  ): Promise<Record<string, unknown>[]>;
}

export class ConnectionPoolConfiguration {
  private _threadQueryCaches = new QueryCacheRegistry();
  private _queryCacheMaxSize: number | null;
  private _queryCacheVersion = { value: 0 };
  private _pinnedConnection: () => unknown;

  constructor(queryCache?: unknown, pinnedConnection: () => unknown = () => null) {
    this._pinnedConnection = pinnedConnection;
    if (queryCache === 0 || queryCache === false) {
      this._queryCacheMaxSize = null;
    } else if (typeof queryCache === "number") {
      this._queryCacheMaxSize = queryCache;
    } else if (queryCache == null) {
      this._queryCacheMaxSize = DEFAULT_MAX_SIZE;
    } else {
      this._queryCacheMaxSize = null;
    }
    ACTIVE_CACHE_CONFIGS.add(new WeakRef(this));
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE sync-reads-of-async-reflection-retire-with-rfc-0073
   */
  deleteStore(contextId: string): void {
    this._threadQueryCaches.deleteStore(contextId);
  }

  checkoutAndVerify(connection: QueryCacheHost): QueryCacheHost {
    if (!connection._queryCache) connection._queryCache = this.queryCache;
    return connection;
  }

  disableQueryCache<T>(
    fn: () => T | Promise<T>,
    options: { dirties?: boolean } = {},
  ): T | Promise<T> {
    const { dirties = true } = options;
    const cache = this.queryCache;
    const oldEnabled = cache.enabled;
    const oldDirties = cache.dirties;
    cache.enabled = false;
    cache.dirties = dirties;
    const restore = () => {
      cache.enabled = oldEnabled;
      cache.dirties = oldDirties;
    };
    let result: T | Promise<T>;
    try {
      result = fn();
    } catch (error) {
      restore();
      throw error;
    }
    if (result instanceof Promise) return result.finally(restore);
    restore();
    return result;
  }

  enableQueryCache<T>(fn: () => T | Promise<T>): T | Promise<T> {
    const cache = this.queryCache;
    const oldEnabled = cache.enabled;
    const oldDirties = cache.dirties;
    cache.enabled = true;
    cache.dirties = true;
    const restore = () => {
      cache.enabled = oldEnabled;
      cache.dirties = oldDirties;
    };
    let result: T | Promise<T>;
    try {
      result = fn();
    } catch (error) {
      restore();
      throw error;
    }
    if (result instanceof Promise) return result.finally(restore);
    restore();
    return result;
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
    if (this._pinnedConnection()) {
      this._queryCacheVersion.value++;
    }
    this.queryCache.clear();
  }

  get queryCache(): Store {
    return this._threadQueryCaches.computeIfAbsent(String(executionContextId()), () => {
      return new Store(this._queryCacheVersion, this._queryCacheMaxSize);
    });
  }
}

export function queryCache(this: QueryCacheHost): Store | null {
  return this._queryCache;
}

export function queryCacheEnabled(this: QueryCacheHost): boolean {
  return this._queryCache?.enabled ?? false;
}

export function cache<T>(this: QueryCacheHost, fn: () => T | Promise<T>): T | Promise<T> {
  return this.pool.enableQueryCache(fn);
}

export function enableQueryCacheBang(this: QueryCacheHost): void {
  this.pool.enableQueryCacheBang();
}

export function uncached<T>(
  this: QueryCacheHost,
  fn: () => T | Promise<T>,
  options: { dirties?: boolean } = {},
): T | Promise<T> {
  const { dirties = true } = options;
  return this.pool.disableQueryCache(fn, { dirties });
}

export function disableQueryCacheBang(this: QueryCacheHost): void {
  this.pool.disableQueryCacheBang();
}

export function clearQueryCache(this: QueryCacheHost): void {
  this.pool.clearQueryCache();
}

type BaseSelectAll = (
  this: QueryCacheHost,
  arel: string | unknown,
  name?: string | null,
  binds?: unknown[],
  opts?: { allowRetry?: boolean; preparable?: boolean | null; async?: boolean },
) => Result | Promise<Result> | FutureResult | FutureResultComplete;

export function makeCachedSelectAll(original: BaseSelectAll): BaseSelectAll {
  return function cachedSelectAll(
    this: QueryCacheHost,
    arel: string | unknown,
    name: string | null = null,
    binds?: unknown[],
    opts?: { allowRetry?: boolean; preparable?: boolean | null; async?: boolean },
  ): Result | Promise<Result> | FutureResult | FutureResultComplete {
    arel = arelFromRelation(arel);
    const [sql, resolvedBinds, compiledPreparable, compiledAllowRetry] = toSqlAndBinds.call(
      this as DatabaseStatementsHost,
      arel,
      binds ?? [],
      opts?.preparable ?? null,
      opts?.allowRetry ?? false,
    );
    binds = resolvedBinds;
    const resolvedPreparable = compiledPreparable ?? opts?.preparable;
    const forwardOpts = { ...opts, preparable: resolvedPreparable, allowRetry: compiledAllowRetry };
    const qc = this._queryCache;
    if (qc?.enabled && !LOCKED_QUERY.test(sql)) {
      if (opts?.async) {
        const cached = this.lookupSqlCache(sql, name, binds ?? []);
        const result =
          cached !== undefined
            ? Result.fromRowHashes(cached)
            : original.call(this, sql, name, binds, forwardOpts);
        return result instanceof Promise
          ? result.then((r) => FutureResult.wrap(r))
          : FutureResult.wrap(result);
      }
      return this.cacheSql(sql, name, binds ?? [], async () => {
        const result = await original.call(this, sql, name, binds, forwardOpts);
        return result.toArray();
      }).then((rows) => Result.fromRowHashes(rows));
    }
    return original.call(this, sql, name, binds, forwardOpts);
  };
}

/** @internal */
function clearCurrentThreadQueryCaches(host: QueryCacheHost): void {
  const cleared = new Set<Store>();
  ExecutorHooks.connectionHandler()?.eachConnectionPool((pool) => {
    const p = pool as unknown as QueryCachePool & { queryCache?: Store };
    p.clearQueryCache();
    if (p.queryCache) cleared.add(p.queryCache);
  });
  if (host._queryCache && !cleared.has(host._queryCache)) host._queryCache.clear();
}

export function dirtiesQueryCache(base: { prototype: object }, ...methodNames: string[]): void {
  const proto = base.prototype as Record<string, unknown>;
  for (const methodName of methodNames) {
    const original = proto[methodName];
    if (typeof original !== "function") continue;

    proto[methodName] = function (this: QueryCacheHost, ...args: unknown[]) {
      if (this._queryCache?.dirties) {
        clearCurrentThreadQueryCaches(this);
      }
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}

/** @internal */
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
    type_casted_binds: () => this.typeCastedBinds(binds),
    name,
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
  const payload = this.cacheNotificationInfo(sql, name, binds);
  payload["row_count"] = result.length;
  return payload;
}

/** @internal */
function sqlCacheKey(sql: string, binds: unknown[]): string {
  const values =
    binds && binds.length > 0
      ? binds.map((b) => (b instanceof ModelAttribute ? b.valueForDatabase : b))
      : binds;
  return binds && binds.length > 0
    ? JSON.stringify([sql, values], (_k, v) => (typeof v === "bigint" ? `${v}n` : v))
    : sql;
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
  const key = sqlCacheKey(sql, binds);
  const result = qc.get(key);
  if (result !== undefined) {
    Notifications.instrument(
      "sql.active_record",
      this.cacheNotificationInfoResult(sql, name, binds, result),
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
  block: () => Promise<Record<string, unknown>[]>,
): Promise<Record<string, unknown>[]> {
  const qc = this._queryCache;
  if (!qc) return block();
  const key = sqlCacheKey(sql, binds);
  let hit = true;

  return qc
    .computeIfAbsent(key, () => {
      hit = false;
      return block();
    })
    .then((result) => {
      if (hit) {
        Notifications.instrument(
          "sql.active_record",
          this.cacheNotificationInfoResult(sql, name, binds, result),
        );
      }
      return [...result];
    });
}

export const QueryCache = {
  unsetQueryCacheBang,
  lookupSqlCache,
  cacheSql,
  cacheNotificationInfoResult,
  cacheNotificationInfo,
};
