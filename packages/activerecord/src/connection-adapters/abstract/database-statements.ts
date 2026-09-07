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
  arelNode,
  Nodes,
  Visitors,
  Collectors,
  Table,
  InsertManager,
} from "@blazetrails/arel";
import { RangeError as ActiveModelRangeError } from "@blazetrails/activemodel";
import { kernelInteger } from "@blazetrails/ruby-compat";
import {
  TransactionIsolationError,
  NotImplementedError,
  RangeError as ARRangeError,
  AsynchronousQueryInsideTransactionError,
  ActiveRecordError,
  Rollback,
  FixtureError,
  ConnectionNotEstablished,
  ConnectionFailed,
} from "../../errors.js";

import type { Quoting } from "./quoting.js";
import type { ConnectionPool, NullPool } from "./connection-pool.js";
import {
  CURRENT_TRANSACTION_KEY,
  NullTransaction,
  Transaction,
  TransactionManager,
} from "./transaction.js";
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
import { ActiveRecord } from "../../ar-config.js";
import { rubyInspect } from "../../relation/ruby-inspect.js";

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
  unpreparedStatement?<T>(fn: () => Promise<T> | T): Promise<T> | T;
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
    async: boolean,
    block: (payload: Record<string, unknown>) => Promise<T>,
  ): Promise<T>;
  execute(sql: string, name?: string | null, kwargs?: { allowRetry?: boolean }): Promise<unknown>;
  selectAll?(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    opts?: { allowRetry?: boolean; preparable?: boolean | null; async?: boolean },
  ): Promise<Result>;
  /** @internal */
  internalExecute(
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
  dirtyCurrentTransaction(): void;
  /** @internal */
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
  /** @internal */
  castResult(rawResult: unknown): Result;
  /** @internal */
  affectedRows(rawResult: unknown): number;
  /** @internal */
  lastInsertedId?(result: Result): unknown;
  isWriteQuery(sql: string): boolean;
  currentTransaction(): Transaction | NullTransaction;
  withinNewTransaction<T>(
    options: { isolation?: string | null; joinable?: boolean },
    block: (tx?: unknown) => Promise<T> | T,
  ): Promise<T>;
  disableReferentialIntegrity(fn: () => Promise<void>): Promise<void>;
  /** @internal */
  executeBatch(
    statements: string[],
    name?: string | null,
    kwargs?: { allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<void>;
  /** @internal */
  buildTruncateStatement?(tableName: string): string;
  /** @internal */
  buildTruncateStatements(tableNames: string[]): string[];
  beginDbTransaction?(): Promise<void>;
  beginIsolatedDbTransaction?(isolation: string): Promise<void>;
  commitDbTransaction?(): Promise<void>;
  rollbackDbTransaction?(): Promise<void>;
  execRollbackDbTransaction?(): Promise<void>;
  execRestartDbTransaction?(): Promise<void>;
  resetIsolationLevel?(): void | Promise<void>;
  emptyInsertStatementValue?(pk?: string | null): string;
  transaction<T>(fn: (tx?: unknown) => Promise<T> | T, opts?: unknown): Promise<T | undefined>;
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
}

export class DatabaseStatementsBase {
  /** @missingRailsCall reset_transaction — PERMANENT */
  constructor() {
    (this as any)._transactionManager = new TransactionManager(this as any);
  }
}

export function toSql(
  this: DatabaseStatementsHost | void,
  arelOrSqlString: unknown,
  binds: unknown[] = [],
): string {
  const [sql] = toSqlAndBinds.call(this, arelOrSqlString, binds);
  return sql;
}

/** @internal */
export function toSqlAndBinds(
  this: DatabaseStatementsHost | void,
  arelOrSqlString: unknown,
  binds: unknown[] = [],
  preparable: boolean | null = null,
  allowRetry = false,
): [string, unknown[], boolean | null, boolean] {
  if (
    arelOrSqlString &&
    (arelOrSqlString as any).ast != null &&
    typeof (arelOrSqlString as any).ast === "object"
  ) {
    arelOrSqlString = (arelOrSqlString as any).ast;
  }

  if (
    arelNode(arelOrSqlString) &&
    typeof arelOrSqlString !== "string" &&
    !(arelOrSqlString instanceof Nodes.SqlLiteral)
  ) {
    if (binds.length > 0) {
      throw new Error(
        "Passing bind parameters with an arel AST is forbidden. " +
          "The values must be stored on the AST directly",
      );
    }

    const host = this as unknown as DatabaseStatementsHost | undefined;
    const visitor = (host as any)?.visitor as Visitors.ToSql;

    const collector = host!.collector!() as unknown as Collectors.Composite;
    collector.retryable = true;

    let sql: string;
    if (host!.preparedStatements) {
      collector.preparable = true;
      [sql, binds] = visitor.compile(arelOrSqlString as Nodes.Node, collector) as unknown as [
        string,
        unknown[],
      ];

      if (binds.length > (host as unknown as { bindParamsLength(): number }).bindParamsLength()) {
        return host!.unpreparedStatement!(() => toSqlAndBinds.call(host, arelOrSqlString)) as [
          string,
          unknown[],
          boolean | null,
          boolean,
        ];
      }
      preparable = collector.preparable ?? null;
    } else {
      sql = visitor.compile(arelOrSqlString as Nodes.Node, collector) as unknown as string;
    }
    allowRetry = collector.retryable;
    return [sql, binds, preparable, allowRetry];
  }

  if (arelOrSqlString instanceof Nodes.SqlLiteral) {
    return [arelOrSqlString.value, binds, preparable, allowRetry];
  }

  return [arelOrSqlString as string, binds, preparable, allowRetry];
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
  const host = this as unknown as DatabaseStatementsHost;
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
  options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
): Promise<unknown> {
  return query.call(this, sql, name, binds, options).then((rows) => singleValueFromRows(rows));
}

export function queryValues(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
  options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
): Promise<unknown[]> {
  return query.call(this, sql, name, binds, options).then((rows) => rows.map((row) => row[0]));
}

export async function query(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
  options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
): Promise<unknown[][]> {
  const run = (this.internalExecQuery ?? internalExecQuery).bind(this);
  const result = await run(sql, name, binds, options);
  return result.rows;
}

export function execute(
  this: DatabaseStatementsHost,
  sql: string,
  name: string | null = null,
  { allowRetry = false }: { allowRetry?: boolean } = {},
): Promise<unknown> {
  return (this.internalExecute ?? internalExecute).call(this, sql, name, [], { allowRetry });
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
  this: DatabaseStatementsHost &
    Required<Pick<DatabaseStatementsHost, "execute">> &
    Pick<Quoting, "quoteTableName">,
  tableName: string,
  name: string | null = null,
): Promise<unknown> {
  const sql = (this.buildTruncateStatement ?? buildTruncateStatement).call(this, tableName);
  return this.execute(sql, name);
}

export async function truncateTables(
  this: DatabaseStatementsHost & Pick<Quoting, "quoteTableName">,
  ...tableNames: string[]
): Promise<void> {
  const excluded = [this.pool.schemaMigration.tableName, this.pool.internalMetadata.tableName];
  tableNames = tableNames.filter((t) => !excluded.includes(t));

  if (tableNames.length === 0) return;

  await this.disableReferentialIntegrity(async () => {
    const statements = this.buildTruncateStatements(tableNames);
    await this.executeBatch(statements, "Truncate Tables");
  });
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
      const tmCurrent = this.currentTransaction();
      internalTx = tmCurrent instanceof Transaction ? tmCurrent : new Transaction(this as never);
    }
    return IsolatedExecutionState.scope(CURRENT_TRANSACTION_KEY, internalTx, () => {
      const publicTx = userTx instanceof UserTransaction ? userTx : internalTx.userTransaction;
      return block(publicTx);
    });
  };

  try {
    if (!requiresNew && this.currentTransaction().joinable) {
      if (isolation) {
        throw new TransactionIsolationError("cannot set isolation when joining a transaction");
      }
      return await fn(this.currentTransaction().userTransaction);
    } else {
      return await this.withinNewTransaction({ isolation, joinable }, fn);
    }
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
    return undefined;
  }
}

