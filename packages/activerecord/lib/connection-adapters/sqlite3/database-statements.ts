import "../../constants.sqlite3-database-statements.generated.js";
import * as Arel from "@blazetrails/arel";
import { ArgumentError } from "@blazetrails/activemodel";
import { b } from "@blazetrails/ruby-compat/string/b";
import { rbRegMatchP } from "@blazetrails/ruby-compat/regexp";
import { StandardError } from "@blazetrails/ruby-compat/standard-error";
import type {
  Database as SQLite3Database,
  Statement as SQLite3Statement,
} from "@blazetrails/sqlite3";
import { TransactionIsolationError } from "../../errors.js";
import { Result } from "../../result.js";
import { AbstractAdapter } from "../abstract-adapter.js";
import {
  combineMultiStatements,
  type DatabaseStatementsHost,
  type ExplainOption,
} from "../abstract/database-statements.js";
import { ExplainPrettyPrinter } from "./explain-pretty-printer.js";
import { ConnectionAdapters } from "../../namespaces.js";
import * as DatabaseStatements from "./database-statements.js";

const READ_QUERY = AbstractAdapter.buildReadQueryRegexp("pragma");

export function isWriteQuery(sql: string | null): boolean {
  try {
    return !READ_QUERY.test(sql as string);
  } catch (error) {
    if (!(error instanceof ArgumentError)) throw error;
    return !rbRegMatchP(READ_QUERY, b(sql as string));
  }
}

export async function explain(
  this: ExplainHost,
  arel: string,
  binds: unknown[] = [],
  _options: ExplainOption[] = [],
): Promise<string> {
  const sql = "EXPLAIN QUERY PLAN " + this.toSql(arel, binds);
  const result = await this.internalExecQuery(sql, "EXPLAIN", []);
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

const HIGH_PRECISION_CURRENT_TIMESTAMP = Arel.sql("STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')", {
  retryable: true,
});

export function highPrecisionCurrentTimestamp(): Arel.Nodes.SqlLiteral {
  return HIGH_PRECISION_CURRENT_TIMESTAMP;
}

export async function execute(
  this: object,
  sql: string,
  name?: string | null,
  options?: { allowRetry?: boolean },
): Promise<Record<string, unknown>[] | undefined> {
  const result = (await AbstractAdapter.prototype.execute.call(
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
  _statements: {
    get(sql: string): SQLite3Statement | null | undefined;
    set(sql: string, stmt: SQLite3Statement): unknown;
  };
  _maybeEnableReadBigInts(sql: string, stmt: SQLite3Statement): Promise<void>;
  _narrowSpilledBigInts(stmt: SQLite3Statement, rows: unknown[][]): Promise<unknown[][]>;
  verifiedBang(): void;
  _lastAffectedRows: number;
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
 * @inventedArm _maybeEnableReadBigInts — PERMANENT
 * @inventedArm _narrowSpilledBigInts — PERMANENT
 */
export async function performQuery(
  this: PerformQueryHost,
  rawConnection: SQLite3Database,
  sql: string,
  binds: unknown[],
  typeCastedBinds: unknown[] | Record<string, unknown>,
  {
    prepare,
    notificationPayload,
    batch = false,
  }: {
    prepare: boolean;
    notificationPayload?: Record<string, unknown>;
    batch?: boolean;
  },
): Promise<Result | null> {
  let result: Result | null = null;
  if (batch) {
    await rawConnection.executeBatch2(sql);
  } else if (prepare) {
    let stmt = this._statements.get(sql);
    if (stmt == null) {
      stmt = await rawConnection.prepare(sql);
      await this._maybeEnableReadBigInts(sql, stmt);
      await this._statements.set(sql, stmt);
    }
    await stmt.resetBang();
    await stmt.bindParams(typeCastedBinds);

    if (stmt.columnCount() === 0) {
      await stmt.step();
      result = Result.empty();
    } else {
      result = new Result(
        (await stmt.columns()) as string[],
        await this._narrowSpilledBigInts(stmt, await stmt.toA()),
      );
    }
  } else {
    const stmt = await rawConnection.prepare(sql);
    try {
      if (!(binds == null || binds.length === 0)) {
        await stmt.bindParams(typeCastedBinds);
      }
      await this._maybeEnableReadBigInts(sql, stmt);
      if (stmt.columnCount() === 0) {
        await stmt.step();
        result = Result.empty();
      } else {
        result = new Result(
          (await stmt.columns()) as string[],
          await this._narrowSpilledBigInts(stmt, await stmt.toA()),
        );
      }
    } finally {
      await stmt.close();
    }
  }
  this._lastAffectedRows = await rawConnection.changes();
  this.verifiedBang();

  if (notificationPayload) notificationPayload.row_count = result?.length ?? 0;
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

/** @internal */
export function returningColumnValues(result: Result): unknown[] | null {
  return result.rows[0] ?? null;
}

/** @internal */
export function defaultInsertValue(column: {
  defaultFunction?: string | null;
  default?: unknown;
}): unknown {
  if (column.defaultFunction) {
    return Arel.sql(column.defaultFunction);
  }
  return column.default;
}

ConnectionAdapters.SQLite3.DatabaseStatements = DatabaseStatements;
