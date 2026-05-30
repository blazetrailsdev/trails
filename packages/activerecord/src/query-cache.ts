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
import type { AdapterName, DatabaseAdapter, ExplainOption } from "./adapter.js";
import type { Visitors } from "@blazetrails/arel";
import { Result } from "./result.js";
// Import under the qualified TS name so the public `QueryCacheAdapter`
// surface (e.g. `.cache: QueryCacheStore`) doesn't leak the generic
// `Store` symbol into the generated `.d.ts`.
import { Store as QueryCacheStore } from "./connection-adapters/abstract/query-cache.js";
import { sanitizeAsSqlComment as abstractSanitizeAsSqlComment } from "./connection-adapters/abstract/quoting.js";

// Deep-import convenience: consumers doing
// `import { ... } from "@blazetrails/activerecord/query-cache.js"`
// can still reach the Store class from here under its
// root-exported name.
export { QueryCacheStore };

/**
 * QueryCache executor hooks — enable/disable query caching per-request.
 *
 * Mirrors: ActiveRecord::QueryCache (the module with run/complete hooks)
 *
 * In Rails these are registered as Rack middleware executor hooks that
 * enable the query cache at the start of each request and clear it
 * at the end. In our JS runtime, callers use these directly or
 * register them with their own request lifecycle.
 */
/**
 * A connection pool whose query cache `run` can enable. The guard lives here,
 * not inside `enableQueryCacheBang`, mirroring Rails' `QueryCache.run`:
 * pools already enabled, or disabled by config, are skipped.
 */
export interface QueryCachePoolTarget {
  readonly queryCacheEnabled: boolean;
  readonly queryCacheDisabled: boolean;
  enableQueryCacheBang(): void;
}

/**
 * A connection pool whose query cache `cache`/`uncached` block helpers can
 * drive. Mirrors the `connection_pool` that Rails'
 * `ActiveRecord::QueryCache::ClassMethods` operate on (`enable_query_cache`
 * via the clear-on-exit `withQueryCache`, and `disable_query_cache`).
 */
export interface QueryCacheBlockPool {
  withQueryCache<T>(fn: () => T | Promise<T>): Promise<T>;
  disableQueryCache<T>(fn: () => T | Promise<T>, options?: { dirties?: boolean }): Promise<T>;
}

function isQueryCachePoolTarget(
  target: QueryCacheAdapter | QueryCachePoolTarget,
): target is QueryCachePoolTarget {
  return typeof (target as QueryCachePoolTarget).enableQueryCacheBang === "function";
}

export class QueryCache {
  /**
   * Enable the query cache on `pool` for the duration of `block`, then restore
   * the prior state — clearing the cache on exit unless it was already enabled.
   *
   * Mirrors: ActiveRecord::QueryCache::ClassMethods#cache
   * (`pool.enable_query_cache(&block)` with `pool.clear_query_cache unless
   * was_enabled` in the ensure; the pool's `withQueryCache` owns that logic).
   */
  static cache<T>(pool: QueryCacheBlockPool, block: () => T | Promise<T>): Promise<T> {
    return pool.withQueryCache(block);
  }

  /**
   * Disable the query cache on `pool` within `block`. Pass `dirties: false` to
   * stop write operations from clearing every connection's query cache (the
   * default dirties them in case they are replicas with now-stale caches).
   *
   * Mirrors: ActiveRecord::QueryCache::ClassMethods#uncached
   * (`connection_pool.disable_query_cache(dirties: dirties, &block)`).
   */
  static uncached<T>(
    pool: QueryCacheBlockPool,
    block: () => T | Promise<T>,
    options: { dirties?: boolean } = {},
  ): Promise<T> {
    return pool.disableQueryCache(block, options);
  }

  /**
   * Enable query cache on all provided pools/adapters, skipping pools whose
   * cache is already enabled or disabled by configuration.
   * Called at the start of a request/execution context.
   *
   * Mirrors: ActiveRecord::QueryCache.run
   * (`each_connection_pool.reject(&:query_cache_enabled).each { next if
   * pool.db_config&.query_cache == false; pool.enable_query_cache! }`)
   */
  static run(targets: (QueryCacheAdapter | QueryCachePoolTarget)[]): void {
    for (const target of targets) {
      if (isQueryCachePoolTarget(target)) {
        if (target.queryCacheEnabled || target.queryCacheDisabled) continue;
        target.enableQueryCacheBang();
      } else {
        target.enableQueryCache();
      }
    }
  }

  /**
   * Disable and clear query cache on all provided adapters.
   * Called at the end of a request/execution context.
   *
   * Mirrors: ActiveRecord::QueryCache::ExecutorHooks.complete
   */
  static complete(adapters: QueryCacheAdapter[]): void {
    for (const adapter of adapters) {
      adapter.disableQueryCache();
      adapter.clearQueryCache();
    }
  }