export function transactionManager(this: DatabaseStatementsHost): TransactionManager | null {
  return (this as any)._transactionManager ?? null;
}

export async function withinNewTransaction<T>(
  this: DatabaseStatementsHost,
  options: { isolation?: string | null; joinable?: boolean },
  block: (tx?: unknown) => Promise<T> | T,
): Promise<T> {
  return transactionManager.call(this)!.withinNewTransaction(options, block as never);
}

export function openTransactions(this: DatabaseStatementsHost): number {
  return transactionManager.call(this)!.openTransactions;
}

export function currentTransaction(this: DatabaseStatementsHost): Transaction | NullTransaction {
  return transactionManager.call(this)!.currentTransaction;
}

export async function beginTransaction(
  this: DatabaseStatementsHost,
  options: { isolation?: string | null; joinable?: boolean; _lazy?: boolean } = {},
): Promise<Transaction> {
  return await transactionManager.call(this)!.beginTransaction(options);
}

export async function commitTransaction(this: DatabaseStatementsHost): Promise<void> {
  return transactionManager.call(this)!.commitTransaction();
}

export async function rollbackTransaction(
  this: DatabaseStatementsHost,
  transaction?: Transaction,
): Promise<void> {
  return transactionManager.call(this)!.rollbackTransaction(transaction);
}

