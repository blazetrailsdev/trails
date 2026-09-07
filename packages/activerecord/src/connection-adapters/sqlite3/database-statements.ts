import { sql as arelSql } from "@blazetrails/arel";
import { ArgumentError } from "@blazetrails/activemodel";
import { b, StandardError } from "@blazetrails/ruby-compat";
import type { SqliteBinds, SqliteConnection, SqliteStatement } from "../../sqlite-adapter.js";
import { TransactionIsolationError } from "../../errors.js";
import { Result } from "../../result.js";
import { AbstractAdapter } from "../abstract-adapter.js";
import {
  combineMultiStatements,
  execute as abstractExecute,
  type DatabaseStatementsHost,
  type ExplainOption,
} from "../abstract/database-statements.js";
import { ExplainPrettyPrinter } from "./explain-pretty-printer.js";

const READ_QUERY = AbstractAdapter.buildReadQueryRegexp("pragma");

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
  try {
    return !READ_QUERY.test(sql);
  } catch (error) {
    if (!(error instanceof ArgumentError)) throw error;
    return !READ_QUERY.test(b(sql));
  }
}

/** @missingRailsArgs internal_exec_query — CONVERGEABLE sqlite3-explain-passes-empty-binds */
export async function explain(
  this: ExplainHost,
  arel: string,
  binds: unknown[] = [],
  _options: ExplainOption[] = [],
): Promise<string> {
  const sql = "EXPLAIN QUERY PLAN " + this.toSql(arel, binds);
  const result = await this.internalExecQuery(sql, "EXPLAIN", binds);
  return new ExplainPrettyPrinter().pp(result);
}

/** @internal */
interface ExplainHost {
  toSql(arel: unknown, binds?: unknown[]): string;
  internalExecQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
}

export async function beginDeferredTransaction(
  this: InternalBeginTransactionHost,
  isolation?: string | null,
): Promise<void> {
  await internalBeginTransaction.call(this, "deferred", isolation ?? null);
}

export async function beginIsolatedDbTransaction(
  this: InternalBeginTransactionHost,
  isolation: string,
): Promise<void> {
  await internalBeginTransaction.call(this, "deferred", isolation);
}

export async function beginDbTransaction(this: InternalBeginTransactionHost): Promise<void> {
  await internalBeginTransaction.call(this, "immediate", null);
}

export async function commitDbTransaction(this: InternalBeginTransactionHost): Promise<void> {
  await this.internalExecute("COMMIT TRANSACTION", "TRANSACTION", [], {
    allowRetry: true,
    materializeTransactions: false,
  });
}

export async function execRollbackDbTransaction(this: InternalBeginTransactionHost): Promise<void> {
  await this.internalExecute("ROLLBACK TRANSACTION", "TRANSACTION", [], {
    allowRetry: true,
    materializeTransactions: false,
  });
}

export function highPrecisionCurrentTimestamp(): string {
  return "STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')";
}

export async function execute(
  this: object,
  sql: string,
  name?: string | null,
  options?: { allowRetry?: boolean },
): Promise<Record<string, unknown>[] | undefined> {
  const result = (await abstractExecute.call(
    this as DatabaseStatementsHost,
    sql,
    name,
    options,
  )) as { toArray(): Record<string, unknown>[] } | null | undefined;
  return result?.toArray();
}

export async function resetIsolationLevel(this: InternalBeginTransactionHost): Promise<void> {
  await this.internalExecute(
    `PRAGMA read_uncommitted=${this._previousReadUncommitted}`,
    "TRANSACTION",
    [],
    { allowRetry: true, materializeTransactions: false },
  );
  this._previousReadUncommitted = null;
}

