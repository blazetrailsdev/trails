/**
 * Query cache for ActiveRecord adapters.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache
 *
 * Wraps a DatabaseAdapter to cache SELECT query results. When enabled,
 * repeated identical SELECT queries return cached results instead of
 * hitting the database. Mutations (INSERT/UPDATE/DELETE) and transaction
 * rollbacks automatically clear the cache.
 */

import type { DatabaseAdapter } from "./adapter.js";

const DEFAULT_MAX_SIZE = 100;

/**
 * LRU cache store for query results.
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache::Store
 */
export class QueryCacheStore {
  private _map = new Map<string, Record<string, unknown>[]>();
  private _maxSize: number;
  enabled = false;

  constructor(maxSize: number = DEFAULT_MAX_SIZE) {
    this._maxSize = maxSize;
  }

  get size(): number {
    return this._map.size;
  }

  get empty(): boolean {
    return this._map.size === 0;
  }

  get(key: string): Record<string, unknown>[] | undefined {
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
 * Build a cache key from a SQL string and optional binds.
 */
function cacheKey(sql: string, binds?: unknown[]): string {
  if (!binds || binds.length === 0) return sql;
  return JSON.stringify([sql, binds]);
}

/**
 * Wraps a DatabaseAdapter with query caching.
 *
 * - SELECT queries (via execute) are cached when enabled
 * - Mutations (via executeMutation) clear the cache
 * - Transaction rollbacks clear the cache
 * - Locked queries (FOR UPDATE) bypass the cache
 */
export class QueryCacheAdapter implements DatabaseAdapter {
  get adapterName(): string {
    return this.inner.adapterName;
  }

  readonly inner: DatabaseAdapter;
  readonly cache: QueryCacheStore;
  private _queryCount = 0;
  private _cacheHits = 0;

  constructor(inner: DatabaseAdapter, maxSize?: number) {
    this.inner = inner;
    this.cache = new QueryCacheStore(maxSize);
  }

  get queryCount(): number {
    return this._queryCount;
  }

  get cacheHits(): number {
    return this._cacheHits;
  }

  resetCounters(): void {
    this._queryCount = 0;
    this._cacheHits = 0;
  }

  /**
   * Enable the query cache within a callback.
   * Mirrors: ActiveRecord::Base.cache { ... }
   */
  async withCache<T>(fn: () => Promise<T>): Promise<T> {
    const wasEnabled = this.cache.enabled;
    this.cache.enabled = true;
    try {
      return await fn();
    } finally {
      this.cache.enabled = wasEnabled;
    }
  }

  /**
   * Disable the query cache within a callback.
   * Mirrors: ActiveRecord::Base.uncached { ... }
   */
  async uncached<T>(fn: () => Promise<T>): Promise<T> {
    const wasEnabled = this.cache.enabled;
    this.cache.enabled = false;
    try {
      return await fn();
    } finally {
      this.cache.enabled = wasEnabled;
    }
  }

  /**
   * Enable the cache permanently (until disabled).
   */
  enableQueryCache(): void {
    this.cache.enabled = true;
  }

  /**
   * Disable the cache permanently (until enabled).
   */
  disableQueryCache(): void {
    this.cache.enabled = false;
  }

  /**
   * Clear the cache.
   */
  clearQueryCache(): void {
    this.cache.clear();
  }

  async execute(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]> {
    this._queryCount++;

    if (!this.cache.enabled) {
      return this.inner.execute(sql, binds);
    }

    // Strip leading SQL comments (e.g. from QueryLogs prepend) before detecting statement type
    const trimmed = sql
      .trimStart()
      .replace(/^(\/\*[\s\S]*?\*\/\s*)*/g, "")
      .trimStart()
      .toUpperCase();

    // Only cache SELECT and read-only WITH (CTE) queries.
    // WITH can prefix write CTEs (WITH ... INSERT/UPDATE/DELETE), so check for those.
    const isSelect = trimmed.startsWith("SELECT");
    const isReadOnlyCte = trimmed.startsWith("WITH") && !/\b(INSERT|UPDATE|DELETE)\b/.test(trimmed);
    if (!isSelect && !isReadOnlyCte) {
      this.cache.clear();
      return this.inner.execute(sql, binds);
    }

    // Don't cache locked queries (SELECT ... FOR UPDATE)
    if (/\bFOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i.test(sql)) {
      return this.inner.execute(sql, binds);
    }

    const key = cacheKey(sql, binds);
    const wasHit = this.cache.get(key) !== undefined;
    return this.cache
      .computeIfAbsent(key, async () => {
        return this.inner.execute(sql, binds);
      })
      .then((result) => {
        if (wasHit) this._cacheHits++;
        return result;
      });
  }

  async executeMutation(sql: string, binds?: unknown[]): Promise<number> {
    this._queryCount++;
    this.cache.clear();
    return this.inner.executeMutation(sql, binds);
  }

  async beginTransaction(): Promise<void> {
    return this.inner.beginTransaction();
  }

  async commit(): Promise<void> {
    return this.inner.commit();
  }

  async rollback(): Promise<void> {
    this.cache.clear();
    return this.inner.rollback();
  }

  async createSavepoint(name: string): Promise<void> {
    return this.inner.createSavepoint(name);
  }

  async releaseSavepoint(name: string): Promise<void> {
    return this.inner.releaseSavepoint(name);
  }

  async rollbackToSavepoint(name: string): Promise<void> {
    this.cache.clear();
    return this.inner.rollbackToSavepoint(name);
  }

  get inTransaction(): boolean {
    return this.inner.inTransaction;
  }

  async explain(sql: string): Promise<string> {
    if (typeof (this.inner as any).explain === "function") {
      return (this.inner as any).explain(sql);
    }
    return "EXPLAIN is not supported by the underlying adapter";
  }

  // --- DatabaseStatements ---
  // Read methods go through this.execute() to leverage the query cache.
  // Write methods go through this.executeMutation() to clear the cache.

  async selectAll(
    sql: string,
    _name?: string | null,
    binds?: unknown[],
  ): Promise<Record<string, unknown>[]> {
    return this.execute(sql, binds);
  }

  async selectOne(
    sql: string,
    _name?: string | null,
    binds?: unknown[],
  ): Promise<Record<string, unknown> | undefined> {
    const rows = await this.execute(sql, binds);
    return rows[0];
  }

  async selectValue(sql: string, _name?: string | null, binds?: unknown[]): Promise<unknown> {
    const rows = await this.execute(sql, binds);
    if (rows.length === 0) return undefined;
    const keys = Object.keys(rows[0]);
    return keys.length > 0 ? rows[0][keys[0]] : undefined;
  }

  async selectValues(sql: string, _name?: string | null, binds?: unknown[]): Promise<unknown[]> {
    const rows = await this.execute(sql, binds);
    if (rows.length === 0) return [];
    const firstKey = Object.keys(rows[0])[0];
    if (firstKey === undefined) return rows.map(() => undefined);
    return rows.map((row) => row[firstKey]);
  }

  async selectRows(sql: string, _name?: string | null, binds?: unknown[]): Promise<unknown[][]> {
    const rows = await this.execute(sql, binds);
    if (rows.length === 0) return [];
    const keys = Object.keys(rows[0]);
    return rows.map((row) => keys.map((key) => row[key]));
  }

  async execQuery(
    sql: string,
    _name?: string | null,
    binds?: unknown[],
  ): Promise<Record<string, unknown>[]> {
    return this.execute(sql, binds);
  }

  async execInsert(sql: string, _name?: string | null, binds?: unknown[]): Promise<number> {
    return this.executeMutation(sql, binds);
  }

  async execDelete(sql: string, _name?: string | null, binds?: unknown[]): Promise<number> {
    return this.executeMutation(sql, binds);
  }

  async execUpdate(sql: string, _name?: string | null, binds?: unknown[]): Promise<number> {
    return this.executeMutation(sql, binds);
  }

  isWriteQuery(sql: string): boolean {
    return this.inner.isWriteQuery(sql);
  }

  emptyInsertStatementValue(pk?: string | null): string {
    return this.inner.emptyInsertStatementValue(pk);
  }
}