export async function materializeTransactions(this: DatabaseStatementsHost): Promise<void> {
  return transactionManager.call(this)!.materializeTransactions();
}

export async function disableLazyTransactionsBang(this: DatabaseStatementsHost): Promise<void> {
  return transactionManager.call(this)!.disableLazyTransactionsBang();
}

export function enableLazyTransactionsBang(this: DatabaseStatementsHost): void {
  transactionManager.call(this)!.enableLazyTransactionsBang();
}

export function dirtyCurrentTransaction(this: DatabaseStatementsHost): void {
  transactionManager.call(this)!.dirtyCurrentTransaction();
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
  const transaction = this.currentTransaction();
  if (transaction.open) {
    (transaction as Transaction).written ||= this.isWriteQuery(sql);
  }
}

export function isTransactionOpen(this: DatabaseStatementsHost): boolean {
  return this.currentTransaction().open;
}

export function addTransactionRecord(
  this: DatabaseStatementsHost,
  record: unknown,
  _ensureFinalize = true,
): void {
  this.currentTransaction().addRecord(record, _ensureFinalize);
}

export async function beginDbTransaction(): Promise<void> {}

export async function beginDeferredTransaction(
  this: DatabaseStatementsHost | void,
  isolationLevel?: string,
): Promise<void> {
  const host = this as unknown as DatabaseStatementsHost;
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
    ":read_uncommitted": "READ UNCOMMITTED",
    ":read_committed": "READ COMMITTED",
    ":repeatable_read": "REPEATABLE READ",
    ":serializable": "SERIALIZABLE",
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
  const host = this as unknown as DatabaseStatementsHost;
  try {
    await (host?.execRollbackDbTransaction
      ? host.execRollbackDbTransaction.call(host)
      : execRollbackDbTransaction.call(this));
  } catch (e) {
    if (!(e instanceof ConnectionNotEstablished) && !(e instanceof ConnectionFailed)) throw e;
  }
}

export async function execRollbackDbTransaction(): Promise<void> {}

export async function restartDbTransaction(this: DatabaseStatementsHost | void): Promise<void> {
  const host = this as unknown as DatabaseStatementsHost;
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
  this: DatabaseStatementsHost &
    Required<Pick<DatabaseStatementsHost, "execute">> &
    Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName">,
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

  return this.execute(sql, "Fixture Insert");
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

  await this.transaction(
    async () => {
      await this.disableReferentialIntegrity(async () => {
        await this.executeBatch(allStatements, "Fixtures Load");
      });
    },
    { requiresNew: true },
  );
}

export function emptyInsertStatementValue(_primaryKey?: string | null): string {
  return "DEFAULT VALUES";
}

export function sanitizeLimit(limit: unknown): number | Nodes.SqlLiteral {
  if ((typeof limit === "number" && Number.isInteger(limit)) || limit instanceof Nodes.SqlLiteral) {
    return limit;
  }
  return kernelInteger(limit);
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
  return this.castResult(
    await this.rawExecute(
      sql,
      name,
      binds,
      opts?.prepare ?? false,
      opts?.async ?? false,
      opts?.allowRetry ?? false,
      opts?.materializeTransactions ?? true,
      opts?.batch ?? false,
    ),
  );
}

