/**
 * PostgreSQL database statements — PostgreSQL-specific query execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements
 */

import type pg from "pg";
import { PreparedStatementCacheExpired } from "../../errors.js";
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
interface CancelAnyRunningQueryHost {
  _cancelAnyRunningQuery(): void;
}

/**
 * Delegates to the adapter's `_cancelAnyRunningQuery` which uses node-pg's
 * internal `client.cancel()` to send a CancelRequest before ROLLBACK.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#cancel_any_running_query
 * @internal
 */
export function cancelAnyRunningQuery(this: CancelAnyRunningQueryHost): void {
  this._cancelAnyRunningQuery();
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

  if (prepare && this.prepareStatement) {
    // prepareStatement issues SQL PREPARE on the server. Omitting `text` here sends
    // Bind+Execute only — passing it would re-PARSE under the same name, which the
    // server rejects. @types/pg requires text but node-pg accepts {name,values} at runtime.
    const stmtKey = await this.prepareStatement(sql, binds, rawConnection);
    if (notificationPayload) notificationPayload["statement_name"] = stmtKey;
    const execPrepared = (name: string) =>
      rawConnection.query({
        name,
        values: typeCastedBinds as unknown[],
        rowMode: "array",
      } as unknown as pg.QueryConfig);
    try {
      result = await execPrepared(stmtKey);
    } catch (err) {
      if (this.isCachedPlanFailure?.(err)) {
        if (this.inTransaction) {
          throw new PreparedStatementCacheExpired((err as Error).message);
        }
        // Flush the cache entry; prepareStatement allocates a fresh name and re-PREPAREs.
        this.deleteStatementKey?.(sql);
        result = await execPrepared(await this.prepareStatement(sql, binds, rawConnection));
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
    // Rails sets types[fname] = types[i] unconditionally; we guard against a column
    // named "1" colliding with integer index 1 in a plain JS object key space.
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
interface ExecuteBatchHost {
  execute(sql: string, binds?: unknown[], name?: string | null): Promise<unknown>;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#execute_batch
 * @internal
 */
export async function executeBatch(
  this: ExecuteBatchHost,
  statements: string[],
  name: string | null = null,
): Promise<unknown> {
  return this.execute(statements.join("; "), [], name ?? undefined);
}

/** @internal */
interface BuildTruncateStatementsHost {
  quoteTableName(name: string): string;
}

/**
 * Rails combines all table names into a single TRUNCATE statement.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#build_truncate_statements
 * @internal
 */
export function buildTruncateStatements(
  this: BuildTruncateStatementsHost,
  tableNames: string[],
): string[] {
  return [`TRUNCATE TABLE ${tableNames.map((t) => this.quoteTableName(t)).join(", ")}`];
}

/** @internal */
interface LastInsertIdResultHost {
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  quote(value: unknown): string;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#last_insert_id_result
 * @internal
 */
export async function lastInsertIdResult(
  this: LastInsertIdResultHost,
  sequenceName: string,
): Promise<Result> {
  return this.execQuery(`SELECT currval(${this.quote(sequenceName)})`, "SQL");
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#returning_column_values
 * @internal
 */
export function returningColumnValues(result: Result): unknown[] | undefined {
  return result.rows[0];
}

/**
 * Returns pk unless it is composite (array), in which case returns undefined.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#suppress_composite_primary_key
 * @internal
 */
export function suppressCompositePrimaryKey(pk: string | string[] | undefined): string | undefined {
  return Array.isArray(pk) ? undefined : pk;
}

// Levels that Rails treats as actionable (not ignored). Anything outside
// this set (e.g. NOTICE, DEBUG) is silently dropped.
const ACTIONABLE_LEVELS = new Set(["WARNING", "ERROR", "FATAL", "PANIC"]);

/** @internal */
type SqlWarning = {
  level?: string;
  message?: string;
  code?: string | number;
  sql?: unknown;
  [k: string]: unknown;
};

/** @internal */
interface HandleWarningsHost {
  _noticeReceiverSqlWarnings?: SqlWarning[];
  // Used to call the abstract adapter's pattern-matcher without risking
  // recursion if this module's isWarningIgnored is later bound to the class.
  _abstractIsWarningIgnored?(warning: SqlWarning): boolean;
}

/**
 * Iterates notice-receiver warnings accumulated during the query and attaches
 * the result object (mirrors Rails attaching the PG::Result).
 *
 * Rails also calls `ActiveRecord.db_warnings_action.call(warning)` here.
 * That global hook is not yet wired in TS; warnings are collected and filtered
 * but not dispatched to a user-configured action. Tracked as a follow-up.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#handle_warnings
 * @internal
 */
export function handleWarnings(this: HandleWarningsHost, result: pg.QueryResult): void {
  if (!this._noticeReceiverSqlWarnings?.length) return;
  for (const warning of this._noticeReceiverSqlWarnings) {
    if (isWarningIgnored.call(this, warning)) continue;
    warning.sql = result;
    // TODO: dispatch to ActiveRecord.db_warnings_action equivalent once wired
  }
}

/** @internal */
interface IsWarningIgnoredHost {
  _abstractIsWarningIgnored?(warning: SqlWarning): boolean;
}

/**
 * A warning is ignored if its level is below the actionable threshold (not in
 * WARNING/ERROR/FATAL/PANIC) OR if the base adapter's pattern matchers
 * (db_warnings_ignore) say to ignore it.
 *
 * Uses `_abstractIsWarningIgnored` (set to `AbstractAdapter.prototype.isWarningIgnored`)
 * for the `|| super` delegation, avoiding self-recursion if this function is ever
 * assigned to the class as `isWarningIgnored`.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#warning_ignored?
 * @internal
 */
export function isWarningIgnored(this: IsWarningIgnoredHost | void, warning: SqlWarning): boolean {
  const belowThreshold = !ACTIONABLE_LEVELS.has(warning.level ?? "");
  return belowThreshold || (this?._abstractIsWarningIgnored?.(warning) ?? false);
}
