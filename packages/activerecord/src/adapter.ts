import type { Result } from "./result.js";

/**
 * Database adapter interface — pluggable backends.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter
 */
export interface DatabaseAdapter {
  /**
   * Human-readable adapter name (e.g. "SQLite", "PostgreSQL", "Mysql2").
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#adapter_name
   */
  readonly adapterName: string;

  /**
   * Execute a SQL query and return rows.
   */
  execute(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]>;

  /**
   * Execute a SQL statement that modifies data (INSERT/UPDATE/DELETE).
   * Returns the number of affected rows (or the inserted ID for INSERT).
   */
  executeMutation(sql: string, binds?: unknown[]): Promise<number>;

  /**
   * Begin a transaction.
   */
  beginTransaction(): Promise<void>;

  /**
   * Commit a transaction.
   */
  commit(): Promise<void>;

  /**
   * Rollback a transaction.
   */
  rollback(): Promise<void>;

  /**
   * Create a savepoint.
   */
  createSavepoint(name: string): Promise<void>;

  /**
   * Release a savepoint.
   */
  releaseSavepoint(name: string): Promise<void>;

  /**
   * Rollback to a savepoint.
   */
  rollbackToSavepoint(name: string): Promise<void>;

  /**
   * Whether the adapter is currently inside a transaction.
   */
  readonly inTransaction: boolean;

  /**
   * Return the query execution plan for `sql`. `binds` carries the
   * same bind values the adapter would accept on `execute()`, so a
   * captured prepared-statement query re-EXPLAINs cleanly; `options`
   * carries the Rails-style variadic flags (e.g. `analyze`,
   * `verbose`) for adapters that support them. Both are optional for
   * adapters that pre-date the options surface.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#explain
   */
  explain?(sql: string, binds?: unknown[], options?: string[]): Promise<string>;

  /**
   * Build the printed header prefix used by `Relation#explain` — e.g.
   * `"EXPLAIN for:"` (default), `"EXPLAIN (ANALYZE, VERBOSE) for:"`
   * (PG), `"EXPLAIN ANALYZE for:"` (MySQL), `"EXPLAIN QUERY PLAN for:"`
   * (SQLite). Distinct from `explain()` itself — this builds the
   * label row, not the actual SQL clause.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#build_explain_clause
   */
  buildExplainClause?(options?: string[]): string;

  // --- DatabaseStatements (Rails mixin) ---
  // Mirrors ActiveRecord::ConnectionAdapters::DatabaseStatements.
  // Default implementations delegate to execute()/executeMutation().

  selectAll(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  selectOne(
    sql: string,
    name?: string | null,
    binds?: unknown[],
  ): Promise<Record<string, unknown> | undefined>;
  selectValue(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown>;
  selectValues(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown[]>;
  selectRows(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown[][]>;
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  execInsert(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execDelete(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execUpdate(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  isWriteQuery(sql: string): boolean;
  emptyInsertStatementValue(pk?: string | null): string;
  getDatabaseVersion?(): unknown;
  /**
   * Whether the adapter supports wrapping DDL statements in a
   * transaction. When true, Migrator wraps each migration in
   * begin/commit. Optional — defaults to false when absent.
   */
  supportsDdlTransactions?(): boolean;

  /**
   * Whether the adapter supports advisory locks for migration
   * concurrency. Optional — defaults to false when absent.
   */
  supportsAdvisoryLocks?(): boolean;

  /**
   * Acquire an advisory lock. Returns true if the lock was obtained.
   * Optional — only implemented by adapters that support advisory locks.
   */
  getAdvisoryLock?(lockId: number | string): Promise<boolean>;

  /**
   * Release an advisory lock. Returns true if the lock was released.
   * Optional — only implemented by adapters that support advisory locks.
   */
  releaseAdvisoryLock?(lockId: number | string): Promise<boolean>;
}
