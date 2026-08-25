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
import { exceedsBindParamsLimit } from "./database-limits.js";
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

/** @internal Set by `base.ts` at the bottom of its own module body — see the note there. */
let _base: typeof Base | undefined;

/** @internal */
export function _registerBase(base: typeof Base): void {
  _base = base;
}

function baseClass(): typeof Base {
  if (!_base) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return _base;
}

/**
 * A single entry in `Relation#explain`'s options list: a Ruby Symbol or String
 * flag (`":analyze"`, `"verbose"`). Rails' adapters render the list with a bare
 * `options.join` (`mysql/database_statements.rb:39`,
 * `postgresql/database_statements.rb:99`), so a Hash there would render as
 * `{:format=>"json"}.to_s.upcase` — a format is asked for as one more flag.
 *
 * Mirrors: the `options` array shape used by Rails'
 * `ActiveRecord::Relation#explain` and its adapter `build_explain_clause`.
 */
export type ExplainOption = string;

/**
 * Host interface for DatabaseStatements mixin methods that need adapter context.
 */
export interface DatabaseStatementsHost {
  preparedStatements?: boolean;
  /**
   * Mixed in from `AbstractAdapter` — Rails' `collector`
   * (abstract_adapter.rb:1176-1188), the `Composite` under prepared statements
   * and a `SubstituteBinds` without them.
   * @internal
   */
  collector?(): Collectors.Composite | Collectors.SubstituteBinds;
  /**
   * Mixed in from `Quoting` — the single Rails `type_casted_binds`
   * (quoting.rb:224). Payload producers must reach it through `this` so the
   * adapter's `type_cast` override applies.
   * @internal
   */
  typeCastedBinds(binds: unknown[] | null | undefined): unknown[] | undefined;
  /**
   * Mixed in from `AbstractAdapter` — the single `sql.active_record` payload
   * producer (abstract_adapter.rb:1134).
   * @internal
   */
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
  disableReferentialIntegrity?(fn: () => Promise<void>, tables?: string[]): Promise<void>;
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
  // Rails' host is an AbstractAdapter, whose @pool is a real ConnectionPool or
  // the NullPool assigned in initialize (abstract_adapter.rb:153) — never absent.
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
  /** @internal Re-entrancy guard for the queryTransformers loop in preprocessQuery. */
  _inQueryTransformers?: boolean;
}

/**
 * Base class for connection adapters that include DatabaseStatements.
 * The constructor resets the transaction state, mirroring Rails'
 * `DatabaseStatements#initialize` which calls `reset_transaction`.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements (initialize)
 */
export class DatabaseStatementsBase {
  /**
   * @missingRailsCall reset_transaction — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   abstract/database_statements.rb:12 is `reset_transaction` inside
   *   `initialize`; trails' DatabaseStatements is a mixin with no constructor of
   *   its own — the adapter's own constructor calls `resetTransaction()`
   *   (abstract-adapter.ts), so the call happens, just not from a body matched
   *   to this Ruby method.
   */
  constructor() {
    (this as any)._transactionManager = new TransactionManager(this as any);
  }
}

/**
 * Compile an Arel node to a SQL string with its bind values inlined via the
 * connection's own `quote`. Mirrors Rails' `to_sql` under
 * `unprepared_statement`, which compiles through a `SubstituteBinds` collector
 * (`abstract_adapter.rb#collector` when `!prepared_statements`):
 * `SubstituteBinds#add_bind` quotes each value during traversal via the
 * connection, so there is never a finished placeholder string to regex over.
 * Any path that produces a standalone SQL string with no companion bind array
 * (display SQL, statement-cache fallbacks) inlines this way, or an unbound `?`
 * would leak into executable SQL.
 */
function compileInlined(
  visitor: Visitors.ToSql,
  node: Nodes.Node,
  host: unknown,
): [string, boolean] {
  const collector = new Collectors.SubstituteBinds(
    host as { quote(value: unknown): string },
    new Collectors.SQLString(),
  );
  // Rails reads `allow_retry = collector.retryable` after the compile
  // (database_statements.rb:45), so the visitor can clear it mid-traversal.
  const sql = visitor.compile(node, collector);
  return [sql, collector.retryable];
}

/**
 * Converts an arel AST to SQL.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#to_sql
 */
export function toSql(
  this: DatabaseStatementsHost | void,
  arel: unknown,
  binds: unknown[] = [],
): string {
  if (typeof arel === "string") return arel;

  let node = arel;
  if (node && (node as any).ast != null && typeof (node as any).ast === "object") {
    node = (node as any).ast;
  }

  // Display / unprepared-statement SQL: inline the bind values, matching
  // Rails' `to_sql` under `unprepared_statement` (which compiles with a
  // SubstituteBinds collector). Raw Arel `Node#toSql`/`ToSql#compile` keeps
  // `?` for BindParams (Rails parity); this path substitutes them via the
  // adapter quoter, the same way `Relation#toSql` does. `toSqlAndBinds` uses
  // the Composite collector for execution (placeholders + bind array).
  const visitor = (this as any)?.visitor as Visitors.ToSql | undefined;
  if (visitor && node instanceof Nodes.Node) {
    const [inlinedSql] = compileInlined(visitor, node, this);
    return inlinedSql;
  }
  if (node && typeof (node as any).toSql === "function") {
    return (node as any).toSql();
  }

  const [sql] = toSqlAndBinds.call(this, arel, binds);
  return sql;
}

