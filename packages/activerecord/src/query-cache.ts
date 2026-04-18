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

import { Notifications } from "@blazetrails/activesupport";
import type { DatabaseAdapter, ExplainOption } from "./adapter.js";
import { Result } from "./result.js";

const DEFAULT_MAX_SIZE = 100;

/**
 * LRU cache store for query results.
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache::Store
 */
export class QueryCacheStore {
  private _map = new Map<string, Record<string, unknown>[]>();
  private _maxSize: number;
  enabled = false;
  dirties = true;

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
 * Extract primitive values from bind objects, matching Rails' type_casted_binds.
 */
function castBinds(binds: unknown[]): unknown[] {
  return binds.map((b: any) => {
    if (b && typeof b === "object" && typeof b.valueForDatabase === "function") {
      return b.valueForDatabase();
    }
    return b && typeof b === "object" && "value" in b ? b.value : b;
  });
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
    const wasDirties = this.cache.dirties;
    this.cache.enabled = true;
    this.cache.dirties = true;
    try {
      return await fn();
    } finally {
      this.cache.enabled = wasEnabled;
      this.cache.dirties = wasDirties;
    }
  }

  /**
   * Disable the query cache within a callback.
   * Mirrors: ActiveRecord::Base.uncached { ... }
   */
  async uncached<T>(fn: () => Promise<T>, options: { dirties?: boolean } = {}): Promise<T> {
    const { dirties = true } = options;
    const wasEnabled = this.cache.enabled;
    const wasDirties = this.cache.dirties;
    this.cache.enabled = false;
    this.cache.dirties = dirties;
    try {
      return await fn();
    } finally {
      this.cache.enabled = wasEnabled;
      this.cache.dirties = wasDirties;
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

    // Strip leading SQL comments (e.g. from QueryLogs prepend) before detecting statement type
    const trimmed = sql
      .trimStart()
      .replace(/^(\/\*[\s\S]*?\*\/\s*)*/g, "")
      .trimStart()
      .toUpperCase();

    const isSelect = trimmed.startsWith("SELECT");
    const isReadOnlyCte = trimmed.startsWith("WITH") && !/\b(INSERT|UPDATE|DELETE)\b/.test(trimmed);

    // Write statements clear the cache regardless of whether caching is enabled,
    // preventing stale results when the cache is re-enabled later.
    if (!isSelect && !isReadOnlyCte) {
      if (this.cache.dirties) this.cache.clear();
      return this.inner.execute(sql, binds);
    }

    if (!this.cache.enabled) {
      return this.inner.execute(sql, binds);
    }

    // Don't cache locked queries (SELECT ... FOR UPDATE)
    if (/\bFOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i.test(sql)) {
      return this.inner.execute(sql, binds);
    }

    const key = cacheKey(sql, binds);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this._cacheHits++;
      // Emit sql.active_record with cached: true, matching Rails'
      // lookup_sql_cache / cache_sql cache-hit notifications.
      const bindArray = binds ?? [];
      Notifications.instrument("sql.active_record", {
        sql,
        name: "SQL",
        binds: bindArray,
        type_casted_binds: castBinds(bindArray),
        connection: this,
        cached: true,
        row_count: cached.length,
      });
      return cached.map((row) => ({ ...row }));
    }
    return this.cache.computeIfAbsent(key, async () => {
      return this.inner.execute(sql, binds);
    });
  }

  async executeMutation(sql: string, binds?: unknown[]): Promise<number> {
    this._queryCount++;
    if (this.cache.dirties) this.cache.clear();
    return this.inner.executeMutation(sql, binds);
  }

  async beginTransaction(): Promise<void> {
    return this.inner.beginTransaction();
  }

  async commit(): Promise<void> {
    return this.inner.commit();
  }

  async rollback(): Promise<void> {
    if (this.cache.dirties) this.cache.clear();
    return this.inner.rollback();
  }

  async createSavepoint(name: string): Promise<void> {
    return this.inner.createSavepoint(name);
  }

  async releaseSavepoint(name: string): Promise<void> {
    return this.inner.releaseSavepoint(name);
  }

