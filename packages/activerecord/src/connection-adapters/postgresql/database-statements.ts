/**
 * PostgreSQL database statements — PostgreSQL-specific query execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements
 */

import type pg from "pg";
import type { Type } from "@blazetrails/activemodel";
import type { Nodes } from "@blazetrails/arel";
import type { ExplainOption } from "../abstract/database-statements.js";
import { ActiveSupport } from "@blazetrails/activesupport";
import { PreparedStatementCacheExpired, type SQLWarning } from "../../errors.js";
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
    pk?: string | false | null,
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
interface CastResultHost {
  getOidType(oid: number, fmod: number, columnName: string, sqlType?: string): Promise<Type>;
}

/** @internal */
interface CancelAnyRunningQueryHost {
  _cancelAnyRunningQuery(): void;
}

/**
 * Delegates to the adapter's `_cancelAnyRunningQuery` which sends a
 * CancelRequest before ROLLBACK.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#cancel_any_running_query
 * @internal
 */
export function cancelAnyRunningQuery(this: CancelAnyRunningQueryHost): void {
  this._cancelAnyRunningQuery();
}

/**
 * node-pg's `query()` overloads do not admit `rowMode` on a QueryConfig and
 * widen the return to `Submittable`; this narrows both back.
 */
function query(
  rawConnection: pg.Client,
  config: string | Record<string, unknown>,
): Promise<pg.QueryResult | pg.QueryResult[]> {
  return (
    rawConnection.query as unknown as (
      c: string | Record<string, unknown>,
    ) => Promise<pg.QueryResult | pg.QueryResult[]>
  )(config);
}

/** @internal */
export interface PerformQueryHost extends HandleWarningsHost {
  updateTypemapForDefaultTimezone(): Promise<void>;
  prepareStatement(sql: string, binds: unknown[], rawConnection: pg.Client): Promise<string>;
  isCachedPlanFailure(pgerror: unknown): boolean;
  openTransactions: number;
  sqlKey(sql: string): string;
  /** Rails' `@statements` (abstract_adapter.rb:156). */
  _statements: { delete(key: string): unknown };
  verifiedBang(): void;
  /** @internal */
  handleWarnings(sql: unknown): void;
  _commandSettled: boolean;
}

/**
 * The single SQL primitive: run a statement on `rawConnection` and hand back
 * the driver result. `execute` / `executeMutation` / `internalExecQuery` /
 * `internalExecute` all funnel through it, as Rails' `raw_execute` does.
 *
 * `rowMode` has no Rails counterpart: a `PG::Result` exposes both the hash and
 * the positional view of every row, so Rails picks one after the fact, while
 * node-pg has to be told which shape to decode into before the query runs.
 * It only selects the decoding of the same result, never which arm runs.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#perform_query
 * (postgresql/database_statements.rb:135-168)
 *
 * @internal
 */