/**
 * Converts an arel AST to SQL and binds.
 *
 * When called on an adapter with an `arelVisitor`, uses that visitor to
 * compile Arel nodes (matching Rails' `visitor.compile(arel, collector)`).
 * Falls back to the node's own `toSql()` for standalone usage.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#to_sql_and_binds
 *
 * @internal
 */
export function toSqlAndBinds(
  this: DatabaseStatementsHost | void,
  arel: unknown,
  binds: unknown[] = [],
  preparable: boolean | null = null,
  allowRetry = false,
): [string, unknown[], boolean | null, boolean] {
  if (typeof arel === "string") {
    return [arel, binds, preparable, allowRetry];
  }

  // Arel::TreeManager -> Arel::Node (unwrap .ast)
  let node = arel;
  if (node && (node as any).ast != null && typeof (node as any).ast === "object") {
    node = (node as any).ast;
  }

  if (node instanceof Nodes.Node || (node && typeof (node as any).toSql === "function")) {
    if (binds.length > 0) {
      throw new Error(
        "Passing bind parameters with an arel AST is forbidden. " +
          "The values must be stored on the AST directly",
      );
    }
    const visitor = (this as any)?.visitor as Visitors.ToSql | undefined;
    if (visitor && node instanceof Nodes.Node) {
      // Rails: `if prepared_statements ... else sql = visitor.compile(arel, collector)`
      // (database_statements.rb:31-45). With prepared statements off the
      // collector is a `SubstituteBinds` (abstract_adapter.rb#collector), so
      // every value inlines during traversal, `binds` comes back empty and
      // `preparable` is never assigned. A host carrying no flag at all is not an
      // adapter (bare visitor stand-ins), and Rails' default is `true`, so only
      // an explicit `false` takes this branch.
      if ((this as { preparedStatements?: boolean } | undefined)?.preparedStatements === false) {
        const [inlinedSql, inlinedRetryable] = compileInlined(visitor, node, this);
        return [inlinedSql, [], preparable, inlinedRetryable];
      }
      const collector = (this as DatabaseStatementsHost).collector!() as Collectors.Composite;
      collector.retryable = true;
      collector.preparable = true;
      const [sql, extractedBinds] = visitor.compile(node, collector) as [string, unknown[]];
      const compiledAllowRetry = collector.retryable;
      const compiledPreparable = collector.preparable;
      // Rails hands the compiled binds on untouched — `ActiveModel::Attribute`
      // objects survive all the way to the adapter's `type_casted_binds`
      // (abstract/quoting.rb:224), which is where `value_for_database` is
      // read. Unwrapping here would drop the column type metadata the drivers
      // dispatch on, and would put primitives in the `sql.active_record`
      // payload's `binds` slot where Rails puts Attributes.
      // Mirrors Rails database_statements.rb:36-38: when the bind count exceeds
      // the adapter's parameter cap, recompile unprepared so every value inlines
      // via SubstituteBinds instead of overflowing the driver's variable limit.
      // Reachable now that multi-value `IN`/`NOT IN` build `HomogeneousIn` (real
      // binds) rather than an inlined `Arel::Nodes::In` of Quoted literals.
      if (
        exceedsBindParamsLimit(
          this as { preparedStatements?: boolean; bindParamsLength?(): number },
          extractedBinds.length,
        )
      ) {
        // Rails re-enters `to_sql_and_binds` under `unprepared_statement`
        // (database_statements.rb:36-38), so the retryable flag is the *inner*
        // compile's, not the abandoned prepared one's.
        const [overLimitSql, overLimitRetryable] = compileInlined(visitor, node, this);
        return [overLimitSql, [], false, overLimitRetryable];
      }
      return [sql, extractedBinds, compiledPreparable, compiledAllowRetry];
    }
    const sql = (node as any).toSql();
    return [sql, [], preparable, allowRetry];
  }

  throw new TypeError("Cannot convert to SQL");
}

/**
 * Returns a cacheable query object for use with StatementCache.
 * Uses prepared statements when enabled, otherwise partial queries.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#cacheable_query
 */
export function cacheableQuery(
  this: DatabaseStatementsHost | void,
  klass: {
    query?(sql: string): unknown;
    partialQuery?(parts: unknown): unknown;
    partialQueryCollector?(): unknown;
  },
  arel: unknown,
): [unknown, unknown[]] {
  const host = this as DatabaseStatementsHost;
  const visitor = (host as any)?.visitor as Visitors.ToSql | undefined;

  let node = arel;
  if (node && (node as any).ast != null && typeof (node as any).ast === "object") {
    node = (node as any).ast;
  }

  if (host?.preparedStatements && klass.query && visitor && node instanceof Nodes.Node) {
    const [sql, binds] = visitor.compile(node, host.collector!() as Collectors.Composite) as [
      string,
      unknown[],
    ];
    return [klass.query(sql), binds];
  }

  // Unprepared path: compile through PartialQueryCollector to produce
  // parts with Substitute slots, matching Rails' cacheable_query when
  // prepared_statements is false.
  if (klass.partialQueryCollector && klass.partialQuery && visitor && node instanceof Nodes.Node) {
    const collector = klass.partialQueryCollector() as { value: [unknown[], unknown[]] };
    const [parts, collectedBinds] = visitor.compile(node, collector);
    return [klass.partialQuery(parts), collectedBinds];
  }

  let sql: string;
  if (typeof arel === "string") {
    sql = arel;
  } else if (visitor && node instanceof Nodes.Node) {
    [sql] = compileInlined(visitor, node, host);
  } else {
    sql = (node as any).toSql?.() ?? String(node);
  }

  if (klass.partialQuery) {
    return [klass.partialQuery([sql]), []];
  }
  const queryObj = klass.query ? klass.query(sql) : sql;
  return [queryObj, []];
}