  async rollbackToSavepoint(name: string): Promise<void> {
    if (this.cache.dirties) this.cache.clear();
    return this.inner.rollbackToSavepoint(name);
  }

  get inTransaction(): boolean {
    return this.inner.inTransaction;
  }

  async explain(
    sql: string,
    binds: unknown[] = [],
    options: ExplainOption[] = [],
  ): Promise<string> {
    const inner = this.inner as {
      explain?: (sql: string, binds?: unknown[], options?: ExplainOption[]) => Promise<string>;
    };
    if (typeof inner.explain === "function") {
      // Forward binds/options so `Relation#explain("analyze", ...)` and
      // prepared-statement binds flow through the wrapper. Dropping
      // them here would make behavior diverge depending on whether
      // QueryCacheAdapter sits in front of the real adapter.
      return inner.explain(sql, binds, options);
    }
    return "EXPLAIN is not supported by the underlying adapter";
  }

  buildExplainClause(options: ExplainOption[] = []): string {
    const inner = this.inner as { buildExplainClause?: (options: ExplainOption[]) => string };
    if (typeof inner.buildExplainClause === "function") {
      return inner.buildExplainClause(options);
    }
    if (options.length === 0) return "EXPLAIN for:";
    // Wrapped adapter lacks buildExplainClause — we can safely render
    // bare string flags, but the keyword hash shape is adapter-specific
    // (PG: `FORMAT JSON`, MySQL: `FORMAT=JSON`) and we don't know which
    // this adapter would accept. Drop the hash from the printed header
    // rather than throw; `Relation#explain` can still succeed via the
    // adapter's `explain(sql, binds, options)` if that's implemented.
    const stringOptions = options.filter((o): o is string => typeof o === "string");
    if (stringOptions.length === 0) return "EXPLAIN for:";
    const parts = stringOptions.map((o) => o.toUpperCase());
    return `EXPLAIN (${parts.join(", ")}) for:`;
  }

  quote(value: unknown): string {
    const inner = this.inner as { quote?: (v: unknown) => string };
    if (typeof inner.quote === "function") return inner.quote(value);
    // `String(value)` is NOT a safe SQL literal (doesn't escape, doesn't
    // wrap strings in quotes, doesn't format Dates). Throw instead of
    // returning unsafe output — every wrapped adapter we ship implements
    // `quote()`.
    throw new Error(
      `QueryCacheAdapter.quote: wrapped ${this.inner.adapterName} does not implement quote()`,
    );
  }

  typeCast(value: unknown): unknown {
    const inner = this.inner as { typeCast?: (v: unknown) => unknown };
    if (typeof inner.typeCast === "function") return inner.typeCast(value);
    throw new Error(
      `QueryCacheAdapter.typeCast: wrapped ${this.inner.adapterName} does not implement typeCast()`,
    );
  }

  // --- DatabaseStatements ---
  // Read methods go through this.execute() to leverage the query cache.
  // Write methods go through this.executeMutation() to clear the cache.

  async selectAll(sql: string, name?: string | null, binds?: unknown[]): Promise<Result> {
    // Check cache directly here (rather than via execute()) so the
    // notification payload carries the caller-supplied name (e.g.
    // "Developer Load") instead of the generic "SQL".
    if (this.cache.enabled) {
      const key = cacheKey(sql, binds);
      const cached = this.cache.get(key);
      if (cached !== undefined) {
        this._cacheHits++;
        this._queryCount++;
        const bindArray = binds ?? [];
        Notifications.instrument("sql.active_record", {
          sql,
          name: name ?? "SQL",
          binds: bindArray,
          type_casted_binds: castBinds(bindArray),
          connection: this,
          cached: true,
          row_count: cached.length,
        });
        return Result.fromRowHashes(cached.map((row) => ({ ...row })));
      }
    }
    const rows = await this.execute(sql, binds);
    return Result.fromRowHashes(rows);
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

  async execQuery(sql: string, _name?: string | null, binds?: unknown[]): Promise<Result> {
    const rows = await this.execute(sql, binds);
    return Result.fromRowHashes(rows);
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