export async function internalExecQuery(
  this: DatabaseStatementsHost,
  sql: string,
  name: string | null = "SQL",
  binds?: unknown[],
  options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
): Promise<Result> {
  return this.castResult(
    await this.internalExecute(sql, name, binds, {
      prepare: options?.prepare,
      allowRetry: options?.allowRetry,
      materializeTransactions: options?.materializeTransactions,
    }),
  );
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
    name?: string | null,
    kwargs?: { allowRetry?: boolean },
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

export async function insert(
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

export const create = insert;

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
      this as unknown as DatabaseStatementsHost,
      arel,
      binds ?? [],
      opts?.preparable ?? null,
      opts?.allowRetry ?? false,
    );
    binds = compiledBinds;
    const prepare = !!(
      (this as { preparedStatements?: boolean }).preparedStatements && compiledPreparable
    );
    const async = opts?.async ?? false;
    try {
      const result = select.call(this as unknown as DatabaseStatementsHost, sql, name, binds, {
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

  isWriteQuery(_sql: string): boolean {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb:118
    throw new NotImplementedError();
  },

  emptyInsertStatementValue,

  cacheableQuery,

  insert,

  create,

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
  withinNewTransaction,
  openTransactions,
  currentTransaction,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  materializeTransactions,
  disableLazyTransactionsBang,
  enableLazyTransactionsBang,
  dirtyCurrentTransaction,
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
  async = false,
  allowRetry = false,
  materializeTransactions = true,
  batch = false,
): Promise<unknown> {
  const typeCastedBinds = this.typeCastedBinds(binds ?? []) ?? [];
  return this.log!(sql, name, binds ?? [], typeCastedBinds, async, (notificationPayload) =>
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
  _options: {
    prepare: boolean;
    notificationPayload?: unknown;
    batch?: boolean;
  },
): never {
  // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb:561
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::DatabaseStatements#perform_query is not implemented",
  );
}

/** @internal */
export function castResult(rawResult: any): never {
  // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb:566
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::DatabaseStatements#cast_result is not implemented",
  );
}

/** @internal */
export function affectedRows(rawResult: any): never {
  // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb:570
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::DatabaseStatements#affected_rows is not implemented",
  );
}

/** @internal */
export function preprocessQuery(this: DatabaseStatementsHost, sql: string): string {
  this.checkIfWriteQuery?.(sql);
  markTransactionWrittenIfWrite.call(this, sql);
  for (const transformer of ActiveRecord.queryTransformers) {
    sql = transformer.call(sql, this);
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

const DEFAULT_INSERT_VALUE = arelSql("DEFAULT");

/** @internal */
export function defaultInsertValue(_column: unknown): Nodes.SqlLiteral {
  return DEFAULT_INSERT_VALUE;
}

/** @internal */
export async function buildFixtureSql(
  this: DatabaseStatementsHost &
    Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName" | "quoteString"> & {
      schemaCache: { columnsHash(tableName: string): Promise<Record<string, unknown> | undefined> };
      supportsVirtualColumns?(): Promise<boolean> | boolean;
      defaultInsertValue?(column: unknown): unknown;
      lookupCastTypeFromColumn(column: unknown): { serialize(value: unknown): unknown };
    },
  fixtures: Record<string, unknown>[],
  tableName: string,
): Promise<string> {
  const supportsVirtualColumns = (await this.supportsVirtualColumns?.()) ?? false;
  const columns = Object.entries((await this.schemaCache.columnsHash(tableName)) ?? {}).filter(
    ([, column]) => !(supportsVirtualColumns && (column as { virtual?: boolean }).virtual),
  );
  const columnNames = columns.map(([name]) => name);

  const valuesList = fixtures.map((fixture) => {
    const unknownColumns = Object.keys(fixture).filter((name) => !columnNames.includes(name));
    if (unknownColumns.length > 0) {
      throw new FixtureError(
        `table "${tableName}" has no columns named ${unknownColumns.map((name) => rubyInspect(name)).join(", ")}.`,
      );
    }

    return columns.map(([name, column]) => {
      if (name in fixture) {
        const type = this.lookupCastTypeFromColumn(column);
        return arelSql(this.quote(withYamlFallback(type.serialize(fixture[name]))));
      }
      return (this.defaultInsertValue ?? defaultInsertValue).call(this, column);
    });
  });

  const table = new Table(tableName);
  const manager = new InsertManager(table);

  if (valuesList.length === 1) {
    const values = valuesList.shift() as unknown[];
    const newValues: unknown[] = [];
    columnNames.forEach((column, i) => {
      if (values[i] !== DEFAULT_INSERT_VALUE) {
        newValues.push(values[i]);
        manager.columns.push(table.get(column));
      }
    });
    manager.values = manager.createValues(newValues);
  } else {
    columnNames.forEach((column) => manager.columns.push(table.get(column)));
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
    Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName" | "quoteString"> & {
      schemaCache: { columnsHash(tableName: string): Promise<Record<string, unknown> | undefined> };
      supportsVirtualColumns?(): Promise<boolean> | boolean;
      defaultInsertValue?(column: unknown): unknown;
      lookupCastTypeFromColumn(column: unknown): { serialize(value: unknown): unknown };
    },
  fixtureSet: Record<string, Record<string, unknown>[]>,
): Promise<string[]> {
  return Promise.all(
    Object.entries(fixtureSet)
      .filter(([, fixtures]) => fixtures.length > 0)
      .map(([tableName, fixtures]) => buildFixtureSql.call(this, fixtures, tableName)),
  );
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
    if (this.currentTransaction().joinable) {
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
    if (this.supportsConcurrentConnections?.() && !this.currentTransaction().joinable) {
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
