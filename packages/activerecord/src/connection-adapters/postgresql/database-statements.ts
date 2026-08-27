import type pg from "pg";
import type { Type } from "@blazetrails/activemodel";
import type { Nodes } from "@blazetrails/arel";
import { ActiveRecord } from "../../ar-config.js";
import { PreparedStatementCacheExpired, type SQLWarning } from "../../errors.js";
import { Result } from "../../result.js";
import { combineMultiStatements, type ExplainOption } from "../abstract/database-statements.js";
import { isEmpty } from "@blazetrails/activesupport/ruby-empty";
import type { StatementPool } from "../statement-pool.js";

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
  query(sql: string, name?: string | null): Promise<unknown[][]>;
  executeAndClear(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown>;
  isWriteQuery(sql: string): boolean;
  execute(sql: string, binds?: unknown[], name?: string | null): Promise<unknown[]>;
  beginDbTransaction(): Promise<void>;
  beginIsolatedDbTransaction(isolation: string): Promise<void>;
  commitDbTransaction(): Promise<void>;
  execRollbackDbTransaction(): Promise<void>;
  execRestartDbTransaction(): Promise<void>;
  highPrecisionCurrentTimestamp(): Nodes.SqlLiteral;
  buildExplainClause(options?: ExplainOption[]): string;
  setConstraints(deferred: "deferred" | "immediate", ...constraints: string[]): Promise<void>;
}

/** @internal */
interface CastResultHost {
  getOidType(oid: number, fmod: number, columnName: string, sqlType?: string): Promise<Type>;
}

/** @internal */
interface CancelAnyRunningQueryHost {
  /** @internal */
  _cancelAnyRunningQuery(): void;
}

/** @internal */
export function cancelAnyRunningQuery(this: CancelAnyRunningQueryHost): void {
  this._cancelAnyRunningQuery();
}

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
  inTransaction: boolean;
  sqlKey(sql: string): string;
  _statements: StatementPool;
  verifiedBang(): void;
  /** @internal */
  handleWarnings(sql: unknown): void;
  _commandSettled: boolean;
}

/** @internal */
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
          if (this.inTransaction) {
            throw new PreparedStatementCacheExpired(
              (error as { message?: string })?.message ?? "cached plan expired",
              { sql, binds, cause: error },
            );
          } else {
            await this._statements.delete(this.sqlKey(sql));
            continue;
          }
        }
        throw error;
      }
    }
  } else if (binds == null || binds.length === 0) {
    this._commandSettled = false;
    raw = await query(rawConnection, rowMode ? { text: sql, rowMode } : sql);
  } else {
    this._commandSettled = false;
    raw = await query(rawConnection, { text: sql, values: typeCastedBinds, rowMode });
  }

  const result = (Array.isArray(raw) ? raw[raw.length - 1] : raw) as R;
  this.verifiedBang();
  this.handleWarnings(result);
  notificationPayload.row_count = result?.rows?.length ?? 0;
  return result;
}

/** @internal */
export async function castResult(this: CastResultHost, result: pg.QueryResult): Promise<Result> {
  const fields = result.fields ?? [];
  if (isEmpty(fields)) {
    return Result.empty();
  }

  const columnNames = fields.map((f) => f.name);
  const columnTypes: Record<string | number, Type> = {};
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const type = await this.getOidType(f.dataTypeID, f.dataTypeModifier ?? -1, f.name);
    columnTypes[i] = type;
    if (!/^\d+$/.test(f.name)) columnTypes[f.name] = type;
  }

  const rows = (result.rows ?? []) as unknown[][];
  return new Result(columnNames, rows, columnTypes as Record<string, Type>);
}

/** @internal */
export function affectedRows(result: pg.QueryResult): number {
  return result.rowCount ?? 0;
}

/** @internal */
interface ExecuteBatchHost {
  rawExecute(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    prepare?: boolean,
    async?: boolean,
    allowRetry?: boolean,
    materializeTransactions?: boolean,
    batch?: boolean,
  ): Promise<unknown>;
}

/** @internal */
export async function executeBatch(
  this: ExecuteBatchHost,
  statements: string[],
  name: string | null = null,
  {
    allowRetry = false,
    materializeTransactions = true,
  }: { allowRetry?: boolean; materializeTransactions?: boolean } = {},
): Promise<void> {
  await this.rawExecute(
    combineMultiStatements(statements),
    name,
    [],
    false,
    false,
    allowRetry,
    materializeTransactions,
    true,
  );
}

/** @internal */
interface BuildTruncateStatementsHost {
  quoteTableName(name: string): string;
}

/** @internal */
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
  internalExecQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  quote(value: unknown): string;
}

/** @internal */
export async function lastInsertIdResult(
  this: LastInsertIdResultHost,
  sequenceName: string,
): Promise<Result> {
  return this.internalExecQuery(`SELECT currval(${this.quote(sequenceName)})`, "SQL");
}

/**
 * @missingRailsCall first — PERMANENT
 * @internal
 */
export function returningColumnValues(result: Result): unknown[] | undefined {
  return result.rows[0];
}

/** @internal */
export function suppressCompositePrimaryKey(pk: string | string[] | undefined): string | undefined {
  return Array.isArray(pk) ? undefined : pk;
}

const ACTIONABLE_LEVELS = new Set(["WARNING", "ERROR", "FATAL", "PANIC"]);

/** @internal */
type SqlWarning = SQLWarning;

/** @internal */
interface HandleWarningsHost {
  _noticeReceiverSqlWarnings?: SqlWarning[];
  /** @internal */
  isWarningIgnored(warning: { message?: string; code?: string | number }): boolean;
}

/** @internal */
export function handleWarnings(this: HandleWarningsHost, sql: unknown): void {
  for (const warning of this._noticeReceiverSqlWarnings ?? []) {
    if (this.isWarningIgnored(warning as unknown as { message?: string })) continue;

    warning.sql = sql;
    ActiveRecord.dbWarningsAction!.call(this, warning as unknown as SQLWarning);
  }
}

/** @internal */
interface IsWarningIgnoredHost {
  _abstractIsWarningIgnored?(warning: SqlWarning): boolean;
}

/** @internal */
export function isWarningIgnored(this: IsWarningIgnoredHost | void, warning: SqlWarning): boolean {
  const belowThreshold = !ACTIONABLE_LEVELS.has(warning.level ?? "");
  return belowThreshold || (this?._abstractIsWarningIgnored?.(warning) ?? false);
}
