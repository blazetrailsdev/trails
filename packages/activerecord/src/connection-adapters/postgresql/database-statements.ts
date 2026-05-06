/**
 * PostgreSQL database statements — PostgreSQL-specific query execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements
 */

import pg from "pg";
import { NotImplementedError, PreparedStatementCacheExpired } from "../../errors.js";
import type { Type } from "@blazetrails/activemodel";
import type { Nodes } from "@blazetrails/arel";
import type { ExplainOption } from "../../adapter.js";
import { Result } from "../../result.js";

// Mirrors: PostgreSQL::DatabaseStatements::READ_QUERY (database_statements.rb:19-21)
// Mirrors Rails' build_read_query_regexp which combines the default read list
// (begin, commit, explain, release, rollback, savepoint, select) with
// the PG-specific additions (close, declare, fetch, move, set, show).
// Matches Rails exactly: `with` is included in the read list.
// Rails does not perform deep CTE analysis — data-modifying CTEs starting
// with WITH are treated as read-only, the same as pure-read CTEs. This
// mirrors DEFAULT_READ_QUERY + PG additions from build_read_query_regexp.
// Leading whitespace, block/line comments, and opening parentheses are
// allowed before the keyword in any order.
export const READ_QUERY =
  /^(?:\s|\/\*.*?\*\/|--[^\n]*(?:\n|$)|\()*(?:begin|close|commit|declare|explain|fetch|move|release|rollback|savepoint|select|set|show|with)\b/is;

export interface DatabaseStatements {
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  execDelete(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execUpdate(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execInsert(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    pk?: string,
    sequenceName?: string,
  ): Promise<unknown>;
  // Mirrors: database_statements.rb:7
  explain(
    sql: string,
    binds?: unknown[],
    options?: {
      analyze?: boolean;
      verbose?: boolean;
      costs?: boolean;
      buffers?: boolean;
      format?: string;
    },
  ): Promise<string>;
  // Mirrors: database_statements.rb:14
  query(sql: string, name?: string | null): Promise<unknown[][]>;
  executeAndClear(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown>;
  // Mirrors: database_statements.rb:24
  isWriteQuery(sql: string): boolean;
  // Mirrors: database_statements.rb:39
  execute(sql: string, binds?: unknown[], name?: string | null): Promise<unknown[]>;
  // Mirrors: database_statements.rb:64
  beginDbTransaction(): Promise<void>;
  // Mirrors: database_statements.rb:68
  beginIsolatedDbTransaction(isolation: string): Promise<void>;
  // Mirrors: database_statements.rb:73
  commitDbTransaction(): Promise<void>;
  // Mirrors: database_statements.rb:78
  execRollbackDbTransaction(): Promise<void>;
  // Mirrors: database_statements.rb:83
  execRestartDbTransaction(): Promise<void>;
  // Mirrors: database_statements.rb:92
  highPrecisionCurrentTimestamp(): Nodes.SqlLiteral;
  // Mirrors: database_statements.rb:96
  buildExplainClause(options?: ExplainOption[]): string;
  // Mirrors: database_statements.rb:110
  setConstraints(deferred: "deferred" | "immediate", ...constraints: string[]): Promise<void>;
}

/** @internal */
interface PerformQueryHost {
  preparedStatements?: boolean;
  prepareStatement?(sql: string, binds: unknown[], client: pg.PoolClient): Promise<string>;
  isCachedPlanFailure?(err: unknown): boolean;
  /** Flush the cached statement key so the next prepare picks a fresh name. */
  deleteStatementKey?(sql: string): void;
  inTransaction?: boolean;
  /** @internal */
  handleWarnings?(result: pg.QueryResult): void;
  verified?(): void;
  updateTypemapForDefaultTimezone?(): Promise<void>;
}

/** @internal */
interface CastResultHost {
  getOidType(oid: number, fmod: number, columnName: string, sqlType?: string): Promise<Type>;
}

/** @internal */
function cancelAnyRunningQuery(): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#cancel_any_running_query is not implemented",
  );
}

/**
 * Execute `sql` against the raw `pg.PoolClient` and return the raw PG result.
 *
 * Three execution paths mirror Rails exactly:
 * 1. `prepare: true` → prepare a named statement via `this.prepareStatement`,
 *    then call `client.query({ name, text: sql, values: typeCastedBinds })`.
 *    On `PG::FeatureNotSupported` (cached-plan failure), flush the cached key
 *    and retry (if not in a transaction).
 * 2. No binds → `client.query(sql)` (`async_exec` equivalent).
 * 3. Binds present → `client.query(sql, typeCastedBinds)` (`exec_params`).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#perform_query
 * @internal
 */
export async function performQuery(
  this: PerformQueryHost,
  rawConnection: pg.PoolClient,
  sql: string,
  binds: unknown[],
  typeCastedBinds: unknown[],
  options: {
    prepare?: boolean;
    notificationPayload?: Record<string, unknown>;
    batch?: boolean;
  } = {},
): Promise<pg.QueryResult> {
  const { prepare = false, notificationPayload } = options;

  await this.updateTypemapForDefaultTimezone?.();

  let result: pg.QueryResult;

  // rowMode: "array" makes node-pg return rows as positional unknown[][] instead
  // of the default Record<string,unknown>[] — matching libpq's wire format that
  // the Ruby PG gem exposes as PG::Result#values. castResult expects arrays.
  if (prepare && this.prepareStatement) {
    const stmtKey = await this.prepareStatement(sql, binds, rawConnection);
    if (notificationPayload) notificationPayload["statement_name"] = stmtKey;
    try {
      result = await rawConnection.query({
        name: stmtKey,
        text: sql,
        values: typeCastedBinds as unknown[],
        rowMode: "array",
      });
    } catch (err) {
      if (this.isCachedPlanFailure?.(err)) {
        if (this.inTransaction) {
          // Inside a transaction all subsequent commands raise InFailedSQLTransaction;
          // wrap as PreparedStatementCacheExpired so callers can handle appropriately.
          throw new PreparedStatementCacheExpired((err as Error).message);
        }
        // Outside a transaction: flush the cached plan and retry once.
        this.deleteStatementKey?.(sql);
        result = await rawConnection.query({
          name: stmtKey,
          text: sql,
          values: typeCastedBinds as unknown[],
          rowMode: "array",
        });
      } else {
        throw err;
      }
    }
  } else if (binds == null || binds.length === 0) {
    result = await rawConnection.query({ text: sql, rowMode: "array" });
  } else {
    result = await rawConnection.query({
      text: sql,
      values: typeCastedBinds as unknown[],
      rowMode: "array",
    });
  }

  this.verified?.();
  this.handleWarnings?.(result);
  // Rails: notification_payload[:row_count] = result.count
  // result.count on PG::Result = number of tuples in the result set.
  // node-pg: result.rows.length for SELECT; result.rowCount for DML (null for SELECT).
  if (notificationPayload) notificationPayload["row_count"] = result.rows.length;

  return result;
}

/**
 * Convert a raw `pg.QueryResult` to an `ActiveRecord::Result`, resolving OID
 * types for each column via `this.getOidType`. Returns an empty Result for
 * results with no fields (DDL, DML with no RETURNING).
 *
 * `castResult` is `async` in TS (unlike Rails which is synchronous) because
 * `getOidType` may need to issue a pg_type lookup for unknown OIDs.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#cast_result
 * @internal
 */
export async function castResult(this: CastResultHost, result: pg.QueryResult): Promise<Result> {
  const fields = result.fields ?? [];
  if (fields.length === 0) {
    return Result.empty();
  }

  const columnNames = fields.map((f) => f.name);
  const columnTypes: Record<string | number, Type> = {};
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const type = await this.getOidType(f.dataTypeID, f.dataTypeModifier ?? -1, f.name, "");
    columnTypes[i] = type;
    // Rails: types[fname] = types[i] = … (both always set).
    // Guard: skip name-keyed entry when fname is a pure digit string — that
    // would collide with the numeric index key in a plain JS object.
    if (!/^\d+$/.test(f.name)) columnTypes[f.name] = type;
  }

  // result.rows is unknown[][] because performQuery sets rowMode: "array",
  // matching Rails' PG::Result#values (positional arrays from libpq).
  const rows = (result.rows ?? []) as unknown[][];
  return new Result(columnNames, rows, columnTypes as Record<string, Type>);
}

/**
 * Return the number of rows affected by the last DML statement (`cmd_tuples`
 * in libpq). Clears the result to free server-side memory.
 *
 * In node-pg, `pg.QueryResult#rowCount` is the JS equivalent of libpq's
 * `PQcmdTuples`. Unlike the Ruby PG gem, node-pg results are JS objects and
 * are garbage-collected without an explicit `clear` call, so no `.clear()`
 * equivalent is needed.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#affected_rows
 * @internal
 */
export function affectedRows(result: pg.QueryResult): number {
  return result.rowCount ?? 0;
}

/** @internal */
function executeBatch(statements: any, name?: any, kwargs?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#execute_batch is not implemented",
  );
}

/** @internal */
function buildTruncateStatements(tableNames: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#build_truncate_statements is not implemented",
  );
}

/** @internal */
function lastInsertIdResult(sequenceName: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#last_insert_id_result is not implemented",
  );
}

/** @internal */
function returningColumnValues(result: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#returning_column_values is not implemented",
  );
}

/** @internal */
function suppressCompositePrimaryKey(pk: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#suppress_composite_primary_key is not implemented",
  );
}

/** @internal */
function handleWarnings(sql: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#handle_warnings is not implemented",
  );
}

/** @internal */
function isWarningIgnored(warning: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#warning_ignored? is not implemented",
  );
}
