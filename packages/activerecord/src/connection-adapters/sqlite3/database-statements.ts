/**
 * SQLite3 database statements — SQLite-specific query execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements
 *
 * In Rails these are instance methods on the DatabaseStatements module
 * mixed into the adapter. Here they're standalone functions that accept
 * an adapter for execution, matching the codebase's mixin pattern.
 */

import { NotImplementedError } from "../../errors.js";
import type { Result } from "../../result.js";
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

function internalBeginTransaction(mode: any, isolation: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements#internal_begin_transaction is not implemented",
  );
}

function performQuery(
  rawConnection: any,
  sql: any,
  binds: any,
  typeCastedBinds: any,
  prepare?: any,
  notificationPayload?: any,
  batch?: any,
): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements#perform_query is not implemented",
  );
}

function castResult(result: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements#cast_result is not implemented",
  );
}

function affectedRows(result: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements#affected_rows is not implemented",
  );
}

function executeBatch(statements: any, name?: any, kwargs?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements#execute_batch is not implemented",
  );
}

function buildTruncateStatement(tableName: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements#build_truncate_statement is not implemented",
  );
}

function returningColumnValues(result: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements#returning_column_values is not implemented",
  );
}

function defaultInsertValue(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements#default_insert_value is not implemented",
  );
}
