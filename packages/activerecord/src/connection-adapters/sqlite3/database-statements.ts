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
  execInsert(sql: string, name?: string | null, binds?: unknown[], pk?: string): Promise<unknown>;
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
    throw new Error("SQLite3 only supports the `read_uncommitted` transaction isolation level");
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

// Minimal better-sqlite3 types used by the private helpers below.
interface Sqlite3RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

interface Sqlite3PreparedStatement {
  readonly reader: boolean;
  columns(): Array<{ name: string }>;
  all(...params: unknown[]): Record<string, unknown>[];
  run(...params: unknown[]): Sqlite3RunResult;
}

interface Sqlite3RawConnection {
  prepare(sql: string): Sqlite3PreparedStatement;
  exec(sql: string): void;
}

interface InternalBeginTransactionHost {
  executeMutation(sql: string): Promise<unknown>;
  queryValue(sql: string, name?: string): Promise<unknown>;
  isSharedCache?(): boolean;
  _previousReadUncommitted?: unknown;
}

interface PerformQueryHost {
  _statements?: Map<string, Sqlite3PreparedStatement>;
  _lastAffectedRows?: number;
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

/** @internal */
export function performQuery(
  this: PerformQueryHost,
  rawConnection: Sqlite3RawConnection,
  sql: string,
  binds: unknown[],
  typeCastedBinds: unknown[],
  options: {
    prepare?: boolean;
    notificationPayload?: Record<string, unknown>;
    batch?: boolean;
  } = {},
): Result {
  const { prepare = false, notificationPayload, batch = false } = options;
  let result: Result;

  let lastChanges = 0;

  if (batch) {
    rawConnection.exec(sql);
    result = Result.empty();
  } else if (prepare) {
    if (!this._statements) this._statements = new Map();
    let stmt = this._statements.get(sql);
    if (!stmt) {
      stmt = rawConnection.prepare(sql);
      this._statements.set(sql, stmt);
    }
    if (!stmt.reader) {
      lastChanges = stmt.run(...typeCastedBinds).changes;
      result = Result.empty();
    } else {
      result = Result.fromRowHashes(stmt.all(...typeCastedBinds));
    }
  } else {
    const stmt = rawConnection.prepare(sql);
    const hasBind = binds != null && binds.length > 0;
    if (!stmt.reader) {
      lastChanges = (hasBind ? stmt.run(...typeCastedBinds) : stmt.run()).changes;
      result = Result.empty();
    } else {
      result = Result.fromRowHashes(hasBind ? stmt.all(...typeCastedBinds) : stmt.all());
    }
  }

  this._lastAffectedRows = lastChanges;
  if (notificationPayload) notificationPayload["row_count"] = result.length;
  return result;
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
  const sql = statements.join(";\n");
  await this.executeMutation(sql, [], name ?? "SQL");
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
