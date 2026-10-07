import type { PGResult } from "./pg-result.js";
import type { PGConnection } from "./pg-connection.js";
import { ArgumentError, type ValueType } from "@blazetrails/activemodel";
import { sql as arelSql, type Nodes } from "@blazetrails/arel";
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
import { b, fetch, first, isEmpty } from "@blazetrails/ruby-compat";
import type { StatementPool } from "../statement-pool.js";
import { AbstractAdapter } from "../abstract-adapter.js";
import { dbWarningsAction } from "../../active-record.js";

const READ_QUERY = AbstractAdapter.buildReadQueryRegexp(
  "close",
  "declare",
  "fetch",
  "move",
  "set",
  "show",
);

/** @internal */
interface CastResultHost {
  getOidType(oid: number, fmod: number, columnName: string, sqlType?: string): Promise<ValueType>;
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
  const sql = (await this.buildExplainClause(options)) + " " + this.toSql(arel, binds);
  const result = await this.internalExecQuery(sql, "EXPLAIN", binds);
  return new ExplainPrettyPrinter().pp(result);
}

/** @internal */
interface ExecuteHost extends PerformQueryHost {
  preprocessQuery(sql: string | null): string | null;
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
  performQuery: typeof performQuery;
  /** @internal */
  translateExceptionClass(nativeError: unknown, sql: unknown, binds: unknown): Promise<unknown>;
}

export function isWriteQuery(sql: string | null): boolean {
  try {
    return !READ_QUERY.test(sql as string);
  } catch (error) {
    if (!(error instanceof ArgumentError)) throw error;
    return !READ_QUERY.test(b(sql as string));
  }
}

/** @internal */
interface ExecInsertHost extends LastInsertIdResultHost {
  isUseInsertReturning(): boolean;
  lock: { synchronize<T>(block: () => Promise<T>): Promise<T> };
  primaryKey(tableName: string): unknown;
  defaultSequenceName(tableRef: string, pk: string | null): Promise<string | null> | string | null;
  /** @internal */
  lastInsertIdResult(sequenceName: string): Promise<Result>;
}

export async function execute(
  this: ExecuteHost,
  sql: string | null,
  name: string | null = null,
  { allowRetry = false }: { allowRetry?: boolean } = {},
): Promise<PGResult> {
  try {
    return (await AbstractAdapter.prototype.execute.call(this, sql, name, {
      allowRetry,
    })) as PGResult;
  } finally {
    this._noticeReceiverSqlWarnings = [];
  }
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
  cancelAnyRunningQuery(): Promise<void>;
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
        pk = suppressCompositePrimaryKey(pk as string | string[] | null);
        sequenceName = await this.defaultSequenceName(tableRef, pk);
      }
      if (!sequenceName) return result;
    }
    return this.lastInsertIdResult(sequenceName);
  });
}

export async function beginDbTransaction(this: TransactionHost): Promise<unknown> {
  return this.internalExecute("BEGIN", "TRANSACTION", [], {
    allowRetry: true,
    materializeTransactions: false,
  });
}

export async function beginIsolatedDbTransaction(
  this: TransactionHost,
  isolation: string,
): Promise<void> {
  await this.internalExecute(
    `BEGIN ISOLATION LEVEL ${fetch<string>(transactionIsolationLevels(), isolation)}`,
    "TRANSACTION",
    [],
    { allowRetry: true, materializeTransactions: false },
  );
}

export async function commitDbTransaction(this: TransactionHost): Promise<unknown> {
  return this.internalExecute("COMMIT", "TRANSACTION", [], {
    allowRetry: false,
    materializeTransactions: true,
  });
}

export async function execRollbackDbTransaction(this: TransactionHost): Promise<void> {
  await this.cancelAnyRunningQuery();
  await this.internalExecute("ROLLBACK", "TRANSACTION", [], {
    allowRetry: false,
    materializeTransactions: true,
  });
}

export async function execRestartDbTransaction(this: TransactionHost): Promise<void> {
  await this.cancelAnyRunningQuery();
  await this.internalExecute("ROLLBACK AND CHAIN", "TRANSACTION", [], {
    allowRetry: false,
    materializeTransactions: true,
  });
}

export function highPrecisionCurrentTimestamp(): Nodes.SqlLiteral {
  return arelSql("CURRENT_TIMESTAMP");
}