interface InternalBeginTransactionHost {
  internalExecute(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<unknown>;
  queryValue(sql: string, name?: string): Promise<unknown>;
  isSharedCache(): boolean;
  _previousReadUncommitted?: unknown;
}

interface PerformQueryHost {
  _cachedStatement(sql: string): Promise<SqliteStatement>;
  _freshStatement(sql: string): Promise<SqliteStatement>;
  _narrowSpilledBigInts(stmt: SqliteStatement, rows: Record<string, unknown>[]): void;
  verifiedBang(): void;
  _statementLock: Promise<void> | null;
  _lastAffectedRows: number;
  _lastInsertRowid: number | bigint;
}

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

interface QuoteTableNameHost {
  quoteTableName(tableName: unknown): string;
}

/** @internal */
export async function internalBeginTransaction(
  this: InternalBeginTransactionHost,
  mode: "deferred" | "immediate",
  isolation: string | null,
): Promise<void> {
  if (isolation) {
    if (isolation !== ":read_uncommitted") {
      throw new TransactionIsolationError(
        "SQLite3 only supports the `read_uncommitted` transaction isolation level",
      );
    }
    if (!this.isSharedCache()) {
      throw new StandardError(
        "You need to enable the shared-cache mode in SQLite mode before attempting to change the transaction isolation level",
      );
    }
  }
  await this.internalExecute(`BEGIN ${mode} TRANSACTION`, "TRANSACTION", [], {
    allowRetry: true,
    materializeTransactions: false,
  });
  if (isolation) {
    this._previousReadUncommitted = await this.queryValue("PRAGMA read_uncommitted");
    await this.internalExecute("PRAGMA read_uncommitted=ON", "TRANSACTION", [], {
      allowRetry: true,
      materializeTransactions: false,
    });
  }
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function acquireStatementLock(host: {
  _statementLock: Promise<void> | null;
}): (() => void) | Promise<() => void> {
  const ahead = host._statementLock;
  let release!: () => void;
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = ahead ? ahead.then(() => mine) : mine;
  host._statementLock = tail;
  const drain = (): void => {
    if (host._statementLock === tail) host._statementLock = null;
    release();
  };
  if (!ahead) return drain;
  return ahead.then(() => drain);
}

/** @internal */
export async function performQuery(
  this: PerformQueryHost,
  rawConnection: SqliteConnection,
  sql: string,
  binds: unknown[],
  typeCastedBinds: SqliteBinds,
  {
    prepare,
    notificationPayload,
    batch = false,
    counters,
  }: {
    prepare: boolean;
    notificationPayload?: Record<string, unknown>;
    batch?: boolean;
    counters?: { affectedRows: number; insertRowid: number | bigint };
  },
): Promise<Result> {
  const acquired = acquireStatementLock(this);
  const release = typeof acquired === "function" ? acquired : await acquired;
  let stmt: SqliteStatement | null = null;
  let result: Result;
  let affectedRows: number;
  let insertRowid: number | bigint;
  try {
    stmt = batch
      ? null
      : prepare
        ? await this._cachedStatement(sql)
        : await this._freshStatement(sql);
    if (stmt === null) {
      await rawConnection.exec(sql);
      result = Result.empty();
    } else if (stmt.reader) {
      const rows = (await stmt.all(typeCastedBinds)) as Record<string, unknown>[];
      this._narrowSpilledBigInts(stmt, rows);
      result =
        rows.length > 0
          ? Result.fromRowHashes(rows)
          : new Result(
              stmt.columns().map((c) => c.name),
              [],
            );
    } else {
      await stmt.run(typeCastedBinds);
      result = Result.empty();
    }
    affectedRows = await rawConnection.changes();
    insertRowid = await rawConnection.lastInsertRowId();
  } finally {
    release();
    if (!prepare && stmt !== null) await stmt.close();
  }
  this._lastAffectedRows = affectedRows;
  this._lastInsertRowid = insertRowid;
  if (counters) {
    counters.affectedRows = affectedRows;
    counters.insertRowid = insertRowid;
  }
  this.verifiedBang();
  if (notificationPayload) notificationPayload.row_count = result.length;
  return result;
}

/** @internal */
export function castResult(result: Result): Result {
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
  name: string | null = null,
  {
    allowRetry = false,
    materializeTransactions = true,
  }: { allowRetry?: boolean; materializeTransactions?: boolean } = {},
): Promise<void> {
  const sql = combineMultiStatements(statements);
  await this.rawExecute(sql, name, [], false, false, allowRetry, materializeTransactions, true);
}

/** @internal */
export function buildTruncateStatement(this: QuoteTableNameHost | void, tableName: string): string {
  const quoted =
    (this as QuoteTableNameHost | null)?.quoteTableName(tableName) ??
    `"${tableName.replace(/"/g, '""')}"`;
  return `DELETE FROM ${quoted}`;
}

/**
 * @internal
 * @missingRailsCall first — PERMANENT
 */
export function returningColumnValues(result: Result): unknown[] | undefined {
  return result.rows[0] as unknown[] | undefined;
}

/**
 * @internal
 * @missingRailsCall sql — PERMANENT
 */
export function defaultInsertValue(column: {
  defaultFunction?: string | null;
  default?: unknown;
}): unknown {
  if (column.defaultFunction) {
    return arelSql(column.defaultFunction);
  }
  return column.default;
}
