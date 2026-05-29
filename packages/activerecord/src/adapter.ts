/**
 * Re-export barrel — most exports have moved to their Rails-natural homes.
 * The DatabaseAdapter interface remains here until Phase G rewrites all
 * import sites; once that lands, this file is deleted.
 */

import type { Result } from "./result.js";
import type { SchemaCache } from "./connection-adapters/schema-cache.js";
import type { AlterTable } from "./connection-adapters/abstract/schema-definitions.js";
import type { Visitors } from "@blazetrails/arel";

export type { AdapterName } from "./connection-adapters/abstract-adapter.js";
export { adapterNameFromConfig } from "./connection-adapters/abstract-adapter.js";
export type { ExplainOption } from "./connection-adapters/abstract/database-statements.js";
export { inspectExplainOption } from "./connection-adapters/abstract/database-statements.js";
export type {
  TrailsAdapterOptions,
  SQLite3AdapterOptions,
  MysqlAdapterOptions,
  PostgreSQLAdapterOptions,
} from "./connection-adapters/pool-config.js";

import type { AdapterName } from "./connection-adapters/abstract-adapter.js";
import type { ExplainOption } from "./connection-adapters/abstract/database-statements.js";

/**
 * Database adapter interface — pluggable backends.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter
 */
export interface DatabaseAdapter {
  /**
   * Normalized adapter family: `"sqlite"`, `"postgres"`, or `"mysql"`.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#adapter_name
   */
  readonly adapterName: AdapterName;

  /**
   * Returns true when `error` is a raw driver error indicating the database
   * does not exist (e.g. SQLSTATE 3D000 for pg, ER_BAD_DB_ERROR for mysql2,
   * SQLITE_CANTOPEN for sqlite3). Used as a defensive fallback when pool
   * proxies re-surface untranslated errors before NoDatabaseError is thrown.
   */
  isNoDatabaseError(error: unknown): boolean;

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#preventing_writes?
   */
  isPreventingWrites(): boolean;

  /**
   * Execute a SQL query and return rows.
   */
  execute(sql: string, binds?: unknown[], name?: string): Promise<Record<string, unknown>[]>;

  /**
   * Execute a SQL statement that modifies data (INSERT/UPDATE/DELETE).
   * Returns the number of affected rows (or the inserted ID for INSERT).
   */
  executeMutation(sql: string, binds?: unknown[], name?: string): Promise<number>;

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
   * Drop cached prepared statements on the current connection. Safe
   * no-op for adapters with no statement pool. Called from the
   * transaction-manager's rollback path when the failure is a
   * `PreparedStatementCacheExpired` so subsequent statements
   * re-PREPARE on the same connection after the cache is cleared.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#clear_cache!
   */
  clearCacheBang?(): void;

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
   * Number of open transactions on this adapter's TransactionManager stack.
   * Zero for adapters without a TransactionManager.
   * Includes lazy (unmaterialized) transactions.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::TransactionManager#open_transactions
   */
  readonly openTransactions?: number;

  /**
   * Materialize any unmaterialized (lazy) transactions on the stack.
   * Only present on adapters with a full TransactionManager.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::TransactionManager#materialize_transactions
   */
  materializeTransactions?(): Promise<void>;

  /**
   * Schema cache for this adapter's connection pool. Holds table/column
   * metadata so repeated introspection queries are avoided.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#schema_cache
   */
  readonly schemaCache?: SchemaCache;

  /**
   * Pool-bound schema cache reflection. Returns a one-arg `indexes(tableName)`
   * form so call sites don't need to know about the connection pool. On
   * pool-backed adapters this delegates to the pool's BoundSchemaReflection;
   * on standalone adapters it wraps the adapter as a fake pool.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#schema_cache
   * (Rails' raw schema_cache already exposes a one-arg `indexes(tableName)`;
   * our TS port splits the cache from the bound handle, so this getter is
   * the Rails-shaped surface for call sites that just want to look things up.)
   */
  readonly schemaCacheBound?: import("./connection-adapters/schema-cache.js").BoundSchemaReflection;

