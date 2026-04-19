import type { Result } from "./result.js";

/**
 * A single entry in `Relation#explain`'s options list. Either a bare
 * flag name (`"analyze"`, `"verbose"`) or a keyword hash (`{ format:
 * "json" }`) — mirrors Rails' `explain(*options)` where options can
 * be a mix of Symbols and a single Hash. Each adapter decides which
 * flags / keys it supports and throws on unknown ones.
 *
 * Mirrors: the `options` array shape used by Rails'
 * `ActiveRecord::Relation#explain` and its adapter `build_explain_clause`.
 */
export type ExplainOption = string | { format: string };

/**
 * Adapter-level options that travel alongside driver connection
 * params in a single config hash (Rails' database.yml shape).
 * Constructors strip these keys out before handing the rest to the
 * driver.
 *
 * Mirrors: the adapter-level keys read in
 * `ActiveRecord::ConnectionAdapters::AbstractAdapter#initialize`
 * (`:statement_limit`, `:prepared_statements`).
 */
export interface TrailsAdapterOptions {
  statementLimit?: number;
  preparedStatements?: boolean;
}

/**
 * Stringify an arbitrary value for inclusion in an EXPLAIN validation
 * error message. `as any` callers can hand us arbitrary shapes —
 * circular objects, BigInts, Symbols, functions — and a raw
 * `JSON.stringify` either throws or silently drops non-JSON values,
 * masking the validation error the caller actually needs to see.
 *
 * Uses `JSON.stringify` with a custom replacer that:
 *   - replaces circular refs with `"[Circular]"` (WeakSet-tracked)
 *   - renders `BigInt` as `"123n"`, `Symbol` as `"Symbol(desc)"`, and
 *     `function` as `"[Function: name]"` so the shape is visible
 *
 * `util.inspect` would be the idiomatic choice but is forbidden by the
 * repo's `blazetrails/no-node-builtins` rule (browser compat).
 */
export function inspectExplainOption(o: unknown): string {
  if (o === null) return "null";
  if (o === undefined) return "undefined";
  if (typeof o === "bigint") return `${o}n`;
  if (typeof o === "symbol") return o.toString();
  if (typeof o === "function") return `[Function: ${o.name || "anonymous"}]`;
  if (typeof o !== "object") return String(o);
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(o, (_k, v) => {
      if (typeof v === "bigint") return `${v}n`;
      if (typeof v === "symbol") return v.toString();
      if (typeof v === "function") return `[Function: ${v.name || "anonymous"}]`;
      if (v !== null && typeof v === "object") {
        if (seen.has(v as object)) return "[Circular]";
        seen.add(v as object);
      }
      return v;
    });
  } catch {
    // String(o) would invoke a user-defined toString/valueOf, which can
    // itself throw — masking the validation error we're here to preserve.
    // Object.prototype.toString.call(o) is spec-defined to produce
    // `[object Type]` without consulting user code.
    try {
      return Object.prototype.toString.call(o);
    } catch {
      return "[object Object]";
    }
  }
}

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
  quote?(value: unknown): string;

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
