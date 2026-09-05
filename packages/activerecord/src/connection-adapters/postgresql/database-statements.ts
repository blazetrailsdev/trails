import type pg from "pg";
import { ArgumentError, type ValueType } from "@blazetrails/activemodel";
import { sql as arelSql, type Nodes } from "@blazetrails/arel";
import { ActiveRecord } from "../../ar-config.js";
import { PreparedStatementCacheExpired, type SQLWarning } from "../../errors.js";
import { Result } from "../../result.js";
import {
  DatabaseStatements,
  combineMultiStatements,
  extractTableRefFromInsertSql,
  transactionIsolationLevels,
  type ExplainOption,
} from "../abstract/database-statements.js";
import { ExplainPrettyPrinter } from "./explain-pretty-printer.js";
import { fetch, isEmpty } from "@blazetrails/ruby-compat";
import type { StatementPool } from "../statement-pool.js";

export const READ_QUERY =
  /^(?:\s|\/\*.*?\*\/|--[^\n]*(?:\n|$)|\()*(?:begin|close|commit|declare|explain|fetch|move|release|rollback|savepoint|select|set|show|with)\b/is;

/** @internal */
interface CastResultHost {
  getOidType(oid: number, fmod: number, columnName: string, sqlType?: string): ValueType;
  /** @internal */
  loadAdditionalTypes(oids?: number[]): Promise<void>;
  typeMap: { isKey(oid: number): boolean };
}

/** @internal */
interface ExplainHost {
  buildExplainClause(options?: ExplainOption[]): Promise<string>;
  toSql(arel: unknown, binds?: unknown[]): string;
  internalExecQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
}

export async function explain(
  this: ExplainHost,
  arel: string,
  binds: unknown[] = [],
  options: ExplainOption[] = [],
): Promise<string> {
  const explainSql = (await this.buildExplainClause(options)) + " " + this.toSql(arel, binds);
  const result = await this.internalExecQuery(explainSql, "EXPLAIN", binds);
  const printer = new ExplainPrettyPrinter();
  return printer.pp(result);
}

export function isWriteQuery(sql: string): boolean {
  return !READ_QUERY.test(sql);
}

/** @internal */
interface ExecuteHost extends PerformQueryHost {
  preprocessQuery(sql: string): string;
  log<T>(
    sql: string,
    name: string | null,
    binds: unknown[],
    typeCastedBinds: unknown[],
    async: boolean,
    block: (payload: Record<string, unknown>) => Promise<T>,
  ): Promise<T>;
  withRawConnection<T>(
    options: { allowRetry?: boolean; materializeTransactions?: boolean },
    block: (raw: unknown) => Promise<T> | T,
  ): Promise<T>;
  /** @internal */
  _performQuery: typeof performQuery;
  /** @internal */
  translateExceptionClass(nativeError: unknown, sql: unknown, binds: unknown): unknown;
}

export async function execute(
  this: ExecuteHost,
  sql: string,
  name: string | null = "SQL",
  { allowRetry = false }: { allowRetry?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  sql = this.preprocessQuery(sql);
  try {
    return await this.log(sql, name, [], [], false, async (payload) => {
      try {
        return await this.withRawConnection({ allowRetry }, async (conn) => {
          const client = conn as pg.Client;
          const result = await this._performQuery(client, sql, [], [], {
            prepare: false,
            notificationPayload: payload,
          });
          return result?.rows ?? [];
        });
      } catch (e) {
        const translated = this.translateExceptionClass(e, sql, []) as Error;
        throw translated;
      }
    });
  } finally {
    this._noticeReceiverSqlWarnings = [];
  }
}

/** @internal */
interface ExecInsertHost extends LastInsertIdResultHost {
  isUseInsertReturning(): boolean;
  lock: { synchronize<T>(block: () => Promise<T>): Promise<T> };
  primaryKey(tableName: string): unknown;
  defaultSequenceName(tableRef: string, pk: string): Promise<string | null> | string | null;
  /** @internal */
  lastInsertIdResult(sequenceName: string): Promise<Result>;
}

export async function execInsert(
  this: ExecInsertHost,
  sql: string,
  name: string | null = null,
  binds: unknown[] = [],
  pk?: string | false | null,
  sequenceName?: string | null,
  returning?: string[] | null,
): Promise<Result> {
  if (this.isUseInsertReturning() || pk === false) {
    return DatabaseStatements.execInsert.call(
      this as never,
      sql,
      name,
      binds,
      pk,
      sequenceName,
      returning,
    );
  }
  return this.lock.synchronize(async () => {
    const result = await this.internalExecQuery(sql, name, binds);
    if (!sequenceName) {
      const tableRef = extractTableRefFromInsertSql.call(this as never, sql);
      if (tableRef) {
        if (pk == null) pk = (await this.primaryKey(tableRef)) as string | null;
        pk = suppressCompositePrimaryKey(typeof pk === "string" ? pk : undefined) ?? null;
        sequenceName = pk ? await this.defaultSequenceName(tableRef, pk) : null;
      }
      if (!sequenceName) return result;
    }
    return this.lastInsertIdResult(sequenceName);
  });
}

/** @internal */
interface TransactionHost {
  internalExecute(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<unknown>;
  /** @internal */
  _client: pg.Client | null;
  /** @internal */
  _acquireFreshClient(): Promise<pg.Client>;
  /** @internal */
  _discardRawConnection(): void;
  /** @internal */
  _cancelAnyRunningQuery(): Promise<void>;
  constructor: { _isConnectionError(err: unknown): boolean };
}

export async function beginDbTransaction(this: TransactionHost): Promise<void> {
  this._client = await this._acquireFreshClient();
  try {
    await this.internalExecute("BEGIN", "TRANSACTION", [], {
      materializeTransactions: false,
      allowRetry: true,
    });
  } catch (error) {
    this._client = null;
    if (this.constructor._isConnectionError(error)) this._discardRawConnection();
    throw error;
  }
}

/** @missingRailsArgs fetch — PERMANENT */
export async function beginIsolatedDbTransaction(
  this: TransactionHost,
  isolation: string,
): Promise<void> {
  const level = fetch<string>(transactionIsolationLevels(), isolation);
  this._client = await this._acquireFreshClient();
  try {
    await this.internalExecute(`BEGIN ISOLATION LEVEL ${level}`, "TRANSACTION", [], {
      materializeTransactions: false,
      allowRetry: true,
    });
  } catch (error) {
    this._client = null;
    if (this.constructor._isConnectionError(error)) this._discardRawConnection();
    throw error;
  }
}

export async function commitDbTransaction(this: TransactionHost): Promise<void> {
  try {
    await this.internalExecute("COMMIT", "TRANSACTION", [], {
      allowRetry: false,
      materializeTransactions: true,
    });
  } catch (error) {
    if (this.constructor._isConnectionError(error)) this._discardRawConnection();
    throw error;
  } finally {
    this._client = null;
  }
}

export async function execRollbackDbTransaction(this: TransactionHost): Promise<void> {
  await this._cancelAnyRunningQuery();
  try {
    await this.internalExecute("ROLLBACK", "TRANSACTION", [], {
      allowRetry: false,
      materializeTransactions: true,
    });
  } finally {
    this._client = null;
  }
}

export async function execRestartDbTransaction(this: TransactionHost): Promise<void> {
  await this._cancelAnyRunningQuery();
  await this.internalExecute("ROLLBACK AND CHAIN", "TRANSACTION", [], {
    allowRetry: false,
    materializeTransactions: true,
  });
}

export function highPrecisionCurrentTimestamp(): Nodes.SqlLiteral {
  return arelSql("CURRENT_TIMESTAMP");
}

export async function buildExplainClause(options: ExplainOption[] = []): Promise<string> {
  if (options.length === 0) return "EXPLAIN";
  return `EXPLAIN (${options
    .map((option) => (option.startsWith(":") ? option.slice(1) : option))
    .join(", ")
    .toUpperCase()})`;
}

/** @internal */
interface SetConstraintsHost {
  quoteTableName(name: unknown): string;
  execute(sql: string, name?: string | null): Promise<unknown>;
}

export async function setConstraints(
  this: SetConstraintsHost,
  deferred: "deferred" | "immediate",
  ...constraints: (string | undefined)[]
): Promise<void> {
  if (deferred !== "deferred" && deferred !== "immediate") {
    throw new ArgumentError(`deferred must be "deferred" or "immediate"`);
  }
  const list =
    constraints.length === 0 ? "ALL" : constraints.map((c) => this.quoteTableName(c)).join(", ");
  await this.execute(`SET CONSTRAINTS ${list} ${deferred.toUpperCase()}`);
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
  isInTransaction(): boolean;
  sqlKey(sql: string): string;
  _statements: StatementPool;
  verifiedBang(): void;
  /** @internal */
  handleWarnings(sql: unknown): void;
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
        raw = await query(rawConnection, {
          name: stmtKey,
          text: sql,
          values: typeCastedBinds,
          rowMode,
        });
        break;
      } catch (error) {
        if (this.isCachedPlanFailure(error)) {
          if (this.isInTransaction()) {
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
    raw = await query(rawConnection, rowMode ? { text: sql, rowMode } : sql);
  } else {
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

  const missing: number[] = [];
  for (const f of fields) {
    if (!this.typeMap.isKey(f.dataTypeID) && !missing.includes(f.dataTypeID)) {
      missing.push(f.dataTypeID);
    }
  }
  if (missing.length > 0) {
    await this.loadAdditionalTypes(missing);
  }

  const columnNames = fields.map((f) => f.name);
  const columnTypes: Record<string | number, ValueType> = {};
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const type = this.getOidType(f.dataTypeID, f.dataTypeModifier ?? -1, f.name);
    columnTypes[i] = type;
    if (!/^\d+$/.test(f.name)) columnTypes[f.name] = type;
  }

  const rows = (result.rows ?? []) as unknown[][];
  return new Result(columnNames, rows, columnTypes as Record<string, ValueType>);
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
  quoteTableName(name: unknown): string;
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