  /**
   * Register query cache hooks with an executor-like object.
   *
   * Mirrors: ActiveRecord::QueryCache.install_executor_hooks
   */
  static installExecutorHooks(
    executor?: {
      registerHook(hook: { run(): void; complete(): void }): void;
    },
    adapters: QueryCacheAdapter[] | (() => QueryCacheAdapter[]) = [],
  ): void {
    if (!executor) return;
    const resolve = typeof adapters === "function" ? adapters : () => adapters;

    // Mirrors Rails' ExecutorHooks module with static run/complete
    class ExecutorHooks {
      static run() {
        QueryCache.run(resolve());
      }
      static complete() {
        QueryCache.complete(resolve());
      }
    }

    executor.registerHook(ExecutorHooks);
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
 * Walk the adapter chain to find currentTransaction().userTransaction.
 * Returns null when no real transaction is open (userTransaction.isOpen() === false,
 * i.e. it is Transaction.NULL_TRANSACTION or a finalized transaction).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#cache_notification_info
 * `transaction: current_transaction.user_transaction.presence`
 */
function getCurrentUserTransaction(adapter: unknown): unknown {
  let a: unknown = adapter;
  while (a !== null && a !== undefined && typeof a === "object") {
    if (typeof (a as Record<string, unknown>).currentTransaction === "function") {
      const tx: unknown = (a as { currentTransaction(): unknown }).currentTransaction();
      const userTx = (tx as Record<string, unknown> | null | undefined)?.userTransaction ?? null;
      // NULL_TRANSACTION.isOpen() === false; only return for real open transactions
      if (
        userTx !== null &&
        typeof userTx === "object" &&
        typeof (userTx as { isOpen?(): boolean }).isOpen === "function" &&
        (userTx as { isOpen(): boolean }).isOpen()
      ) {
        return userTx;
      }
      return null;
    }
    a = (a as Record<string, unknown>).inner ?? null;
  }
  return null;
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
  get adapterName(): AdapterName {
    return this.inner.adapterName;
  }

  isNoDatabaseError(error: unknown): boolean {
    return this.inner.isNoDatabaseError(error);
  }

  isPreventingWrites(): boolean {
    return this.inner.isPreventingWrites();
  }

  toSql(arel: unknown, binds?: unknown[]): string {
    return this.inner.toSql(arel, binds);
  }

  readonly inner: DatabaseAdapter;
  readonly cache: QueryCacheStore;
  private _queryCount = 0;
  private _cacheHits = 0;

  constructor(inner: DatabaseAdapter, maxSize?: number) {
    this.inner = inner;
    this.cache = new QueryCacheStore(null, maxSize);
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

  async execute(sql: string, binds?: unknown[], name?: string): Promise<Record<string, unknown>[]> {
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
      return this.inner.execute(sql, binds, name);
    }

    if (!this.cache.enabled) {
      return this.inner.execute(sql, binds, name);
    }

    // Don't cache locked queries (SELECT ... FOR UPDATE)
    if (/\bFOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i.test(sql)) {
      return this.inner.execute(sql, binds, name);
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
        name: name ?? "SQL",
        binds: bindArray,
        type_casted_binds: castBinds(bindArray),
        connection: this,
        cached: true,
        row_count: cached.length,
        transaction: getCurrentUserTransaction(this.inner),
      });
      return cached.map((row) => ({ ...row }));
    }
    return this.cache.computeIfAbsent(key, async () => {
      return this.inner.execute(sql, binds, name);
    });
  }

