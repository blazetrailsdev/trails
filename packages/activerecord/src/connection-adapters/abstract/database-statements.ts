/**
 * Database statements — query execution interface.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements
 *
 * @boundary-file: typeCast accepts caller-supplied bind values; the
 *   defensive `instanceof Date` branch catches legacy values flowing through
 *   custom types and rejects them with a clear error (per PR 6).
 */

import {
  sql as arelSql,
  Nodes,
  Visitors,
  Collectors,
  Table,
  InsertManager,
} from "@blazetrails/arel";
import { RangeError as ActiveModelRangeError, ArgumentError } from "@blazetrails/activemodel";
import {
  TransactionIsolationError,
  NotImplementedError,
  RangeError as ARRangeError,
  AsynchronousQueryInsideTransactionError,
  ActiveRecordError,
} from "../../errors.js";

import type { Quoting } from "./quoting.js";
import type { ConnectionPool, NullPool } from "./connection-pool.js";
import { CURRENT_TRANSACTION_KEY, Transaction, TransactionManager } from "./transaction.js";
import { Transaction as UserTransaction } from "../../transaction.js";
import { IsolatedExecutionState } from "@blazetrails/activesupport";
import { Result } from "../../result.js";
import {
  FutureResult,
  Complete as FutureResultComplete,
  type FutureResultPool,
  type FutureResultConnection,
} from "../../future-result.js";
import type { Base } from "../../base.js";
import { isWriteQuerySql } from "../sql-classification.js";
import { ActiveRecord } from "../../ar-config.js";

/** @internal */
let _base: typeof Base | undefined;

/** @internal */
export function _registerBase(base: typeof Base): void {
  _base = base;
}

function baseClass(): typeof Base {
  if (!_base) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return _base;
}

export type ExplainOption = string;