export async function performQuery<R extends pg.QueryResult = pg.QueryResult>(
  this: PerformQueryHost,
  rawConnection: pg.Client,
  sql: string,
  binds: unknown[],
  typeCastedBinds: unknown[],
  {
    prepare,
    notificationPayload,
    rowMode,
  }: {
    prepare: boolean;
    notificationPayload: Record<string, unknown>;
    rowMode?: "array";
  },
): Promise<R> {
  await this.updateTypemapForDefaultTimezone();
  let raw: pg.QueryResult | pg.QueryResult[];
  if (prepare) {
    // Rails' `retry` inside the `PG::FeatureNotSupported` rescue
    // (database_statements.rb:138-158); node-pg raises no typed error class, so
    // `is_cached_plan_failure?` — which is the whole of Rails' recovery gate —
    // is checked against every error the arm can raise.
    for (;;) {
      try {
        const stmtKey = await this.prepareStatement(sql, binds, rawConnection);
        notificationPayload.statement_name = stmtKey;
        this._commandSettled = false;
        raw = await query(rawConnection, {
          name: stmtKey,
          text: sql,
          values: typeCastedBinds,
          rowMode,
        });
        break;
      } catch (error) {
        if (this.isCachedPlanFailure(error)) {
          // Nothing we can do if we are in a transaction because all commands
          // will raise InFailedSQLTransaction
          // `in_transaction?` is `open_transactions > 0`
          // (postgresql_adapter.rb:908-910), so an open *lazy* (un-materialized)
          // frame still counts — a read-only block (`transaction { record.reload }`)
          // never emits a physical `BEGIN` because reads don't materialize.
          if (this.openTransactions > 0) {
            throw new PreparedStatementCacheExpired(
              (error as { message?: string })?.message ?? "cached plan expired",
              { sql, binds, cause: error },
            );
          } else {
            // outside of transactions we can simply flush this query and retry
            await this._statements.delete(this.sqlKey(sql));
            continue;
          }
        }
        throw error;
      }
    }
  } else if (binds == null || binds.length === 0) {
    this._commandSettled = false;
    // `async_exec` on a PG::Result carries both row views; node-pg needs the
    // config form to be told which one, so a caller that asked for positional
    // rows gets it here too. Without one this stays the bare simple-query call.
    raw = await query(rawConnection, rowMode ? { text: sql, rowMode } : sql);
  } else {
    this._commandSettled = false;
    raw = await query(rawConnection, { text: sql, values: typeCastedBinds, rowMode });
  }

  // A multi-statement string (e.g. disable_referential_integrity's joined
  // ALTERs) runs under the simple-query protocol, where node-pg returns one
  // Result per statement, while libpq hands Rails only the last one. Surface
  // the same one Rails sees.
  const result = (Array.isArray(raw) ? raw[raw.length - 1] : raw) as R;
  this.verifiedBang();
  this.handleWarnings(result);
  notificationPayload.row_count = result?.rows?.length ?? 0;
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
    const type = await this.getOidType(f.dataTypeID, f.dataTypeModifier ?? -1, f.name);
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
 *
 * Rails joins statements and calls execute once; we iterate because node-postgres returns
 * an array of results for multi-statement queries and our execute() expects a single result.
 * @internal
 */
export async function executeBatch(
  this: ExecuteBatchHost,
  statements: string[],
  name: string | null = null,
): Promise<void> {
  // Match Rails' execute_batch → raw_execute, which skips the query_transformers
  // pass: batch statements carry no QueryLogs comment. Flag each statement so
  // preprocessQuery skips the transformer pass (write-checks still run); the flag
  // is consumed synchronously there before any await, so it never spans the await,
  // and the finally clears it if execute throws before consuming it.
  const host = this as ExecuteBatchHost & { _inQueryTransformers?: boolean };
  for (const statement of statements) {
    host._inQueryTransformers = true;
    try {
      await this.execute(statement, [], name ?? undefined);
    } finally {
      host._inQueryTransformers = false;
    }
  }
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
  return [
    `TRUNCATE TABLE ${tableNames.map((tableName) => this.quoteTableName(tableName)).join(", ")}`,
  ];
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
type SqlWarning = SQLWarning;

/** Mirrors the values `ActiveRecord.db_warnings_action` accepts. */
type DbWarningsAction = "ignore" | "log" | "raise" | "report" | ((warning: SqlWarning) => void);

/** @internal */
interface HandleWarningsHost {
  _noticeReceiverSqlWarnings?: SqlWarning[];
  // The base adapter's matcher signature (abstract_adapter.rb:1227), which
  // PostgreSQL's own `warning_ignored?` override widens with the level check.
  /** @internal */
  isWarningIgnored(warning: { message?: string; code?: string | number }): boolean;
  logger?: unknown;
}

/**
 * Iterates notice-receiver warnings accumulated during the query, attaches the
 * result object (Rails names the parameter `sql` but `perform_query` passes the
 * PG::Result, database_statements.rb:166), and dispatches each surviving
 * warning to the configured `db_warnings_action`.
 *
 * Rails' `ActiveRecord.db_warnings_action=` turns the symbol into a Proc once,
 * at config time (active_record.rb:236-252), and `handle_warnings` only
 * `.call`s it. trails stores the symbol itself on the adapter class, so the
 * symbol → behavior mapping lives here, at the one place that calls it.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#handle_warnings
 * @internal
 */
export function handleWarnings(this: HandleWarningsHost, sql: unknown): void {
  const action = (this.constructor as { dbWarningsAction?: DbWarningsAction }).dbWarningsAction;
  for (const warning of this._noticeReceiverSqlWarnings ?? []) {
    if (this.isWarningIgnored(warning as unknown as { message?: string })) continue;
    warning.sql = sql;
    if (!action || action === "ignore") continue;
    if (action === "raise") throw warning;
    if (action === "log") {
      const codeSuffix = warning.code ? ` (${warning.code})` : "";
      const message = `[ActiveRecord::SQLWarning] ${warning.message}${codeSuffix}`;
      const logger = this.logger as { warn?: (msg: string) => void } | null | undefined;
      if (logger?.warn) logger.warn(message);
      else console.warn(message);
    }
    // Mirrors Rails' `:report` → `Rails.error.report(warning, handled: true)`
    // (active_record.rb:248-249).
    if (action === "report") ActiveSupport.errorReporter.report(warning, { handled: true });
    // Rails' `ActiveRecord.db_warnings_action.call(warning)` — the symbol arms
    // above are the behaviors its setter bakes into that Proc, and a
    // user-supplied callable is invoked here exactly as Rails invokes it. JS
    // `Function#call` takes the receiver first, so the adapter fills the slot
    // Ruby's `Proc#call` has no argument for.
    if (typeof action === "function") action.call(this, warning);
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