  async executeMutation(sql: string, binds?: unknown[], name?: string): Promise<number> {
    this._queryCount++;
    if (this.cache.dirties) this.cache.clear();
    return this.inner.executeMutation(sql, binds, name);
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

  quoteIdentifier(name: string): string {
    const inner = this.inner as { quoteIdentifier?: (n: string) => string };
    if (typeof inner.quoteIdentifier === "function") return inner.quoteIdentifier(name);
    throw new Error(
      `QueryCacheAdapter.quoteIdentifier: wrapped ${this.inner.adapterName} does not implement quoteIdentifier()`,
    );
  }

  createTableDefinition(name: string, options: Record<string, unknown> = {}): unknown {
    const inner = this.inner as {
      createTableDefinition?(n: string, o: Record<string, unknown>): unknown;
    };
    if (typeof inner.createTableDefinition === "function") {
      return inner.createTableDefinition(name, options);
    }
    throw new Error(
      `QueryCacheAdapter.createTableDefinition: wrapped ${this.inner.adapterName} does not implement createTableDefinition()`,
    );
  }

  quoteTableName(name: string): string {
    const inner = this.inner as { quoteTableName?: (n: string) => string };
    if (typeof inner.quoteTableName === "function") return inner.quoteTableName(name);
    throw new Error(
      `QueryCacheAdapter.quoteTableName: wrapped ${this.inner.adapterName} does not implement quoteTableName()`,
    );
  }

  quoteColumnName(name: string): string {
    const inner = this.inner as { quoteColumnName?: (n: string) => string };
    if (typeof inner.quoteColumnName === "function") return inner.quoteColumnName(name);
    throw new Error(
      `QueryCacheAdapter.quoteColumnName: wrapped ${this.inner.adapterName} does not implement quoteColumnName()`,
    );
  }

  quoteString(s: string): string {
    const inner = this.inner as { quoteString?: (s: string) => string };
    if (typeof inner.quoteString === "function") return inner.quoteString(s);
    return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
  }

  quotedBinary(value: unknown): string {
    const inner = this.inner as { quotedBinary?: (v: unknown) => string };
    if (typeof inner.quotedBinary === "function") return inner.quotedBinary(value);
    throw new Error(
      `QueryCacheAdapter.quotedBinary: wrapped ${this.inner.adapterName} does not implement quotedBinary()`,
    );
  }

  quotedTrue(): string {
    return this.inner.quotedTrue();
  }

  quotedFalse(): string {
    return this.inner.quotedFalse();
  }

  quoteDefaultExpression(value: unknown): string {
    const inner = this.inner as { quoteDefaultExpression?: (v: unknown) => string };
    if (typeof inner.quoteDefaultExpression === "function")
      return inner.quoteDefaultExpression(value);
    throw new Error(
      `QueryCacheAdapter.quoteDefaultExpression: wrapped ${this.inner.adapterName} does not implement quoteDefaultExpression()`,
    );
  }

  quoteTableNameForAssignment(table: string, attr: string): string {
    const inner = this.inner as { quoteTableNameForAssignment?: (t: string, a: string) => string };
    if (typeof inner.quoteTableNameForAssignment === "function")
      return inner.quoteTableNameForAssignment(table, attr);
    return this.quoteTableName(`${table}.${attr}`);
  }

  castBoundValue(value: unknown): unknown {
    const inner = this.inner as { castBoundValue?: (v: unknown) => unknown };
    if (typeof inner.castBoundValue === "function") return inner.castBoundValue(value);
    return value;
  }

  sanitizeAsSqlComment(value: unknown): string {
    const inner = this.inner as { sanitizeAsSqlComment?: (v: unknown) => string };
    if (typeof inner.sanitizeAsSqlComment === "function") return inner.sanitizeAsSqlComment(value);
    return abstractSanitizeAsSqlComment(value);
  }

  get visitor(): Visitors.ToSql | undefined {
    return (this.inner as { visitor?: Visitors.ToSql }).visitor;
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
          transaction: getCurrentUserTransaction(this.inner),
        });
        return Result.fromRowHashes(cached.map((row) => ({ ...row })));
      }
    }
    const rows = await this.execute(sql, binds, name ?? undefined);
    return Result.fromRowHashes(rows);
  }

  async selectOne(
    sql: string,
    name?: string | null,
    binds?: unknown[],
  ): Promise<Record<string, unknown> | undefined> {
    const rows = await this.execute(sql, binds, name ?? undefined);
    return rows[0];
  }

  async selectValue(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown> {
    const rows = await this.execute(sql, binds, name ?? undefined);
    if (rows.length === 0) return undefined;
    const keys = Object.keys(rows[0]);
    return keys.length > 0 ? rows[0][keys[0]] : undefined;
  }

  async selectValues(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown[]> {
    const rows = await this.execute(sql, binds, name ?? undefined);
    if (rows.length === 0) return [];
    const firstKey = Object.keys(rows[0])[0];
    if (firstKey === undefined) return rows.map(() => undefined);
    return rows.map((row) => row[firstKey]);
  }

  async selectRows(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown[][]> {
    const rows = await this.execute(sql, binds, name ?? undefined);
    if (rows.length === 0) return [];
    const keys = Object.keys(rows[0]);
    return rows.map((row) => keys.map((key) => row[key]));
  }

  async execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result> {
    const rows = await this.execute(sql, binds, name ?? undefined);
    return Result.fromRowHashes(rows);
  }

  async execInsert(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    pk?: string | false | null,
    sequenceName?: string | null,
    returning?: string[] | null,
  ): Promise<Result | number> {
    this._queryCount++;
    if (this.cache.dirties) this.cache.clear();
    return this.inner.execInsert(sql, name, binds, pk, sequenceName, returning);
  }

  async execDelete(sql: string, name?: string | null, binds?: unknown[]): Promise<number> {
    return this.executeMutation(sql, binds, name ?? undefined);
  }

  async execUpdate(sql: string, name?: string | null, binds?: unknown[]): Promise<number> {
    return this.executeMutation(sql, binds, name ?? undefined);
  }

  isWriteQuery(sql: string): boolean {
    return this.inner.isWriteQuery(sql);
  }

  emptyInsertStatementValue(pk?: string | null): string {
    return this.inner.emptyInsertStatementValue(pk);
  }
}