/**
 * Returns a single value via internal_exec_query.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#query_value
 */
export function queryValue(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<unknown> {
  return query.call(this, sql, name, binds).then((rows) => singleValueFromRows(rows));
}

/**
 * Returns first column of each row via internal_exec_query.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#query_values
 */
export function queryValues(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<unknown[]> {
  return query.call(this, sql, name, binds).then((rows) => rows.map((row) => row[0]));
}

/**
 * Executes a query and returns raw rows (arrays).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#query
 */
export async function query(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<unknown[][]> {
  // Dispatch through the instance so an adapter's internalExecQuery override
  // wins, as Ruby's virtual call does.
  const run = (this.internalExecQuery ?? internalExecQuery).bind(this);
  const result = await run(sql, name, binds);
  return result.rows;
}

/**
 * Executes a SQL statement and returns the raw result.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#execute
 */
export function execute(_sql: string, _binds?: unknown[], _name?: string | null): Promise<unknown> {
  throw new Error("execute must be implemented by adapter subclass");
}

/**
 * Executes a bulk INSERT statement.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#exec_insert_all
 */
export function execInsertAll(
  this: DatabaseStatementsHost & {
    internalExecQuery(sql: string, name?: string | null): Promise<Result>;
  },
  sql: string,
  name: string,
): Promise<Result> {
  return this.internalExecQuery(sql, name);
}

/**
 * Returns an EXPLAIN plan for the query. Must be overridden by adapters.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#explain
 */
export function explain(_arel: unknown, _binds?: unknown[], _options?: unknown[]): Promise<string> {
  throw new Error("explain must be implemented by adapter subclass");
}

/**
 * Executes a TRUNCATE statement.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#truncate
 */
export async function truncate(
  this: DatabaseStatementsHost & Pick<Quoting, "quoteTableName">,
  tableName: string,
  name: string | null = null,
): Promise<unknown> {
  const sql = (this.buildTruncateStatement ?? buildTruncateStatement).call(this, tableName);
  // Rails: execute(build_truncate_statement(table_name), name). Trails' execute
  // signature is (sql, binds, name), so the log label goes in the third slot.
  return (this.execute ?? execute).call(this, sql, [], name);
}

/**
 * Truncates multiple tables, skipping schema_migrations and ar_internal_metadata.
 *
 * Both names are sent bare (`database_statements.rb:222-223`), so a pool-less
 * adapter raises NoMethodError rather than truncating against hardcoded
 * defaults — Ruby's NullPool defines neither reader
 * (`abstract/connection_pool.rb:24-48`).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#truncate_tables
 */
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

  const statements = (this.buildTruncateStatements ?? buildTruncateStatements).call(this, filtered);

  const exec = this.execute ?? execute;
  const doTruncate = async () => {
    if (this.executeBatch) {
      await this.executeBatch(statements, "Truncate Tables");
    } else {
      for (const stmt of statements) {
        await exec.call(this, stmt);
      }
    }
  };

  if (this.disableReferentialIntegrity) {
    let executed = false;
    await this.disableReferentialIntegrity(async () => {
      executed = true;
      await doTruncate();
    }, filtered);
    if (!executed) await doTruncate();
  } else {
    await doTruncate();
  }
}

/**
 * Runs the given block in a database transaction.
 * Supports nested transactions via savepoints, isolation levels,
 * and the requires_new option.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#transaction
 */
export async function transaction<T>(
  this: DatabaseStatementsHost,
  block: (tx?: unknown) => Promise<T> | T,
  options: { requiresNew?: boolean; isolation?: string; joinable?: boolean } = {},
): Promise<T | undefined> {
  const { requiresNew, isolation, joinable = true } = options;

  // Ruby reads the open transaction back off the connection
  // (`current_transaction`, `transaction.rb:352-354`); trails holds it in
  // execution state, installed here so every block this method runs — however
  // the transaction below is opened — sees it as `ActiveRecord.current_transaction`.
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

/**
 * The transaction manager for this connection.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#transaction_manager
 */
export function transactionManager(this: DatabaseStatementsHost): TransactionManager | null {
  return (this as any)._transactionManager ?? null;
}

/**
 * Resets the transaction manager, discarding any open transactions.
 * When called with a callback, saves the current manager (if restorable),
 * yields to the callback in a fresh transaction context, then restores.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#reset_transaction
 */
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
      // Reconfigure the connection without any transaction state in the way.
      // Mirrors Rails: the old state is swapped back only after the block
      // succeeds (no `ensure`); if it raises, the fresh manager stays in place.
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

/**
 * Marks the current transaction as written if the SQL is a write query.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#mark_transaction_written_if_write
 */
export function markTransactionWrittenIfWrite(this: DatabaseStatementsHost, sql: string): void {
  const txn = this.currentTransaction?.();
  if (txn?.open) {
    if (this.isWriteQuery?.(sql)) {
      txn.written = true;
    }
  }
}

/**
 * Whether a transaction is currently open.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#transaction_open?
 */
export function isTransactionOpen(this: DatabaseStatementsHost): boolean {
  const txn = this.currentTransaction?.();
  return txn?.open ?? false;
}

/**
 * Register a record with the current transaction for after_commit/after_rollback.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#add_transaction_record
 */
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

/**
 * Begins the database transaction. No-op in abstract base; adapters override.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#begin_db_transaction
 */
export async function beginDbTransaction(): Promise<void> {}

/**
 * Begins a deferred transaction, optionally with an isolation level.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#begin_deferred_transaction
 */
export async function beginDeferredTransaction(
  this: DatabaseStatementsHost | void,
  isolationLevel?: string,
): Promise<void> {
  const host = this as DatabaseStatementsHost;
  if (isolationLevel) {
    // Rails passes the level name straight through (database_statements.rb:412-418);
    // the adapters do the `transaction_isolation_levels.fetch` themselves.
    return host?.beginIsolatedDbTransaction
      ? host.beginIsolatedDbTransaction.call(host, isolationLevel)
      : beginIsolatedDbTransaction.call(this, isolationLevel);
  }
  return host?.beginDbTransaction
    ? host.beginDbTransaction.call(host)
    : beginDbTransaction.call(this);
}

/**
 * Returns a map of transaction isolation level names to SQL strings.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#transaction_isolation_levels
 */
export function transactionIsolationLevels(): Record<string, string> {
  return {
    read_uncommitted: "READ UNCOMMITTED",
    read_committed: "READ COMMITTED",
    repeatable_read: "REPEATABLE READ",
    serializable: "SERIALIZABLE",
  };
}

/**
 * Begins a transaction with the given isolation level. Raises by default.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#begin_isolated_db_transaction
 */
export async function beginIsolatedDbTransaction(
  this: DatabaseStatementsHost | void,
  _isolation: string,
): Promise<void> {
  throw new TransactionIsolationError("adapter does not support setting transaction isolation");
}

/**
 * Hook called after an isolated transaction commits/rolls back.
 * No-op in most adapters; SQLite overrides to reset connection-level isolation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#reset_isolation_level
 */
export function resetIsolationLevel(): void {}

/**
 * Commits the database transaction. No-op in abstract base.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#commit_db_transaction
 */
export async function commitDbTransaction(): Promise<void> {}

/**
 * Rolls back the database transaction.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#rollback_db_transaction
 */
export async function rollbackDbTransaction(this: DatabaseStatementsHost | void): Promise<void> {
  const host = this as DatabaseStatementsHost;
  await (host?.execRollbackDbTransaction
    ? host.execRollbackDbTransaction.call(host)
    : execRollbackDbTransaction.call(this));
}

/**
 * Executes the ROLLBACK SQL. No-op in abstract base.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#exec_rollback_db_transaction
 */
export async function execRollbackDbTransaction(): Promise<void> {}

/**
 * Restarts the database transaction (ROLLBACK + BEGIN).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#restart_db_transaction
 */
export async function restartDbTransaction(this: DatabaseStatementsHost | void): Promise<void> {
  const host = this as DatabaseStatementsHost;
  await (host?.execRestartDbTransaction
    ? host.execRestartDbTransaction.call(host)
    : execRestartDbTransaction.call(this));
}

/**
 * Executes the transaction restart SQL. No-op in abstract base.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#exec_restart_db_transaction
 */
export async function execRestartDbTransaction(): Promise<void> {}

/**
 * Rolls back to a savepoint.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#rollback_to_savepoint
 */
export async function rollbackToSavepoint(
  this: DatabaseStatementsHost | void,
  name?: string,
): Promise<void> {
  const host = this as any;
  if (host?.execRollbackToSavepoint) {
    await host.execRollbackToSavepoint(name);
  }
}

/**
 * Returns the default sequence name for a table/column pair.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#default_sequence_name
 */
export function defaultSequenceName(_table: string, _column: string): string | null {
  return null;
}

/**
 * Resets the sequence to the max value for the column. No-op by default.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#reset_sequence!
 */
export async function resetSequenceBang(
  _table: string,
  _column: string,
  _sequence?: string | null,
): Promise<void> {}

/**
 * Inserts a single fixture row into a table.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#insert_fixture
 */
export async function insertFixture(
  this: DatabaseStatementsHost & Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName">,
  fixture: Record<string, unknown>,
  tableName: string,
): Promise<unknown> {
  const columns = Object.keys(fixture);

  // Rails' build_fixture_sql serializes each value through the column's cast
  // type before quoting (`with_yaml_fallback(type.serialize(value))`), so e.g.
  // a JS array bound for a PG `text[]` column becomes a `{...}` array literal
  // rather than a raw JSON dump. Look up the column types when the adapter
  // exposes the schema; fall back to the plain quote path otherwise (keeps
  // bare hosts without `columns`/`lookupCastTypeFromColumn` working).
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
      // Rails: with_yaml_fallback(type.serialize(value)). The fallback is a
      // no-op for the wire forms real types produce (strings, numbers, the
      // OID::Array `Data` wrapper) and only YAML-dumps a type whose serialize
      // returns a raw Hash/Array.
      return this.quote(withYamlFallback(type.serialize(v)));
    }
    return this.quote(withYamlFallback(v));
  });

  const emptyValue = this.emptyInsertStatementValue?.() ?? emptyInsertStatementValue();
  const sql =
    columns.length > 0
      ? `INSERT INTO ${this.quoteTableName(tableName)} (${columns.map((c) => this.quoteColumnName(c)).join(", ")}) VALUES (${values.join(", ")})`
      : `INSERT INTO ${this.quoteTableName(tableName)} ${emptyValue}`;

  // Rails: execute(build_fixture_sql(...), "Fixture Insert"). Trails' execute
  // signature is (sql, binds, name), so the log label goes in the third slot.
  return (this.execute ?? execute).call(this, sql, [], "Fixture Insert");
}