/** @internal */
interface SetConstraintsHost {
  quoteTableName(name: unknown): string;
  execute(sql: string, name?: string | null): Promise<unknown>;
}

/** @inventedArm map — CONVERGEABLE build-explain-clause-joins-symbol-options-through-array-join */
export async function buildExplainClause(options: ExplainOption[] = []): Promise<string> {
  if (options.length === 0) return "EXPLAIN";
  return `EXPLAIN (${options
    .map((option) => option.replace(/^:/, ""))
    .join(", ")
    .toUpperCase()})`;
}

/** @internal */
interface CancelAnyRunningQueryHost {
  /** @internal */
  _rawConnection: {
    transactionStatus(): number;
    cancel(): Promise<void>;
    block(): Promise<void>;
  } | null;
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

const PQTRANS_IDLE = 0;
const PQTRANS_INTRANS = 2;
const PQTRANS_INERROR = 3;

const IDLE_TRANSACTION_STATUSES = [PQTRANS_IDLE, PQTRANS_INTRANS, PQTRANS_INERROR];

/** @internal */
export async function cancelAnyRunningQuery(this: CancelAnyRunningQueryHost): Promise<void> {
  try {
    if (
      this._rawConnection == null ||
      IDLE_TRANSACTION_STATUSES.includes(this._rawConnection.transactionStatus())
    ) {
      return;
    }

    await this._rawConnection.cancel();
    await this._rawConnection.block();
  } catch {}
}

/** @internal */
export interface PerformQueryHost extends HandleWarningsHost {
  updateTypemapForDefaultTimezone(): Promise<void>;
  prepareStatement(
    sql: string | null,
    binds: unknown[],
    rawConnection: PGConnection,
  ): Promise<string>;
  isCachedPlanFailure(pgerror: unknown): boolean;
  isInTransaction(): boolean;
  sqlKey(sql: string | null): string;
  _statements: StatementPool;
  verifiedBang(): void;
  /** @internal */
  handleWarnings(sql: unknown): void;
}

/** @internal */
export async function performQuery(
  this: PerformQueryHost,
  rawConnection: PGConnection,
  sql: string | null,
  binds: unknown[],
  typeCastedBinds: unknown[],
  {
    prepare,
    notificationPayload,
    batch: _batch = false,
  }: {
    prepare: boolean;
    notificationPayload: Record<string, unknown>;
    batch?: boolean;
  },
): Promise<PGResult> {
  await this.updateTypemapForDefaultTimezone();
  let result: PGResult;
  if (prepare) {
    for (;;) {
      try {
        const stmtKey = await this.prepareStatement(sql, binds, rawConnection);
        notificationPayload.statement_name = stmtKey;
        result = await rawConnection.execPrepared(stmtKey, typeCastedBinds);
        break;
      } catch (error) {
        if (this.isCachedPlanFailure(error)) {
          if (this.isInTransaction()) {
            throw new PreparedStatementCacheExpired(
              (error as { message?: string })?.message ?? "cached plan expired",
              { sql: sql as string, binds, cause: error },
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
    result = await rawConnection.asyncExec(sql);
  } else {
    result = await rawConnection.execParams(sql, typeCastedBinds);
  }

  this.verifiedBang();
  this.handleWarnings(result);
  notificationPayload.row_count = result.length;
  return result;
}

/** @internal */
export async function castResult(this: CastResultHost, result: PGResult): Promise<Result> {
  if (isEmpty(result.fields)) {
    result.clear();
    return Result.empty();
  }

  const types: Record<string | number, ValueType> = {};
  const fields = result.fields;
  for (let i = 0; i < fields.length; i++) {
    const fname = fields[i];
    const ftype = result.ftype(i);
    const fmod = result.fmod(i);
    types[fname] = types[i] = await this.getOidType(ftype, fmod, fname);
  }
  const arResult = new Result(
    fields,
    result.values(),
    Object.freeze(types) as Record<string, ValueType>,
  );
  result.clear();
  return arResult;
}

/** @internal */
export function affectedRows(result: PGResult): number {
  const affectedRows = result.cmdTuples();
  result.clear();
  return affectedRows;
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

/** @internal */
export function returningColumnValues(result: Result): unknown[] | undefined {
  return first(result.rows);
}

/** @internal */
export function suppressCompositePrimaryKey(pk: string | string[] | null): string | null {
  return Array.isArray(pk) ? null : pk;
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
    dbWarningsAction()!.call(this, warning as unknown as SQLWarning);
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