export interface DatabaseStatementsHost {
  preparedStatements?: boolean;
  /** @internal */
  collector?(): Collectors.Composite | Collectors.SubstituteBinds;
  /** @internal */
  typeCastedBinds(binds: unknown[] | null | undefined): unknown[] | undefined;
  /** @internal */
  log?<T>(
    sql: string,
    name: string | null | undefined,
    binds: unknown[],
    typeCastedBinds: unknown[],
    isAsync: boolean,
    block: (payload: Record<string, unknown>) => Promise<T>,
  ): Promise<T>;
  execute?(sql: string, binds?: unknown[], name?: string | null): Promise<unknown>;
  selectAll?(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    opts?: { allowRetry?: boolean; preparable?: boolean | null; async?: boolean },
  ): Promise<Result>;
  /** @internal */
  internalExecute?(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    opts?: {
      materializeTransactions?: boolean;
      allowRetry?: boolean;
      prepare?: boolean;
    },
  ): Promise<unknown>;
  /** @internal */
  internalExecQuery?(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    opts?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<Result>;
  /** @internal */
  dirtyCurrentTransaction?(): void;
  /** @internal */
  rawExecute?(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    prepare?: boolean,
    isAsync?: boolean,
    allowRetry?: boolean,
    materializeTransactions?: boolean,
    batch?: boolean,
  ): Promise<unknown>;
  /** @internal */
  castResult?(rawResult: unknown): Result;
  /** @internal */
  affectedRows?(rawResult: unknown): number;
  /** @internal */
  lastInsertedId?(result: Result): unknown;
  isWriteQuery?(sql: string): boolean;
  currentTransaction?(): {
    open: boolean;
    written?: boolean;
    joinable?: boolean | (() => boolean);
    userTransaction?: unknown;
  };
  withinNewTransaction?<T>(opts: unknown, fn: (tx?: unknown) => Promise<T> | T): Promise<T>;
  disableReferentialIntegrity?(fn: () => Promise<void>): Promise<void>;
  /** @internal */
  executeBatch?(
    statements: string[],
    name?: string | null,
    kwargs?: { allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<void>;
  /** @internal */
  buildTruncateStatement?(tableName: string): string;
  /** @internal */
  buildTruncateStatements?(tableNames: string[]): string[];
  beginDbTransaction?(): Promise<void>;
  beginIsolatedDbTransaction?(isolation: string): Promise<void>;
  commitDbTransaction?(): Promise<void>;
  rollbackDbTransaction?(): Promise<void>;
  execRollbackDbTransaction?(): Promise<void>;
  execRestartDbTransaction?(): Promise<void>;
  resetIsolationLevel?(): void | Promise<void>;
  emptyInsertStatementValue?(pk?: string | null): string;
  transaction?<T>(fn: (tx?: unknown) => Promise<T> | T, opts?: unknown): Promise<T | undefined>;
  pool: ConnectionPool | NullPool;
  /** @internal */
  checkIfWriteQuery?(sql: string): void;
  /** @internal */
  supportsInsertReturning?(): boolean | Promise<boolean>;
  /** @internal */
  quoteColumnName?(col: string): string;
  /** @internal */
  primaryKey?(table: string): string | null | Promise<string | null>;
  /** @internal */
  preprocessQuery?(sql: string): string;
  /** @internal */
  asyncEnabled?(): boolean;
  /** @internal */
  rawExecQuery?(...args: unknown[]): Promise<Result>;
  supportsConcurrentConnections?(): boolean;
  /** @internal */
  _inQueryTransformers?: boolean;
}

export class DatabaseStatementsBase {
  /** @missingRailsCall reset_transaction — PERMANENT */
  constructor() {
    (this as any)._transactionManager = new TransactionManager(this as any);
  }
}

export function toSql(
  this: DatabaseStatementsHost | void,
  arel: unknown,
  binds: unknown[] = [],
): string {
  const [sql] = toSqlAndBinds.call(this, arel, binds);
  return sql;
}

/** @internal */
export function toSqlAndBinds(
  this: DatabaseStatementsHost | void,
  arel: unknown,
  binds: unknown[] = [],
  preparable: boolean | null = null,
  allowRetry = false,
): [string, unknown[], boolean | null, boolean] {
  let arelOrSqlString = arel;
  if (
    arelOrSqlString &&
    (arelOrSqlString as any).ast != null &&
    typeof (arelOrSqlString as any).ast === "object"
  ) {
    arelOrSqlString = (arelOrSqlString as any).ast;
  }

  if (
    (arelOrSqlString instanceof Nodes.Node ||
      (arelOrSqlString && typeof (arelOrSqlString as any).toSql === "function")) &&
    typeof arelOrSqlString !== "string" &&
    !(arelOrSqlString instanceof Nodes.SqlLiteral)
  ) {
    if (binds.length > 0) {
      throw new Error(
        "Passing bind parameters with an arel AST is forbidden. " +
          "The values must be stored on the AST directly",
      );
    }

    const host = this as DatabaseStatementsHost | undefined;
    const visitor = (host as any)?.visitor as Visitors.ToSql | undefined;
    if (!visitor || !(arelOrSqlString instanceof Nodes.Node)) {
      return [(arelOrSqlString as any).toSql(), [], preparable, allowRetry];
    }

    const collector = host!.collector!() as unknown as Collectors.Composite;
    collector.retryable = true;

    let sql: string;
    if (host!.preparedStatements) {
      collector.preparable = true;
      [sql, binds] = visitor.compile(arelOrSqlString, collector) as unknown as [string, unknown[]];

      if (binds.length > (host as unknown as { bindParamsLength(): number }).bindParamsLength()) {
        return unpreparedStatement(host!, () => toSqlAndBinds.call(host, arelOrSqlString));
      }
      preparable = collector.preparable ?? null;
    } else {
      sql = visitor.compile(arelOrSqlString, collector) as unknown as string;
    }
    allowRetry = collector.retryable;
    return [sql, binds, preparable, allowRetry];
  }

  if (arelOrSqlString instanceof Nodes.SqlLiteral) {
    return [arelOrSqlString.value, binds, preparable, allowRetry];
  }

  if (typeof arelOrSqlString === "string") {
    return [arelOrSqlString, binds, preparable, allowRetry];
  }

  throw new TypeError("Cannot convert to SQL");
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
function unpreparedStatement<T>(host: DatabaseStatementsHost, block: () => T): T {
  const wasPreparedStatements = (host as { preparedStatements?: boolean }).preparedStatements;
  (host as { preparedStatements?: boolean }).preparedStatements = false;
  try {
    return block();
  } finally {
    (host as { preparedStatements?: boolean }).preparedStatements = wasPreparedStatements;
  }
}

export function cacheableQuery(
  this: DatabaseStatementsHost | void,
  klass: {
    query(sql: string): unknown;
    partialQuery(parts: unknown): unknown;
    partialQueryCollector(): unknown;
  },
  arel: unknown,
): [unknown, unknown[]] {
  const host = this as DatabaseStatementsHost;
  const visitor = (host as any).visitor as Visitors.ToSql;

  let ast = arel;
  if (ast && (ast as any).ast != null && typeof (ast as any).ast === "object") {
    ast = (ast as any).ast;
  }

  let query: unknown;
  let binds: unknown[];
  if (host.preparedStatements) {
    const [sql, compiledBinds] = visitor.compile(
      ast as Nodes.Node,
      host.collector!() as Collectors.Composite,
    ) as unknown as [string, unknown[]];
    binds = compiledBinds;
    query = klass.query(sql);
  } else {
    const collector = klass.partialQueryCollector() as Collectors.Composite;
    const [parts, compiledBinds] = visitor.compile(ast as Nodes.Node, collector) as unknown as [
      unknown,
      unknown[],
    ];
    binds = compiledBinds;
    query = klass.partialQuery(parts);
  }
  return [query, binds];
}

export function queryValue(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<unknown> {
  return query.call(this, sql, name, binds).then((rows) => singleValueFromRows(rows));
}

export function queryValues(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<unknown[]> {
  return query.call(this, sql, name, binds).then((rows) => rows.map((row) => row[0]));
}

export async function query(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<unknown[][]> {
  const run = (this.internalExecQuery ?? internalExecQuery).bind(this);
  const result = await run(sql, name, binds);
  return result.rows;
}

export function execute(_sql: string, _binds?: unknown[], _name?: string | null): Promise<unknown> {
  throw new Error("execute must be implemented by adapter subclass");
}

export function execInsertAll(
  this: DatabaseStatementsHost & {
    internalExecQuery(sql: string, name?: string | null): Promise<Result>;
  },
  sql: string,
  name: string,
): Promise<Result> {
  return this.internalExecQuery(sql, name);
}

export function explain(
  _arel: unknown,
  _binds: unknown[] = [],
  _options: ExplainOption[] = [],
): Promise<string> {
  // @nie disposition=port-real rails=activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb:180
  throw new NotImplementedError();
}

export async function truncate(
  this: DatabaseStatementsHost & Pick<Quoting, "quoteTableName">,
  tableName: string,
  name: string | null = null,
): Promise<unknown> {
  const sql = (this.buildTruncateStatement ?? buildTruncateStatement).call(this, tableName);
  return (this.execute ?? execute).call(this, sql, [], name);
}

export async function truncateTables(
  this: DatabaseStatementsHost & Pick<Quoting, "quoteTableName">,
  ...tableNames: string[]
): Promise<void> {
  const schemaMigrationTable = this.pool.schemaMigration.tableName;
  const internalMetadataTable = this.pool.internalMetadata.tableName;
  const filtered = tableNames.filter(
    (t) => t !== schemaMigrationTable && t !== internalMetadataTable,
  );

  if (filtered.length === 0) return;

  const exec = this.execute ?? execute;
  const doTruncate = async () => {
    const statements = (this.buildTruncateStatements ?? buildTruncateStatements).call(
      this,
      filtered,
    );
    if (this.executeBatch) {
      await this.executeBatch(statements, "Truncate Tables");
    } else {
      for (const stmt of statements) {
        await exec.call(this, stmt);
      }
    }
  };

  if (this.disableReferentialIntegrity) {
    await this.disableReferentialIntegrity(doTruncate);
  } else {
    await doTruncate();
  }
}

export async function transaction<T>(
  this: DatabaseStatementsHost,
  block: (tx?: unknown) => Promise<T> | T,
  options: { requiresNew?: boolean; isolation?: string; joinable?: boolean } = {},
): Promise<T | undefined> {
  const { requiresNew, isolation, joinable = true } = options;

  const fn = (userTx?: unknown): Promise<T> | T => {
    let internalTx: Transaction;
    if (userTx instanceof Transaction) {
      internalTx = userTx;
    } else if (
      userTx &&
      (userTx as { _internalTransaction?: unknown })._internalTransaction instanceof Transaction
    ) {
      internalTx = (userTx as { _internalTransaction: Transaction })._internalTransaction;
    } else {
      const tmCurrent = this.currentTransaction?.();
      internalTx = tmCurrent instanceof Transaction ? tmCurrent : new Transaction(this as never);
    }
    return IsolatedExecutionState.scope(CURRENT_TRANSACTION_KEY, internalTx, () => {
      const publicTx = userTx instanceof UserTransaction ? userTx : internalTx.userTransaction;
      return block(publicTx);
    });
  };

  const currentTxn = this.currentTransaction?.();
  const currentTxnJoinable =
    typeof currentTxn?.joinable === "function" ? currentTxn.joinable() : currentTxn?.joinable;

  if (!requiresNew && joinable && currentTxnJoinable) {
    if (isolation) {
      throw new TransactionIsolationError("cannot set isolation when joining a transaction");
    }
    const userTx = currentTxn!.userTransaction;
    try {
      return await fn(userTx);
    } catch (e: any) {
      if (e?.name === "Rollback") return undefined;
      throw e;
    }
  }

  if (this.withinNewTransaction) {
    try {
      return await this.withinNewTransaction({ isolation, joinable }, fn);
    } catch (e: any) {
      if (e?.name === "Rollback") return undefined;
      throw e;
    }
  }

  if (isolation) {
    await beginDeferredTransaction.call(this, isolation);
  } else {
    await (this.beginDbTransaction
      ? this.beginDbTransaction.call(this)
      : beginDbTransaction.call(this));
  }
  try {
    const result = await fn();
    await (this.commitDbTransaction
      ? this.commitDbTransaction.call(this)
      : commitDbTransaction.call(this));
    return result;
  } catch (e: any) {
    await (this.rollbackDbTransaction
      ? this.rollbackDbTransaction.call(this)
      : rollbackDbTransaction.call(this));
    if (e?.name === "Rollback") return undefined;
    throw e;
  } finally {
    if (isolation) {
      await this.resetIsolationLevel?.call(this);
    }
  }
}

export function transactionManager(this: DatabaseStatementsHost): TransactionManager | null {
  return (this as any)._transactionManager ?? null;
}

export function resetTransaction(this: DatabaseStatementsHost): void;
export function resetTransaction(
  this: DatabaseStatementsHost,
  options: { restore: true },
): Promise<void>;
export function resetTransaction(
  this: DatabaseStatementsHost,
  options: { restore?: boolean },
  callback: () => Promise<unknown>,
): Promise<unknown>;
export function resetTransaction(
  this: DatabaseStatementsHost,
  options?: { restore?: boolean },
  callback?: () => Promise<unknown>,
): void | Promise<unknown> {
  const self = this as any;
  if (callback) {
    const oldState =
      options?.restore && self._transactionManager?.isRestorable?.()
        ? self._transactionManager
        : null;
    self._transactionManager = new TransactionManager(self);
    return (async () => {
      const result = await callback();
      if (oldState) {
        self._transactionManager = oldState;
        await self._transactionManager.restoreTransactions();
      }
      return result;
    })();
  }
  if (options?.restore) {
    if (self._transactionManager?.isRestorable?.()) {
      return self._transactionManager.restoreTransactions().then(() => {});
    }
    self._transactionManager = new TransactionManager(self);
    return Promise.resolve();
  }
  self._transactionManager = new TransactionManager(self);
}

export function markTransactionWrittenIfWrite(this: DatabaseStatementsHost, sql: string): void {
  const txn = this.currentTransaction?.();
  if (txn?.open) {
    if (this.isWriteQuery?.(sql)) {
      txn.written = true;
    }
  }
}

export function isTransactionOpen(this: DatabaseStatementsHost): boolean {
  const txn = this.currentTransaction?.();
  return txn?.open ?? false;
}

export function addTransactionRecord(
  this: DatabaseStatementsHost,
  record: unknown,
  _ensureFinalize = true,
): void {
  const txn = this.currentTransaction?.() as any;
  if (txn?.addRecord) {
    txn.addRecord(record, _ensureFinalize);
  }
}

export async function beginDbTransaction(): Promise<void> {}

export async function beginDeferredTransaction(
  this: DatabaseStatementsHost | void,
  isolationLevel?: string,
): Promise<void> {
  const host = this as DatabaseStatementsHost;
  if (isolationLevel) {
    return host?.beginIsolatedDbTransaction
      ? host.beginIsolatedDbTransaction.call(host, isolationLevel)
      : beginIsolatedDbTransaction.call(this, isolationLevel);
  }
  return host?.beginDbTransaction
    ? host.beginDbTransaction.call(host)
    : beginDbTransaction.call(this);
}

export function transactionIsolationLevels(): Record<string, string> {
  return {
    read_uncommitted: "READ UNCOMMITTED",
    read_committed: "READ COMMITTED",
    repeatable_read: "REPEATABLE READ",
    serializable: "SERIALIZABLE",
  };
}

export async function beginIsolatedDbTransaction(
  this: DatabaseStatementsHost | void,
  _isolation: string,
): Promise<void> {
  throw new TransactionIsolationError("adapter does not support setting transaction isolation");
}

export function resetIsolationLevel(): void {}

export async function commitDbTransaction(): Promise<void> {}

export async function rollbackDbTransaction(this: DatabaseStatementsHost | void): Promise<void> {
  const host = this as DatabaseStatementsHost;
  await (host?.execRollbackDbTransaction
    ? host.execRollbackDbTransaction.call(host)
    : execRollbackDbTransaction.call(this));
}

export async function execRollbackDbTransaction(): Promise<void> {}

export async function restartDbTransaction(this: DatabaseStatementsHost | void): Promise<void> {
  const host = this as DatabaseStatementsHost;
  await (host?.execRestartDbTransaction
    ? host.execRestartDbTransaction.call(host)
    : execRestartDbTransaction.call(this));
}

export async function execRestartDbTransaction(): Promise<void> {}

export async function rollbackToSavepoint(
  this: DatabaseStatementsHost | void,
  name?: string,
): Promise<void> {
  const host = this as any;
  if (host?.execRollbackToSavepoint) {
    await host.execRollbackToSavepoint(name);
  }
}

export function defaultSequenceName(_table: string, _column: string): string | null {
  return null;
}

export async function resetSequenceBang(
  _table: string,
  _column: string,
  _sequence?: string | null,
): Promise<void> {}

export async function insertFixture(
  this: DatabaseStatementsHost & Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName">,
  fixture: Record<string, unknown>,
  tableName: string,
): Promise<unknown> {
  const columns = Object.keys(fixture);

  const host = this as unknown as {
    columns?: (t: string) => Promise<Array<{ name: string }>>;
    lookupCastTypeFromColumn?: (c: unknown) => { serialize?(v: unknown): unknown } | null;
  };
  const tableColumns = typeof host.columns === "function" ? await host.columns(tableName) : [];
  const columnsByName = new Map(tableColumns.map((c) => [c.name, c]));
  const values = Object.entries(fixture).map(([name, v]) => {
    const column = columnsByName.get(name);
    const type =
      column && typeof host.lookupCastTypeFromColumn === "function"
        ? host.lookupCastTypeFromColumn(column)
        : null;
    if (type && typeof type.serialize === "function") {
      return this.quote(withYamlFallback(type.serialize(v)));
    }
    return this.quote(withYamlFallback(v));
  });

  const emptyValue = this.emptyInsertStatementValue?.() ?? emptyInsertStatementValue();
  const sql =
    columns.length > 0
      ? `INSERT INTO ${this.quoteTableName(tableName)} (${columns.map((c) => this.quoteColumnName(c)).join(", ")}) VALUES (${values.join(", ")})`
      : `INSERT INTO ${this.quoteTableName(tableName)} ${emptyValue}`;

  return (this.execute ?? execute).call(this, sql, [], "Fixture Insert");
}

export async function insertFixturesSet(
  this: DatabaseStatementsHost & Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName">,
  fixtureSet: Record<string, Record<string, unknown>[]>,
  tablesToDelete: string[] = [],
): Promise<void> {
  const deleteStatements = tablesToDelete.map((t) => `DELETE FROM ${this.quoteTableName(t)}`);

  const insertStatements: string[] = [];
  for (const [tableName, fixtures] of Object.entries(fixtureSet)) {
    if (fixtures.length === 0) continue;
    for (const fixture of fixtures) {
      const columns = Object.keys(fixture);
      if (columns.length === 0) {
        const emptyValue = this.emptyInsertStatementValue?.() ?? emptyInsertStatementValue();
        insertStatements.push(`INSERT INTO ${this.quoteTableName(tableName)} ${emptyValue}`);
      } else {
        const values = Object.values(fixture).map((v) => this.quote(withYamlFallback(v)));
        insertStatements.push(
          `INSERT INTO ${this.quoteTableName(tableName)} (${columns.map((c) => this.quoteColumnName(c)).join(", ")}) VALUES (${values.join(", ")})`,
        );
      }
    }
  }

  const allStatements = [...deleteStatements, ...insertStatements];

  const exec = this.execute ?? execute;
  const doInserts = async () => {
    if (this.executeBatch) {
      await this.executeBatch(allStatements, "Fixtures Load");
    } else {
      for (const stmt of allStatements) {
        await exec.call(this, stmt);
      }
    }
  };

  const doLoadInTransaction = async () => {
    if (this.disableReferentialIntegrity) {
      await this.disableReferentialIntegrity(doInserts);
    } else {
      await doInserts();
    }
  };

  if (this.transaction) {
    await this.transaction(doLoadInTransaction, { requiresNew: true });
  } else {
    await doLoadInTransaction();
  }
}

export function emptyInsertStatementValue(_primaryKey?: string | null): string {
  return "DEFAULT VALUES";
}

export function sanitizeLimit(limit: unknown): number | Nodes.SqlLiteral {
  if ((typeof limit === "number" && Number.isInteger(limit)) || limit instanceof Nodes.SqlLiteral) {
    return limit;
  }
  if (typeof limit === "string") {
    return integerFromString(limit);
  }
  if (typeof limit === "number") {
    if (!Number.isFinite(limit)) throw new FloatDomainError(String(limit));
    return Math.trunc(limit);
  }
  throw new TypeError(`can't convert ${rubyClassName(limit)} into Integer`);
}

function integerFromString(str: string): number {
  const invalid = () => new ArgumentError(`invalid value for Integer(): ${JSON.stringify(str)}`);
  const signMatch = /^([+-]?)(.*)$/s.exec(str.trim())!;
  const sign = signMatch[1];
  let body = signMatch[2];

  let radix = 10;
  const prefix = /^0([xbod])/i.exec(body);
  if (prefix) {
    radix = { x: 16, b: 2, o: 8, d: 10 }[prefix[1].toLowerCase()]!;
    body = body.slice(2);
  } else if (/^0./.test(body)) {
    radix = 8;
    body = body.slice(1).replace(/^_/, "");
  }

  const digits = { 2: "[01]", 8: "[0-7]", 10: "[0-9]", 16: "[0-9a-fA-F]" }[radix]!;
  if (!new RegExp(`^${digits}(?:_?${digits})*$`).test(body)) throw invalid();
  return (sign === "-" ? -1 : 1) * Number.parseInt(body.replace(/_/g, ""), radix);
}

class FloatDomainError extends globalThis.RangeError {
  constructor(message: string) {
    super(message);
    this.name = "FloatDomainError";
  }
}

function rubyClassName(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "boolean") return String(value);
  return (value as object)?.constructor?.name ?? typeof value;
}

export function withYamlFallback(value: unknown): unknown {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) return JSON.stringify(value);
  }
  return value;
}

export function highPrecisionCurrentTimestamp(): Nodes.SqlLiteral {
  return arelSql("CURRENT_TIMESTAMP");
}

export async function rawExecQuery(
  this: DatabaseStatementsHost,
  sql: string,
  name: string | null = null,
  binds?: unknown[],
  opts?: {
    prepare?: boolean;
    async?: boolean;
    allowRetry?: boolean;
    materializeTransactions?: boolean;
    batch?: boolean;
  },
): Promise<Result> {
  if (!this.rawExecute) {
    throw new Error("rawExecQuery requires rawExecute on the adapter");
  }
  const rawResult = await this.rawExecute(
    sql,
    name,
    binds,
    opts?.prepare ?? false,
    opts?.async ?? false,
    opts?.allowRetry ?? false,
    opts?.materializeTransactions ?? true,
    opts?.batch ?? false,
  );
  return this.castResult ? this.castResult(rawResult) : normalizeResult(rawResult);
}

export async function internalExecQuery(
  this: DatabaseStatementsHost,
  sql: string,
  name: string | null = "SQL",
  binds?: unknown[],
  options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
): Promise<Result> {
  if (this?.internalExecute) {
    const rawResult = await this.internalExecute(sql, name, binds, {
      prepare: options?.prepare,
      allowRetry: options?.allowRetry,
      materializeTransactions: options?.materializeTransactions,
    });
    return this.castResult ? this.castResult(rawResult) : normalizeResult(rawResult);
  }
  if (binds && binds.length > 0) {
    throw new Error(
      "internalExecQuery requires internalExecute on the adapter when binds are provided",
    );
  }
  const doExecute = this?.execute?.bind(this) ?? execute;
  const result = await doExecute(sql, [], name);
  return normalizeResult(result);
}

function normalizeResult(result: unknown): Result {
  if (result instanceof Result) return result;
  if (
    typeof result === "object" &&
    result !== null &&
    "rows" in result &&
    Array.isArray((result as any).rows)
  ) {
    const r = result as { rows: unknown[][]; columns?: string[] };
    return new Result(r.columns ?? [], r.rows);
  }
  if (Array.isArray(result)) {
    if (result.length === 0) return new Result([], []);
    const first = result[0];
    const isHashRow = typeof first === "object" && first !== null && !Array.isArray(first);
    if (isHashRow) {
      return Result.fromRowHashes(result as Record<string, unknown>[]);
    }
    const rows = result.map((row) => (Array.isArray(row) ? row : [row]));
    return new Result([], rows);
  }
  return new Result([], []);
}

/** @internal */
function singleValueFromRows(rows: unknown[][]): unknown {
  const row = rows[0];
  return row ? row[0] : undefined;
}

interface DatabaseStatementsDefaultsHost {
  pool: ConnectionPool | NullPool;
  typeCastedBinds(binds: unknown[] | null | undefined): unknown[] | undefined;
  execute(
    sql: string,
    binds?: unknown[],
    name?: string | null,
    opts?: { allowRetry?: boolean },
  ): Promise<Record<string, unknown>[]>;
  executeMutation(sql: string, binds?: unknown[], name?: string | null): Promise<number>;
  selectAll(
    arel: unknown,
    name?: string | null,
    binds?: unknown[],
    opts?: { allowRetry?: boolean; preparable?: boolean | null; async?: boolean },
  ): Promise<Result> | FutureResult | FutureResultComplete;
  selectRows(
    arel: unknown,
    name?: string | null,
    binds?: unknown[],
    opts?: { async?: boolean },
  ): Promise<unknown[][]>;
  execQuery(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { prepare?: boolean },
  ): Promise<Result>;
  internalExecQuery(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<Result>;
  /** @internal */
  internalExecute(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: {
      prepare?: boolean;
      allowRetry?: boolean;
      materializeTransactions?: boolean;
    },
  ): Promise<unknown>;
  /** @internal */
  affectedRows(rawResult: unknown): number;
  /** @internal */
  sqlForInsert(
    sql: string,
    pk: string | false | null | undefined,
    binds: unknown[],
    returning: string[] | null | undefined,
  ): Promise<[string, unknown[]]>;
}

/** @internal */
async function insertStatement(
  this: any,
  arel: unknown,
  name: string | null = null,
  pk?: string | null,
  idValue?: unknown,
  sequenceName?: string | null,
  binds: unknown[] = [],
  opts?: { returning?: string[] | null },
): Promise<unknown> {
  let sql: string;
  [sql, binds] = toSqlAndBinds.call(this, arel, binds);
  const value = await this.execInsert(sql, name, binds, pk, sequenceName, opts?.returning ?? null);
  if (opts?.returning != null) {
    return this.returningColumnValues(value);
  }
  if (idValue != null && idValue !== false) return idValue;
  return this.lastInsertedId(value);
}

export const DatabaseStatements = {
  resetTransaction,
  selectAll(
    this: DatabaseStatementsDefaultsHost,
    arel: unknown,
    name: string | null = null,
    binds?: unknown[],
    opts?: { allowRetry?: boolean; preparable?: boolean | null; async?: boolean },
  ): Promise<Result> | FutureResult | FutureResultComplete {
    arel = arelFromRelation(arel);
    const [sql, compiledBinds, compiledPreparable, compiledAllowRetry] = toSqlAndBinds.call(
      this as DatabaseStatementsHost,
      arel,
      binds ?? [],
      opts?.preparable ?? null,
      opts?.allowRetry ?? false,
    );
    binds = compiledBinds;
    const preparable = compiledPreparable ?? (binds != null && binds.length > 0);
    const prepare = !!((this as { preparedStatements?: boolean }).preparedStatements && preparable);
    const async = opts?.async ?? false;
    try {
      const result = select.call(this as DatabaseStatementsHost, sql, name, binds, {
        prepare,
        async: async && FutureResult.SelectAll,
        allowRetry: compiledAllowRetry,
      });
      if (result instanceof FutureResult || result instanceof FutureResultComplete) return result;
      return result.catch((e) => {
        if (e instanceof ActiveModelRangeError || e instanceof ARRangeError)
          return Result.empty({ async });
        throw e;
      });
    } catch (e) {
      if (e instanceof ActiveModelRangeError || e instanceof ARRangeError)
        return Promise.resolve(Result.empty({ async }));
      throw e;
    }
  },

  selectOne(
    this: DatabaseStatementsDefaultsHost,
    arel: unknown,
    name: string | null = null,
    binds?: unknown[],
    { async = false }: { async?: boolean } = {},
  ): Promise<Record<string, unknown> | undefined> {
    return this.selectAll(arel, name, binds, { async }).then((result) => result.first());
  },

  selectValue(
    this: DatabaseStatementsDefaultsHost,
    arel: unknown,
    name: string | null = null,
    binds?: unknown[],
    { async = false }: { async?: boolean } = {},
  ): Promise<unknown> {
    return this.selectRows(arel, name, binds, { async }).then((rows) => singleValueFromRows(rows));
  },

  selectValues(
    this: DatabaseStatementsDefaultsHost,
    arel: unknown,
    name: string | null = null,
    binds?: unknown[],
  ): Promise<unknown[]> {
    return this.selectRows(arel, name, binds).then((rows) => rows.map((row) => row[0]));
  },

  selectRows(
    this: DatabaseStatementsDefaultsHost,
    arel: unknown,
    name: string | null = null,
    binds?: unknown[],
    { async = false }: { async?: boolean } = {},
  ): Promise<unknown[][]> {
    return this.selectAll(arel, name, binds, { async }).then((result) => result.rows);
  },

  async execQuery(
    this: DatabaseStatementsDefaultsHost,
    sql: string,
    name: string | null = "SQL",
    binds: unknown[] = [],
    { prepare = false }: { prepare?: boolean } = {},
  ): Promise<Result> {
    return this.internalExecQuery(sql, name, binds, { prepare });
  },

  async execInsert(
    this: DatabaseStatementsDefaultsHost,
    sql: string,
    name: string | null = null,
    binds: unknown[] = [],
    pk?: string | false | null,
    _sequenceName?: string | null,
    returning?: string[] | null,
  ): Promise<Result> {
    [sql, binds] = await this.sqlForInsert(sql, pk, binds, returning);
    return this.internalExecQuery(sql, name, binds);
  },

  async execDelete(
    this: DatabaseStatementsDefaultsHost,
    sql: string,
    name: string | null = null,
    binds: unknown[] = [],
  ): Promise<number> {
    return this.affectedRows(await this.internalExecute(sql, name, binds));
  },

  async execUpdate(
    this: DatabaseStatementsDefaultsHost,
    sql: string,
    name: string | null = null,
    binds: unknown[] = [],
  ): Promise<number> {
    return this.affectedRows(await this.internalExecute(sql, name, binds));
  },

  isWriteQuery(sql: string): boolean {
    return isWriteQuerySql(sql);
  },

  emptyInsertStatementValue,

  cacheableQuery,

  insert: insertStatement,

  create: insertStatement,

  async update(
    this: any,
    arel: unknown,
    name: string | null = null,
    binds: unknown[] = [],
  ): Promise<number> {
    let sql: string;
    [sql, binds] = toSqlAndBinds.call(this, arel, binds);
    return this.execUpdate(sql, name, binds);
  },

  async delete(
    this: any,
    arel: unknown,
    name: string | null = null,
    binds: unknown[] = [],
  ): Promise<number> {
    let sql: string;
    [sql, binds] = toSqlAndBinds.call(this, arel, binds);
    return this.execDelete(sql, name, binds);
  },

  rawExecute,
  internalExecute,
  executeBatch,

  toSql,
  toSqlAndBinds,
  queryValue,
  queryValues,
  query,
  execute,
  execInsertAll,
  explain,
  truncate,
  truncateTables,
  transactionManager,
  isTransactionOpen,
  markTransactionWrittenIfWrite,
  addTransactionRecord,
  beginDbTransaction,
  beginDeferredTransaction,
  transactionIsolationLevels,
  beginIsolatedDbTransaction,
  resetIsolationLevel,
  commitDbTransaction,
  rollbackDbTransaction,
  execRollbackDbTransaction,
  restartDbTransaction,
  execRestartDbTransaction,
  rollbackToSavepoint,
  defaultSequenceName,
  resetSequenceBang,
  insertFixture,
  insertFixturesSet,
  sanitizeLimit,
  withYamlFallback,
  highPrecisionCurrentTimestamp,
  rawExecQuery,
  internalExecQuery,
  performQuery,
  castResult,
  affectedRows,
  preprocessQuery,
  defaultInsertValue,
  buildFixtureSql,
  buildFixtureStatements,
  buildTruncateStatement,
  buildTruncateStatements,
  combineMultiStatements,
  select,
  sqlForInsert,
  lastInsertedId,
  returningColumnValues,
  singleValueFromRows,
  arelFromRelation,
  extractTableRefFromInsertSql,
};

/** @internal */
/** @internal */
export async function rawExecute(
  this: DatabaseStatementsHost,
  sql: string,
  name: string | null = null,
  binds?: unknown[],
  prepare = false,
  isAsync = false,
  allowRetry = false,
  materializeTransactions = true,
  batch = false,
): Promise<unknown> {
  const typeCastedBinds = this.typeCastedBinds(binds ?? []) ?? [];
  return this.log!(sql, name, binds ?? [], typeCastedBinds, isAsync, (notificationPayload) =>
    (this as any).withRawConnection({ allowRetry, materializeTransactions }, (conn: unknown) =>
      (this as any).performQuery(conn, sql, binds ?? [], typeCastedBinds, {
        prepare,
        notificationPayload,
        batch,
      }),
    ),
  );
}

/** @internal */
export function performQuery(
  this: DatabaseStatementsHost,
  _rawConnection: unknown,
  _sql: string,
  _binds: unknown[],
  _typeCastedBinds: unknown[],
  _options?: { prepare?: boolean; notificationPayload?: unknown; batch?: boolean },
): never {
  // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb:561
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::DatabaseStatements#perform_query is not implemented",
  );
}

/** @internal */
function castResult(rawResult: any): never {
  // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb:566
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::DatabaseStatements#cast_result is not implemented",
  );
}

/** @internal */
function affectedRows(rawResult: any): never {
  // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb:570
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::DatabaseStatements#affected_rows is not implemented",
  );
}

/** @internal */
export function preprocessQuery(this: DatabaseStatementsHost, sql: string): string {
  this.checkIfWriteQuery?.(sql);
  markTransactionWrittenIfWrite.call(this, sql);
  const host = this as DatabaseStatementsHost & { _inQueryTransformers?: boolean };
  if (host._inQueryTransformers) return sql;
  host._inQueryTransformers = true;
  try {
    for (const t of ActiveRecord.queryTransformers) {
      sql = t.call(sql, this);
    }
  } finally {
    host._inQueryTransformers = false;
  }
  return sql;
}

/** @internal */
export function internalExecute(
  this: DatabaseStatementsHost,
  sql: string,
  name: string | null = "SQL",
  binds: unknown[] = [],
  {
    prepare = false,
    allowRetry = false,
    materializeTransactions = true,
  }: {
    prepare?: boolean;
    allowRetry?: boolean;
    materializeTransactions?: boolean;
  } = {},
): Promise<unknown> {
  const processed = preprocessQuery.call(this, sql);
  return (this as any).rawExecute(
    processed,
    name,
    binds,
    prepare,
    false,
    allowRetry,
    materializeTransactions,
  );
}

/** @internal */
export async function executeBatch(
  this: DatabaseStatementsHost,
  statements: string[],
  name: string | null = null,
  {
    allowRetry = false,
    materializeTransactions = true,
  }: { allowRetry?: boolean; materializeTransactions?: boolean } = {},
): Promise<void> {
  for (const statement of statements) {
    await (this as any).rawExecute(
      statement,
      name,
      [],
      false,
      false,
      allowRetry,
      materializeTransactions,
    );
  }
}

/** @internal */
export function defaultInsertValue(_column: unknown): Nodes.SqlLiteral {
  return arelSql("DEFAULT");
}

/** @internal */
export function buildFixtureSql(
  this: DatabaseStatementsHost &
    Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName" | "quoteString">,
  fixtures: Record<string, unknown>[],
  tableName: string,
): string {
  if (fixtures.length === 0) {
    const emptyValue = this.emptyInsertStatementValue?.() ?? emptyInsertStatementValue();
    return `INSERT INTO ${this.quoteTableName(tableName)} ${emptyValue}`;
  }

  const allColumns = [...new Set(fixtures.flatMap((f) => Object.keys(f)))];
  if (allColumns.length === 0) {
    const emptyValue = this.emptyInsertStatementValue?.() ?? emptyInsertStatementValue();
    return `INSERT INTO ${this.quoteTableName(tableName)} ${emptyValue}`;
  }

  const DEFAULT_VALUE = arelSql("DEFAULT");
  const table = new Table(tableName);
  const manager = new InsertManager(table);

  const valuesList = fixtures.map((fixture) =>
    allColumns.map((col) =>
      col in fixture ? arelSql(this.quote(withYamlFallback(fixture[col]))) : DEFAULT_VALUE,
    ),
  );

  if (valuesList.length === 1) {
    const row = valuesList[0];
    const filteredValues: unknown[] = [];
    allColumns.forEach((col, i) => {
      if (row[i] !== DEFAULT_VALUE) {
        filteredValues.push(row[i]);
        manager.columns.push(table.get(col));
      }
    });
    manager.values = manager.createValues(filteredValues);
  } else {
    allColumns.forEach((col) => manager.columns.push(table.get(col)));
    manager.values = manager.createValuesList(valuesList);
  }

  const visitor =
    ((this as any)?.visitor as Visitors.ToSql | undefined) ??
    new Visitors.ToSql(this as unknown as Visitors.ArelConnection);
  return visitor.compile(manager.ast);
}

/** @internal */
export function buildFixtureStatements(
  this: DatabaseStatementsHost &
    Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName" | "quoteString">,
  fixtureSet: Record<string, Record<string, unknown>[]>,
): string[] {
  return Object.entries(fixtureSet)
    .filter(([, fixtures]) => fixtures.length > 0)
    .map(([tableName, fixtures]) => buildFixtureSql.call(this, fixtures, tableName));
}

/** @internal */
export function buildTruncateStatement(
  this: Pick<Quoting, "quoteTableName">,
  tableName: string,
): string {
  return `TRUNCATE TABLE ${this.quoteTableName(tableName)}`;
}

/** @internal */
export function buildTruncateStatements(
  this: Pick<Quoting, "quoteTableName"> & {
    buildTruncateStatement?(tableName: string): string;
  },
  tableNames: string[],
): string[] {
  return tableNames.map((t) =>
    (this.buildTruncateStatement ?? buildTruncateStatement).call(this, t),
  );
}

/** @internal */
export function combineMultiStatements(totalSql: string[]): string {
  return totalSql.join(";\n");
}

/** @internal */
export function select(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds: unknown[] = [],
  options?: { prepare?: boolean; async?: unknown; allowRetry?: boolean },
): Promise<Result> | FutureResult | FutureResultComplete {
  const async = options?.async;
  if (async != null && async !== false && this.asyncEnabled?.()) {
    if (currentTransactionJoinable(this)) {
      throw new AsynchronousQueryInsideTransactionError(
        "Asynchronous queries are not allowed inside transactions",
      );
    }

    sql = this.preprocessQuery ? this.preprocessQuery(sql) : sql;
    const futureResult = new (async as FutureResultClass)(
      this.pool as unknown as FutureResultPool,
      [sql, name, binds],
      { prepare: options?.prepare },
    );
    if (this.supportsConcurrentConnections?.() && !currentTransactionJoinable(this)) {
      futureResult.scheduleBang(baseClass().asynchronousQueriesSession());
      return futureResult;
    } else {
      return futureResult.executeBang(this as FutureResultConnection).then(() => futureResult);
    }
  } else {
    const run = (this.internalExecQuery ?? internalExecQuery).bind(this);
    const result = run(sql, name, binds, {
      prepare: options?.prepare,
      allowRetry: options?.allowRetry,
    });
    if (async != null && async !== false) {
      return result.then((r) => FutureResult.wrap(r));
    } else {
      return result;
    }
  }
}

type FutureResultClass = new (
  pool: FutureResultPool,
  args: unknown[],
  kwargs: Record<string, unknown>,
) => FutureResult;

function currentTransactionJoinable(host: DatabaseStatementsHost): boolean {
  const txn = host.currentTransaction?.();
  const joinable = txn?.joinable;
  return typeof joinable === "function" ? joinable.call(txn) : joinable === true;
}

/** @internal */
export async function sqlForInsert(
  this: DatabaseStatementsHost,
  sql: string,
  pk: string | false | null | undefined,
  binds: unknown[],
  returning: string[] | null | undefined,
): Promise<[string, unknown[]]> {
  if (await this.supportsInsertReturning?.()) {
    let resolvedPk: string | null | undefined = pk === false ? null : pk;
    if (pk !== false && resolvedPk == null) {
      const tableRef = extractTableRefFromInsertSql.call(this, sql);
      if (tableRef) resolvedPk = (await this.primaryKey?.(tableRef)) ?? null;
    }
    const returningColumns = returning ?? (resolvedPk != null ? [resolvedPk] : []);
    if (returningColumns.length > 0) {
      const cols = returningColumns
        .map((c) => (this.quoteColumnName ? this.quoteColumnName(c) : `"${c}"`))
        .join(", ");
      sql = `${sql} RETURNING ${cols}`;
    }
  }
  return [sql, binds];
}

/** @internal */
export function lastInsertedId(result: Result): unknown {
  return singleValueFromRows(result.rows);
}

/** @internal */
export function returningColumnValues(this: DatabaseStatementsHost, result: Result): unknown[] {
  return [singleValueFromRows(result.rows)];
}

/** @internal */
export function arelFromRelation(relation: unknown): unknown {
  if (relation != null && typeof (relation as any).arel === "function") {
    return (relation as any).arel();
  }
  return relation;
}

/** @internal */
export function extractTableRefFromInsertSql(
  this: DatabaseStatementsHost,
  sql: string,
): string | null {
  const match = sql.match(/into\s("[ A-Za-z0-9_."[\]]+"|[A-Za-z0-9_.[\]"]+)\s*/im);
  if (!match) return null;
  return match[1].replace(/"/g, "").trim();
}