/**
 * Inserts a set of fixtures into tables, wrapped in a transaction.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#insert_fixtures_set
 */
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

  const affectedTables = [...new Set([...Object.keys(fixtureSet), ...tablesToDelete])];

  // Rails wraps fixture loading in a transaction with requires_new: true
  const doLoadInTransaction = async () => {
    if (this.disableReferentialIntegrity) {
      let executed = false;
      await this.disableReferentialIntegrity(async () => {
        executed = true;
        await doInserts();
      }, affectedTables);
      if (!executed) await doInserts();
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

/**
 * Returns the default empty INSERT value.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#empty_insert_statement_value
 */
export function emptyInsertStatementValue(_primaryKey?: string | null): string {
  return "DEFAULT VALUES";
}

/**
 * Sanitizes a LIMIT value to prevent SQL injection.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#sanitize_limit
 */
export function sanitizeLimit(limit: unknown): number | Nodes.SqlLiteral {
  if ((typeof limit === "number" && Number.isInteger(limit)) || limit instanceof Nodes.SqlLiteral) {
    return limit;
  }
  // Ruby's `Integer(limit)` (database_statements.rb:512): a String parses with
  // base detection, a Float truncates toward zero, and anything else raises —
  // ArgumentError for a String Ruby cannot parse (which is what the SQL-injection
  // strings in `base_test.rb:187-205` hit), TypeError for a value that has no
  // integer conversion at all.
  if (typeof limit === "string") {
    return integerFromString(limit);
  }
  if (typeof limit === "number") {
    if (!Number.isFinite(limit)) throw new FloatDomainError(String(limit));
    return Math.trunc(limit);
  }
  throw new TypeError(`can't convert ${rubyClassName(limit)} into Integer`);
}

/**
 * Ruby's `Integer(str)` with base 0: an optional sign, then a `0x`/`0b`/`0o`/`0d`
 * radix prefix (a bare leading `0` meaning octal, so `Integer("012") # => 10`),
 * with `_` allowed between digits. Anything else raises ArgumentError.
 */
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

/**
 * Ruby core's `FloatDomainError` (a `RangeError` subclass) — what
 * `Integer(Float::NAN)` / `Integer(Float::INFINITY)` raise, message `"NaN"` /
 * `"Infinity"`. Spelled locally rather than exported: it is reachable only
 * through `Integer()`'s Float arm, as in Ruby.
 */
class FloatDomainError extends globalThis.RangeError {
  constructor(message: string) {
    super(message);
    this.name = "FloatDomainError";
  }
}

/**
 * The name Ruby's `TypeError` message uses for an unconvertible value:
 * `nil`/`true`/`false` render as themselves, everything else as its class
 * (`can't convert Array into Integer`).
 */
function rubyClassName(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "boolean") return String(value);
  return (value as object)?.constructor?.name ?? typeof value;
}

/**
 * Converts Array/object fixture values to JSON strings, passes scalars through.
 * Rails uses YAML.dump; we use JSON.stringify as the TS equivalent.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#with_yaml_fallback
 */
export function withYamlFallback(value: unknown): unknown {
  // Rails (database_statements.rb:519-525) YAML-dumps only Hash and Array
  // values; scalars and every other object pass through to be quoted
  // directly. Mirror that by dumping only arrays and plain (Hash-like)
  // objects — never class instances such as Date/Temporal or the `Data`
  // wrapper returned by OID::Array#serialize, which carry their own
  // quotable representation and must reach quote() intact.
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) return JSON.stringify(value);
  }
  return value;
}