  /**
   * Returns the SchemaStatements wrapper that pairs with this adapter.
   * Adapter subclasses override this to return a dialect-specific subclass
   * (e.g. PostgreSQLSchemaStatements). Used by Migration.schema and
   * defineSchema to dispatch DDL through the right override set.
   *
   * Mirrors: the include-pattern in Rails where each adapter mixes in its
   * own SchemaStatements module.
   *
   * The optional `host` parameter lets a caller ask this adapter to
   * instantiate its dialect-specific SchemaStatements bound to a different
   * host — so spies on the host still observe calls.
   */
  schemaStatements?(
    host?: DatabaseAdapter,
  ): import("./connection-adapters/abstract/schema-statements.js").SchemaStatements;

  /**
   * The underlying connection pool that owns this adapter checkout.
   * Passed to SchemaCache methods that need a pool handle for lazy loading.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#pool
   */
  readonly pool?: unknown;

  /**
   * Return the query execution plan for `sql`. `binds` carries the
   * same bind values the adapter would accept on `execute()`, so a
   * captured prepared-statement query re-EXPLAINs cleanly; `options`
   * carries the Rails-style variadic flags (e.g. `analyze`,
   * `verbose`) and keyword options (`{ format: "json" }`) for
   * adapters that support them. Both are optional for adapters that
   * pre-date the options surface.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#explain
   */
  explain?(sql: string, binds?: unknown[], options?: ExplainOption[]): Promise<string>;

  /**
   * Build the printed header prefix used by `Relation#explain` — e.g.
   * `"EXPLAIN for:"` (default), `"EXPLAIN (ANALYZE, VERBOSE) for:"`
   * (PG), `"EXPLAIN ANALYZE for:"` (MySQL), `"EXPLAIN QUERY PLAN for:"`
   * (SQLite). Distinct from `explain()` itself — this builds the
   * label row, not the actual SQL clause.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#build_explain_clause
   */
  buildExplainClause?(options?: ExplainOption[]): string;

  /**
   * Quote a value for inclusion in a SQL literal (e.g. `"'foo'"`,
   * `"42"`, `"NULL"`, `"x'DEADBEEF'"`). Concrete adapters override to
   * use their own string-escape rules — SQLite: `'' only`; PG: `E'\\'`
   * form when backslash present; MySQL: `\0 \n \r \Z \\` via
   * MYSQL_ESCAPE_MAP.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote
   */
  quote(value: unknown): string;

  /**
   * Quote an identifier (table or column name) for use in SQL.
   * Dispatch is per-adapter: abstract/SQLite/PG use double-quotes; MySQL uses backticks.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_identifier
   */
  quoteIdentifier(name: string): string;

  /**
   * Quote a table name for use in SQL.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_table_name
   */
  quoteTableName(name: string): string;

  /**
   * Quote a column name for use in SQL.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_column_name
   */
  quoteColumnName(name: string): string;

  /**
   * Quote a column default expression for use in DDL.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#quote_default_expression
   */
  quoteDefaultExpression(value: unknown, column?: unknown): string;

  /**
   * Cast a value to the primitive form drivers expect for binds.
   * Returns an **unquoted** primitive suitable for passing as a bind
   * value — distinct from `quote()`, which returns a SQL literal
   * with its surrounding quotes already attached.
   *
   * Adapter-specific behavior (mirrors Rails):
   * - **booleans**: SQLite / MySQL collapse to `1` / `0`; PostgreSQL
   *   keeps them as `true` / `false`.
   * - **Date**: returned as an **unquoted** formatted string
   *   (`"YYYY-MM-DD HH:MM:SS"` with optional `.microseconds` when
   *   milliseconds > 0 — matches Rails' `value.to_formatted_s(:db)`).
   *   `quote()` is responsible for wrapping it in single quotes.
   * - **null**: returned unchanged.
   * - **undefined**: adapter-dependent — SQLite coerces to `null`
   *   to match its nullable-column semantics; PG / MySQL /
   *   abstract pass through unchanged.
   * - **strings / numbers / bigints**: passed through.
   * - **symbols**: adapter-dependent — abstract / MySQL / PG use
   *   the symbol's description when present and fall back to
   *   `String(symbol)` otherwise; SQLite coerces description-less
   *   symbols to `null`.
   *
   * Rails' `render_bind` uses this rather than `quote()` so EXPLAIN
   * headers show the actual bind values instead of their SQL-literal
   * form.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#type_cast
   */
  typeCast?(value: unknown): unknown;

  // --- DatabaseStatements (Rails mixin) ---
  // Mirrors ActiveRecord::ConnectionAdapters::DatabaseStatements.
  // Default implementations delegate to execute()/executeMutation().

