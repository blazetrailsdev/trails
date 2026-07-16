/**
 * SQLite3 database statements — SQLite-specific query execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements
 *
 * In Rails these are instance methods on the DatabaseStatements module
 * mixed into the adapter. Here they're standalone functions that accept
 * an adapter for execution, matching the codebase's mixin pattern.
 */

import { sql as arelSql } from "@blazetrails/arel";
import type { SqliteBinds, SqliteStatement } from "../../sqlite-adapter.js";
import { TransactionIsolationError } from "../../errors.js";
import { Result } from "../../result.js";
import { stripSqlComments } from "../sql-classification.js";

// Matches Rails' build_read_query_regexp(:pragma) which combines
// DEFAULT_READ_QUERY [:begin, :commit, :explain, :release, :rollback, :savepoint, :select, :with]
// with SQLite3's :pragma addition.
const READ_QUERY =
  /^(?:[(\s]|\/\*[\s\S]*?\*\/)*(?:begin|commit|explain|release|rollback|savepoint|select|with|pragma)\b/i;

type ExecutableAdapter = {
  execute(sql: string, binds?: unknown[]): Promise<unknown>;
  executeMutation(sql: string, binds?: unknown[]): Promise<unknown>;
};

export interface DatabaseStatements {
  execQuery(sql: string, name?: string | null): Promise<Result>;
  execDelete(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execUpdate(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execInsert(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    pk?: string | false | null,
  ): Promise<unknown>;
  explain(sql: string, binds?: unknown[]): Promise<string>;
  lastInsertedId(result: unknown): number;
}

export function isWriteQuery(sql: string): boolean {
  return !READ_QUERY.test(stripSqlComments(sql));
}

export async function beginDbTransaction(adapter: ExecutableAdapter): Promise<void> {
  await adapter.executeMutation("BEGIN IMMEDIATE TRANSACTION");
}

export async function beginDeferredTransaction(
  adapter: ExecutableAdapter,
  _isolation?: string | null,
): Promise<void> {
  await adapter.executeMutation("BEGIN DEFERRED TRANSACTION");
}

export async function beginIsolatedDbTransaction(
  adapter: ExecutableAdapter,
  isolation: string,
): Promise<void> {
  if (isolation !== "read_uncommitted") {
    throw new TransactionIsolationError(
      "SQLite3 only supports the `read_uncommitted` transaction isolation level",
    );
  }
  await adapter.executeMutation("BEGIN DEFERRED TRANSACTION");
}

export async function commitDbTransaction(adapter: ExecutableAdapter): Promise<void> {
  await adapter.executeMutation("COMMIT TRANSACTION");
}

export async function execRollbackDbTransaction(adapter: ExecutableAdapter): Promise<void> {
  await adapter.executeMutation("ROLLBACK TRANSACTION");
}

export function highPrecisionCurrentTimestamp(): string {
  return "STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')";
}

export async function execute(
  adapter: ExecutableAdapter,
  sql: string,
  binds?: unknown[],
): Promise<unknown> {
  return adapter.execute(sql, binds);
}

export async function resetIsolationLevel(
  adapter: ExecutableAdapter,
  previousReadUncommitted: number | null,
): Promise<void> {
  if (previousReadUncommitted !== null) {
    await adapter.executeMutation(`PRAGMA read_uncommitted=${previousReadUncommitted}`);
  }
}

interface InternalBeginTransactionHost {
  executeMutation(sql: string): Promise<unknown>;
  queryValue(sql: string, name?: string): Promise<unknown>;
  isSharedCache?(): boolean;
  _previousReadUncommitted?: unknown;
}

// The state performQuery reads/writes on the adapter. Mirrors the members
// Rails' perform_query touches on the SQLite3Adapter instance: the statement
// pool (via _cachedStatement), @last_affected_rows / last insert rowid, the
// write-query predicate, and the verified!/dirty transaction bookkeeping that
// with_raw_connection performs around the round-trip.
interface PerformQueryHost {
  _cachedStatement(sql: string): Promise<SqliteStatement>;
  isWriteQuery(sql: string): boolean;
  verifiedBang(): void;
  dirtyCurrentTransaction(): void;
  _lastAffectedRows: number;
  _lastInsertRowid: number | bigint;
}

interface ExecuteBatchHost {
  executeMutation(sql: string, binds?: unknown[], name?: string): Promise<unknown>;
}

interface QuoteTableNameHost {
  quoteTableName(tableName: string): string;
}

/** @internal */
export async function internalBeginTransaction(
  this: InternalBeginTransactionHost,
  mode: "deferred" | "immediate",
  isolation?: string | null,
): Promise<void> {
  if (isolation) {
    if (isolation !== "read_uncommitted") {
      throw new TransactionIsolationError(
        "SQLite3 only supports the `read_uncommitted` transaction isolation level",
      );
    }
    if (this.isSharedCache && !this.isSharedCache()) {
      throw new TransactionIsolationError(
        "You need to enable the shared-cache mode in SQLite mode before attempting to change the transaction isolation level",
      );
    }
  }
  await this.executeMutation(`BEGIN ${mode.toUpperCase()} TRANSACTION`);
  if (isolation) {
    this._previousReadUncommitted = await this.queryValue("PRAGMA read_uncommitted");
    await this.executeMutation("PRAGMA read_uncommitted=ON");
  }
}

/**
 * The single SQL primitive: run a statement and return its rows plus the
 * atomic affected-rows / insert-rowid from the same RunResult. Reads take
 * `.all()`; every write (incl. `INSERT … RETURNING`) and transaction-control
 * takes `.run()`.
 *
 * Follows Rails' `perform_query` for the read/affected-rows contract, but
 * DEVIATES on the branch axis and the RETURNING return: Rails branches on
 * `stmt.column_count.zero?`, so `INSERT … RETURNING` (nonzero column count)
 * comes back as `Result.new(columns, to_a)` with `row_count = 1`. Here it
 * takes `.run()` and returns `[]` (`row_count = 0`) — deliberately, so the
 * insert id / count come from the RunResult ATOMICALLY rather than a
 * follow-up `last_insert_rowid()` read that races under concurrent writes.
 * Nothing calls this expecting RETURNING rows: multi-column RETURNING
 * read-back goes through `internalExecQuery` (`.all()`) and single-column
 * through `executeMutation`'s rowid.
 *
 * This is the live primitive `execute` / `executeMutation` delegate to. It is
 * written against the async `SqliteStatement` / `SqliteConnection` driver
 * abstraction (array binds, promise-returning, multi-driver) rather than
 * better-sqlite3's native sync API, so it is reachable from the adapter.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements#perform_query
 * @internal
 */
export async function performQuery(
  this: PerformQueryHost,
  sql: string,
  driverBinds: SqliteBinds,
  notificationPayload: Record<string, unknown>,
): Promise<{
  rows: Record<string, unknown>[];
  affectedRows: number;
  insertRowid: number | bigint;
}> {
  // Rails dirties in with_raw_connection's ensure (abstract_adapter.rb:1046),
  // gated only on materialize_transactions — NOT on read/write, and it runs
  // even when the query raises. execute/executeMutation (the only callers)
  // both materialize unconditionally, so dirty in a finally regardless of
  // outcome, mirroring this adapter's `exec`. `verified!` (below), by
  // contrast, is on Rails' success path only.
  try {
    const stmt = await this._cachedStatement(sql);
    // Dispatch through the virtual isWriteQuery — the same predicate
    // check_if_write_query uses (abstract-adapter.ts) — so the readonly guard
    // and the affected-rows gate can never disagree.
    const isWrite = this.isWriteQuery(sql);
    let rows: Record<string, unknown>[];
    // Default to the tracked counts so a non-write (BEGIN/COMMIT/read) returns
    // the last write's values intact, as sqlite3_changes() does.
    let affectedRows = this._lastAffectedRows;
    let insertRowid = this._lastInsertRowid;
    // Reads take `.all()` (rows); everything else — writes (incl.
    // `INSERT … RETURNING`) and transaction-control — takes `.run()`, whose
    // RunResult carries the affected-row count and insert rowid ATOMICALLY.
    // Sourcing those from `.run()` (not a separate `SELECT changes()`) is
    // essential under concurrency: `Promise.all` inserts interleave at await
    // points, so a follow-up `last_insert_rowid()` read would report another
    // statement's rowid. Gating on `!isWrite` also keeps a `SELECT`, which is
    // reader=true, on the `.all()` path; a write is never misread as a reader
    // because isWriteQuery classifies INSERT/UPDATE/DELETE/DDL as writes.
    if (stmt.reader && !isWrite) {
      rows = (await stmt.all(driverBinds)) as Record<string, unknown>[];
    } else {
      const result = await stmt.run(driverBinds);
      if (isWrite) {
        // DDL takes this branch too and reports changes = 0 — a small
        // deviation from Rails' sqlite3_changes(), which is preserved across
        // DDL; matching it would need a handle read that isn't atomic under
        // concurrency, and no caller reads affected_rows after a DDL (it is
        // consumed right after its DML).
        affectedRows = Number(result.changes ?? 0);
        insertRowid = result.lastInsertRowid;
      }
      rows = [];
    }
    // Persist for the affected_rows() port / public accessor. The RETURNED
    // locals — not these fields — are what executeMutation uses for its return
    // value: reading `this._lastInsertRowid` back after the caller's await
    // would race, since a concurrent write's performQuery can overwrite it
    // between this assignment and that read.
    this._lastAffectedRows = affectedRows;
    this._lastInsertRowid = insertRowid;
    // Rails' perform_query: `verified!` after @last_affected_rows, success
    // path only — a successful round-trip proves the connection is live.
    this.verifiedBang();
    notificationPayload.row_count = rows.length;
    return { rows, affectedRows, insertRowid };
  } finally {
    this.dirtyCurrentTransaction();
  }
}

/** @internal */
export function castResult(result: Result): Result {
  // SQLite3 already returns an ActiveRecord::Result; nothing to cast.
  return result;
}

/** @internal */
export function affectedRows(this: PerformQueryHost, _result: unknown): number {
  return this._lastAffectedRows ?? 0;
}

/** @internal */
export async function executeBatch(
  this: ExecuteBatchHost,
  statements: string[],
  name?: string | null,
): Promise<void> {
  // Match Rails' execute_batch → raw_execute, which skips the query_transformers
  // pass: batch statements carry no QueryLogs comment. Flag the call so
  // preprocessQuery skips the transformer pass (write-checks still run); the flag
  // is consumed synchronously there before any await, so it never spans the await.
  const host = this as ExecuteBatchHost & { _inQueryTransformers?: boolean };
  host._inQueryTransformers = true;
  try {
    const sql = statements.join(";\n");
    await this.executeMutation(sql, [], name ?? "SQL");
  } finally {
    host._inQueryTransformers = false;
  }
}

/** @internal */
export function buildTruncateStatement(this: QuoteTableNameHost | void, tableName: string): string {
  const quoted =
    (this as QuoteTableNameHost | null)?.quoteTableName(tableName) ??
    `"${tableName.replace(/"/g, '""')}"`;
  return `DELETE FROM ${quoted}`;
}

/** @internal */
export function returningColumnValues(result: Result): unknown[] | undefined {
  return result.rows[0] as unknown[] | undefined;
}

/** @internal */
export function defaultInsertValue(column: {
  defaultFunction?: string | null;
  default?: unknown;
}): unknown {
  if (column.defaultFunction) {
    return arelSql(column.defaultFunction);
  }
  return column.default;
}