/**
 * Returns an Arel SQL literal for CURRENT_TIMESTAMP with the highest
 * available precision. Adapters may override for higher precision.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#high_precision_current_timestamp
 */
export function highPrecisionCurrentTimestamp(): Nodes.SqlLiteral {
  return arelSql("CURRENT_TIMESTAMP");
}

/**
 * Executes a raw query and returns an ActiveRecord::Result.
 * Delegates to rawExecute + castResult.
 *
 * No `log` of its own: Rails' `raw_exec_query` is `cast_result(raw_execute(...))`
 * (database_statements.rb:541-543), and `raw_execute` is what wraps the query in
 * `log` — a second wrap here would emit `sql.active_record` twice.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#raw_exec_query
 */
export async function rawExecQuery(
  this: DatabaseStatementsHost,
  sql: string,
  name: string | null = null,
  binds?: unknown[],
  // Ruby's `raw_exec_query(...)` forwards EVERY argument, so `raw_execute`'s
  // kwargs reach it (database_statements.rb:541-542,552). trails' `rawExecute`
  // spells those kwargs positionally, so they are collected here and spread
  // there — a caller that omits the bag gets Rails' defaults.
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
  // Rails is `cast_result(raw_execute(...))` and nothing else
  // (abstract/database_statements.rb:540-542): `raw_execute` is the single
  // logging site (`:553`) and materializes through `with_raw_connection`
  // (`:555`), so wrapping it again here would emit two `sql.active_record`
  // events for one query.
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

/**
 * Executes a query via internal_execute and returns an ActiveRecord::Result.
 * Delegates to internalExecute + castResult.
 *
 * Like `rawExecQuery` above, this leaves logging to `raw_execute`, which
 * `internal_execute` reaches (database_statements.rb:546-548, :588-591) — the
 * `log` rescue's `set_query` included, so a translated StatementInvalid still
 * carries its query for the one host shape this body serves (an adapter that
 * overrides `internalExecute` but not `internalExecQuery`).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#internal_exec_query
 */
export async function internalExecQuery(
  this: DatabaseStatementsHost,
  sql: string,
  name: string | null = "SQL",
  binds?: unknown[],
  options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
): Promise<Result> {
  // Rails is `cast_result(internal_execute(...))` and nothing else
  // (abstract/database_statements.rb:545-547). `internal_execute` reaches
  // `raw_execute` (`:588-591` → `:552-558`), which both logs (`:553`) and
  // materializes through `with_raw_connection` (`:555`) — including the `log`
  // rescue's `set_query`, so neither belongs here.
  if (this?.internalExecute) {
    // Thread binds and exec options through so a bound INSERT ... RETURNING
    // reaches the driver and allow_retry / materialize_transactions survive
    // (Rails internal_exec_query(...) → internal_execute(...) → raw_execute).
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

// ---------------------------------------------------------------------------
// Module object
//
// Rails' `include DatabaseStatements` — applied to AbstractAdapter (and
// the test SchemaAdapter) via activesupport's `include()` helper. The
// bodies delegate to the adapter's `execute` / `executeMutation`
// primitives, matching Rails' pattern where module methods call down
// into the adapter's `internal_exec_query` / `exec_query` layer.
//
// The file-level `export function` surface above models the Rails
// DatabaseStatements module for standalone / utility use by adapters.
// Most of those functions already provide default behavior by
// delegating through the host adapter (e.g. `selectOne`, `selectRows`,
// `execQuery`, `execInsertAll`); only the adapter-specific primitives
// (`selectAll`, `execute`, `isWriteQuery`, `explain`) remain subclass
// responsibilities and throw if called unbound. The module object
// below is the concrete default set mixed onto AbstractAdapter's
// prototype via `include()`.
// ---------------------------------------------------------------------------

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

/**
 * Shared body for `DatabaseStatements.insert` and its `create` alias.
 *
 * Rails' `alias create insert` copies the *original* insert body, so after
 * `dirties_query_cache` wraps both methods, calling `create` clears the query
 * cache once (its own wrapper) then runs this unwrapped body directly — it
 * never re-enters the wrapped `insert`. Assigning this same function to both
 * `insert` and `create` reproduces that single-clear semantics; dispatching
 * `create` through `this.insert(...)` would clear the cache a second time.
 *
 * @internal
 */
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
  // Ruby's `id_value || last_inserted_id(value)` (database_statements.rb:205)
  // falls through only on nil/false, so a caller-supplied id of 0 is kept.
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
    // Rails: `arel = arel_from_relation(arel)` then `sql, binds, preparable,
    // allow_retry = to_sql_and_binds(...)` (database_statements.rb:69-71) — a
    // SQL string passes through both unchanged, an Arel manager compiles here.
    arel = arelFromRelation(arel);
    const [sql, compiledBinds, compiledPreparable, compiledAllowRetry] = toSqlAndBinds.call(
      this as DatabaseStatementsHost,
      arel,
      binds ?? [],
      opts?.preparable ?? null,
      opts?.allowRetry ?? false,
    );
    binds = compiledBinds;
    // Rails' select_all passes `prepare: prepared_statements && preparable`
    // (database_statements.rb:73), where `preparable` is the Arel collector's flag
    // threaded through compile → _compileSelectSql → opts.preparable.
    // Callers that don't supply opts.preparable fall back to bind presence, which
    // is correct for every shape that carries binds.
    const preparable = compiledPreparable ?? (binds != null && binds.length > 0);
    const prepare = !!((this as { preparedStatements?: boolean }).preparedStatements && preparable);
    const async = opts?.async ?? false;
    try {
      const result = select.call(this as DatabaseStatementsHost, sql, name, binds, {
        prepare,
        async: async && FutureResult.SelectAll,
        allowRetry: compiledAllowRetry,
      });
      // A FutureResult carries the ::RangeError rescue itself
      // (FutureResult::SelectAll, future_result.rb:172-179 — which is why Rails
      // has that subclass), so it passes straight through. Every other arm of
      // `select` hands back a promise, and Ruby's one rescue clause has to cover
      // its rejection as well as the synchronous throw the `catch` below takes.
      if (result instanceof FutureResult || result instanceof FutureResultComplete) return result;
      return result.catch((e) => {
        if (e instanceof ActiveModelRangeError || e instanceof ARRangeError)
          return Result.empty({ async });
        throw e;
      });
    } catch (e) {
      // Mirrors: database_statements.rb:78-79 — rescue ::RangeError →
      // Result.empty(async: async). Ruby ::RangeError covers both
      // ActiveModel::RangeError (type-level, client-side) and
      // ActiveRecord::RangeError (adapter-level, server-side wire rejection).
      //
      // Resolved rather than returned bare: select_one/select_rows call `#then`
      // on whatever select_all returns (database_statements.rb:85,102), which in
      // Ruby every object answers via Kernel#then. A TS `Result` deliberately
      // does NOT define `then` — a thenable Result would be adopted by every
      // `await` in the codebase — so this arm is wrapped to keep `then` uniform
      // across select_all's return, exactly as Ruby's is.
      if (e instanceof ActiveModelRangeError || e instanceof ARRangeError)
        return Promise.resolve(Result.empty({ async }));
      throw e;
    }
  },

  // select_one/value/values/rows delegate to select_all so the QueryCache
  // mixin's cached `selectAll` override is the single cached entry point —
  // mirroring Rails, where these all funnel through `select_all`.
  // Ruby's select_one/select_value/select_values/select_rows are ordinary
  // methods that call `#then` on select_all's return and hand the chained value
  // straight back (database_statements.rb:84-102) — nothing is resolved at this
  // layer. Declaring them `async` here would `await` that return, and since a
  // FutureResult is a thenable, the pending handle would be resolved away
  // before the caller ever saw it. They are plain methods for the same reason
  // `select`/`select_all` are.
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

  // Rails: `alias create insert` — see `insertStatement` for why both reference
  // the same unwrapped function rather than `create` delegating to `this.insert`.
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

  // Standalone helpers wired into the host so include(AbstractAdapter, DatabaseStatements)
  // credits them to the host class (mirrors Rails' `include DatabaseStatements`).
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
/**
 * The `log` block here is where `sql.active_record` is emitted for the whole
 * query path (database_statements.rb:554), and `perform_query` reports
 * `row_count` / `statement_name` back by mutating the yielded payload.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#raw_execute
 *
 * @internal
 */
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

/**
 * Lowest-level query dispatch. Adapter subclasses must override.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#perform_query
 * @internal
 */
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

/**
 * Checks write guards, marks the transaction written, and applies the global
 * `queryTransformers` (e.g. `QueryLogs`) before the SQL is executed and
 * instrumented — mirroring Rails'
 * `ActiveRecord.query_transformers.each { |t| sql = t.call(sql, self) }`.
 *
 * Concrete adapters call this at the top of `execute`/`executeMutation`, so the
 * `sql.active_record` notification payload carries the post-transform
 * (commented) SQL — the Rails-faithful ordering where `preprocess_query` runs
 * in `internal_execute`, before `raw_execute`'s `log` block.
 *
 * `_inQueryTransformers` short-circuits a synchronous re-entrant call (a
 * transformer that itself runs SQL). It is set and cleared **within one
 * synchronous stretch**, so it can never span an await boundary and bleed into
 * a concurrent query on the same adapter; real, async, DB-issuing transformers
 * don't hit it — by the time their query runs the flag is already cleared, so
 * they transform normally, exactly as in Rails (which has no guard at all).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#preprocess_query
 * @internal
 */
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

/**
 * Preprocesses then delegates to rawExecute with the native connection.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#internal_execute
 * @internal
 */
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

/**
 * Executes each statement sequentially. Adapters with native batch support
 * (e.g. a driver that accepts a multi-statement string) should override this.
 *
 * Going through `raw_execute` rather than `internal_execute` is what leaves
 * batch statements uncommented — `preprocess_query`, which runs the
 * query_transformers, is `internal_execute`'s step
 * (abstract/database_statements.rb:589-591).
 *
 * The positional arguments below are `raw_execute`'s own defaults
 * (abstract/database_statements.rb:552).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#execute_batch
 * (abstract/database_statements.rb:594-598)
 * @internal
 */
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

/**
 * SQL fragment used when no value is supplied for a column in a fixture insert.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#default_insert_value
 * @internal
 */
export function defaultInsertValue(_column: unknown): Nodes.SqlLiteral {
  return arelSql("DEFAULT");
}

/**
 * Builds an INSERT SQL string for a set of fixture rows using an Arel
 * InsertManager, matching Rails' column-ordering and single-row DEFAULT-strip
 * behaviour as closely as possible without a schema cache.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#build_fixture_sql
 * @internal
 */
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

  // Collect the union of all column names across fixtures (preserving
  // insertion order via Set, matching Rails' schema_cache column order
  // as closely as possible without a schema cache).
  const allColumns = [...new Set(fixtures.flatMap((f) => Object.keys(f)))];
  if (allColumns.length === 0) {
    const emptyValue = this.emptyInsertStatementValue?.() ?? emptyInsertStatementValue();
    return `INSERT INTO ${this.quoteTableName(tableName)} ${emptyValue}`;
  }

  // Pre-quote values through the adapter's quote() so that Temporal types,
  // MySQL-specific escaping, and the JS Date guard in Quoting#quote() are all
  // respected — matching Rails, where the visitor calls @conn.quote(value).
  // The DEFAULT sentinel is an SqlLiteral; identity-check against it to detect
  // missing columns in the single-row path.
  const DEFAULT_VALUE = arelSql("DEFAULT");
  const table = new Table(tableName);
  const manager = new InsertManager(table);

  const valuesList = fixtures.map((fixture) =>
    allColumns.map((col) =>
      col in fixture ? arelSql(this.quote(withYamlFallback(fixture[col]))) : DEFAULT_VALUE,
    ),
  );

  if (valuesList.length === 1) {
    // Single-row: strip DEFAULT columns so the DB fills them from its own
    // defaults, matching Rails' single-row optimisation exactly.
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

  // Compile via the adapter's Arel visitor when available (matches Rails'
  // `visitor.compile(manager.ast)`). When arelVisitor is absent (e.g.
  // SchemaAdapter/TestAdapter), construct one from this adapter so identifier
  // quoting is dialect-correct rather than using the global default quoter.
  const visitor =
    ((this as any)?.visitor as Visitors.ToSql | undefined) ??
    new Visitors.ToSql(this as unknown as Visitors.ArelConnection);
  return visitor.compile(manager.ast);
}

/**
 * Returns an INSERT SQL string for each non-empty table in the fixture set.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#build_fixture_statements
 * @internal
 */
export function buildFixtureStatements(
  this: DatabaseStatementsHost &
    Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName" | "quoteString">,
  fixtureSet: Record<string, Record<string, unknown>[]>,
): string[] {
  return Object.entries(fixtureSet)
    .filter(([, fixtures]) => fixtures.length > 0)
    .map(([tableName, fixtures]) => buildFixtureSql.call(this, fixtures, tableName));
}

/**
 * Returns a TRUNCATE TABLE statement for the given table.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#build_truncate_statement
 * @internal
 */
export function buildTruncateStatement(
  this: Pick<Quoting, "quoteTableName">,
  tableName: string,
): string {
  return `TRUNCATE TABLE ${this.quoteTableName(tableName)}`;
}

/**
 * Returns TRUNCATE TABLE statements for each table name.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#build_truncate_statements
 * @internal
 */
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

/**
 * Joins an array of SQL statements with ";\n".
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#combine_multi_statements
 * @internal
 */
export function combineMultiStatements(totalSql: string[]): string {
  return totalSql.join(";\n");
}

/**
 * Executes a SELECT and returns an ActiveRecord::Result.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#select
 * @internal
 */
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
      // Ruby's `execute!` is an ordinary blocking call, so by the time this
      // branch returns the query has already run on the calling thread and the
      // future_result is complete (database_statements.rb:685-689). That is the
      // entire point of the branch: it is taken precisely when the connection
      // CANNOT be used concurrently, so the query has to finish before anything
      // else touches it. Discarding the promise would leave the query in flight
      // and let a synchronously-issued sibling query interleave on that same
      // connection — the race the branch exists to prevent. JS cannot block, so
      // "already complete on return" becomes the promise the caller settles.
      return futureResult.executeBang(this as FutureResultConnection).then(() => futureResult);
    }
  } else {
    // Dispatch through the instance so an adapter's internalExecQuery override
    // wins, as Ruby's virtual call does.
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

/** The `FutureResult::SelectAll`-shaped constructor `select` receives as `async`. */
type FutureResultClass = new (
  pool: FutureResultPool,
  args: unknown[],
  kwargs: Record<string, unknown>,
) => FutureResult;

/**
 * Ruby reads `current_transaction.joinable?` directly; trails' host type makes
 * both the manager accessor and the predicate optional, and `joinable` is a
 * getter on Transaction but a method on some hosts.
 */
function currentTransactionJoinable(host: DatabaseStatementsHost): boolean {
  const txn = host.currentTransaction?.();
  const joinable = txn?.joinable;
  return typeof joinable === "function" ? joinable.call(txn) : joinable === true;
}

/**
 * Appends a RETURNING clause when the adapter supports it, then returns [sql, binds].
 *
 * Async where Ruby is sync: `supports_insert_returning?` and `primary_key` are
 * plain predicates in Ruby (a constant and a schema-cache read) but both are
 * async here, and an un-awaited Promise is always truthy — so a sync body would
 * append RETURNING on every backend.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#sql_for_insert
 * @internal
 */
export async function sqlForInsert(
  this: DatabaseStatementsHost,
  sql: string,
  pk: string | false | null | undefined,
  binds: unknown[],
  returning: string[] | null | undefined,
): Promise<[string, unknown[]]> {
  if (await this.supportsInsertReturning?.()) {
    // Mirrors Rails: `pk == false` is the explicit caller opt-out — skip
    // any pk-derived RETURNING column (caller may still pass `returning:`
    // for an alternate column list).
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

/**
 * Returns the id of the last inserted row from a result.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#last_inserted_id
 * @internal
 */
export function lastInsertedId(result: Result): unknown {
  return singleValueFromRows(result.rows);
}

/**
 * Extracts the inserted column values from a RETURNING result.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#returning_column_values
 * @internal
 */
export function returningColumnValues(this: DatabaseStatementsHost, result: Result): unknown[] {
  return [singleValueFromRows(result.rows)];
}

/**
 * Returns the Arel AST for a Relation, or the value as-is if it is already an AST node.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#arel_from_relation
 * @internal
 */
export function arelFromRelation(relation: unknown): unknown {
  if (relation != null && typeof (relation as any).arel === "function") {
    return (relation as any).arel();
  }
  return relation;
}

/**
 * Extracts the table name from an INSERT SQL string for RETURNING clause resolution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#extract_table_ref_from_insert_sql
 * @internal
 */
export function extractTableRefFromInsertSql(
  this: DatabaseStatementsHost,
  sql: string,
): string | null {
  const match = sql.match(/into\s("[ A-Za-z0-9_."[\]]+"|[A-Za-z0-9_.[\]"]+)\s*/im);
  if (!match) return null;
  return match[1].replace(/"/g, "").trim();
}