  selectAll(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    opts?: { allowRetry?: boolean },
  ): Promise<Result>;
  selectOne(
    sql: string,
    name?: string | null,
    binds?: unknown[],
  ): Promise<Record<string, unknown> | undefined>;
  selectValue(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown>;
  selectValues(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown[]>;
  selectRows(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown[][]>;
  execQuery(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { prepare?: boolean; allowRetry?: boolean },
  ): Promise<Result>;
  execInsert(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    pk?: string | false | null,
    sequenceName?: string | null,
    returning?: string[] | null,
  ): Promise<Result | number>;
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
  getAdvisoryLock?(lockId: number | bigint | string): Promise<boolean>;

  /**
   * Release an advisory lock. Returns true if the lock was released.
   * Optional — only implemented by adapters that support advisory locks.
   */
  releaseAdvisoryLock?(lockId: number | bigint | string): Promise<boolean>;

  /**
   * Return the name of the currently connected database.
   * Required by adapters that support advisory locks (used to derive a
   * per-database lock ID via MIGRATOR_SALT * crc32(dbName)).
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#current_database
   */
  currentDatabase?(): Promise<string>;

  /**
   * Quote a raw string for safe inclusion in a SQL literal (escape ' and \).
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_string
   */
  quoteString(s: string): string;

  /**
   * Mirrors: AbstractAdapter#quoted_binary. Returns a SQL literal for a
   * binary value (e.g. PG hex `'\x1f8b'`, SQLite blob literal). Must be
   * wrapped with `arelSql()` before use in an Arel value position.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#quoted_binary
   */
  quotedBinary(value: unknown): string;

  /** @internal Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quoted_true */
  quotedTrue(): string;

  /** @internal Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quoted_false */
  quotedFalse(): string;

  /**
   * Cached Arel visitor for this adapter's SQL dialect.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter — `attr_reader :visitor`
   * @internal
   */
  readonly visitor?: Visitors.ToSql;

  /**
   * Whether the adapter supports table/column comments.
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#supports_comments?
   */
  supportsComments?(): boolean;

  /**
   * Whether comments can be emitted inline in CREATE TABLE (vs a separate ALTER).
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#supports_comments_in_create?
   */
  supportsCommentsInCreate?(): boolean;

  /**
   * Whether the adapter supports inline INDEX clauses inside CREATE TABLE.
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#supports_indexes_in_create?
   */
  supportsIndexesInCreate?(): boolean;

  /**
   * Whether the adapter supports `datetime` columns with sub-second precision.
   * True for PostgreSQL, modern MySQL/MariaDB, and SQLite >= 3. Used by
   * `buildAddColumnDefinition` to default `precision: 6` when none is given.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#supports_datetime_with_precision?
   */
  supportsDatetimeWithPrecision?(): boolean;

  /**
   * Build an `AlterTable` object for the given table. The default
   * (abstract `SchemaStatements`) wraps `createTableDefinition(name)` so
   * `AlterTable#addColumn` routes through `td.newColumnDefinition` for
   * adapter-specific normalization (PG virtual columns, MySQL type
   * aliases, etc). Adapters that don't mix in `SchemaStatements` (e.g.
   * direct mocks in tests) may omit it.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SchemaStatements#create_alter_table
   */
  createAlterTable?(name: string): AlterTable;

  /**
   * Whether the adapter supports a conflict target in INSERT...ON CONFLICT.
   * True for PostgreSQL and SQLite >= 3.24. MySQL's ON DUPLICATE KEY UPDATE
   * has no conflict-target syntax, so this stays false there (matching Rails).
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#supports_insert_conflict_target?
   */
  supportsInsertConflictTarget?(): boolean;

  /**
   * Set or clear the comment on a table after it has been created.
   * Called by SchemaStatements#createTable when supportsComments() is true but
   * supportsCommentsInCreate() is false. The second parameter is `string | null`
   * when called from createTable; MySQL's override also accepts a column-map shape
   * for `change_table_comment`, hence the wider union in the interface.
   * Mirrors: ActiveRecord::ConnectionAdapters::SchemaStatements#change_table_comment
   */
  changeTableComment?(
    tableName: string,
    comment: string | null | Record<string, string | null>,
  ): Promise<void>;
}
