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

  // rowMode:"array" → rows as positional unknown[][] matching libpq/PG::Result#values.
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
  // result.count in libpq = number of tuples; node-pg exposes this as result.rows.length.
  if (notificationPayload) notificationPayload["row_count"] = result.rows.length;

  return result;
}

/**
 * async unlike Rails because getOidType may issue a pg_type lookup for unknown OIDs.
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
    // Guard vs numeric-string column names colliding with integer index keys.
    if (!/^\d+$/.test(f.name)) columnTypes[f.name] = type;
  }

  const rows = (result.rows ?? []) as unknown[][];
  return new Result(columnNames, rows, columnTypes as Record<string, Type>);
}

/**
 * Rails calls `result.cmd_tuples` then `result.clear`. rowCount is node-pg's
 * cmd_tuples equivalent; no .clear() is needed (JS GC handles it).
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
