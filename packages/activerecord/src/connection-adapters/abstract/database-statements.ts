/**
 * Database statements — query execution interface.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements
 */

import { sql as arelSql, Nodes, Visitors } from "@blazetrails/arel";
import { Notifications } from "@blazetrails/activesupport";
import { TransactionIsolationError } from "../../errors.js";
import { quote, quoteTableName, quoteColumnName } from "./quoting.js";
import { TransactionManager } from "./transaction.js";
import { Result } from "../../result.js";

/**
 * Host interface for DatabaseStatements mixin methods that need adapter context.
 */
export interface DatabaseStatementsHost {
  preparedStatements?: boolean;
  execute?(sql: string, name?: string | null): Promise<unknown>;
  selectAll?(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  internalExecute?(sql: string, name?: string, binds?: unknown[]): Promise<unknown>;
  rawExecute?(sql: string, name?: string, binds?: unknown[]): Promise<unknown>;
  castResult?(rawResult: unknown): Result;
  affectedRows?(rawResult: unknown): number;
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
  executeBatch?(statements: string[], name?: string): Promise<void>;
  beginDbTransaction?(): Promise<void>;
  beginIsolatedDbTransaction?(isolation: string): Promise<void>;
  commitDbTransaction?(): Promise<void>;
  rollbackDbTransaction?(): Promise<void>;
  execRollbackDbTransaction?(): Promise<void>;
  execRestartDbTransaction?(): Promise<void>;
  resetIsolationLevel?(): void | Promise<void>;
  emptyInsertStatementValue?(pk?: string | null): string;
  transaction?<T>(fn: (tx?: unknown) => Promise<T> | T, opts?: unknown): Promise<T | undefined>;
  pool?: { schemaMigration?: { tableName: string }; internalMetadata?: { tableName: string } };
}

// --- Query conversion ---

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

  // Unwrap TreeManager → Node
  let node = arel;
  if (node && (node as any).ast != null && typeof (node as any).ast === "object") {
    node = (node as any).ast;
  }

  // Use compile() (inlines values) for display SQL, matching Rails'
  // to_sql under unprepared_statement. toSqlAndBinds uses
  // compileWithBinds for execution (placeholders + bind array).
  const visitor = (this as any)?.arelVisitor as Visitors.ToSql | undefined;
  if (visitor && node instanceof Nodes.Node) {
    return visitor.compile(node);
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

  // Arel node — compile via adapter visitor when available, else generic toSql()
  if (node instanceof Nodes.Node || (node && typeof (node as any).toSql === "function")) {
    if (binds.length > 0) {
      throw new Error(
        "Passing bind parameters with an arel AST is forbidden. " +
          "The values must be stored on the AST directly",
      );
    }
    const visitor = (this as any)?.arelVisitor as Visitors.ToSql | undefined;
    if (visitor && node instanceof Nodes.Node) {
      const [sql, extractedBinds] = visitor.compileWithBinds(node);
      // Type-cast bind objects (QueryAttribute) to primitive values
      // for adapter execution, matching Rails' type_casted_binds
      const castedBinds = extractedBinds.map((b) => {
        if (
          b &&
          typeof b === "object" &&
          "valueForDatabase" in b &&
          typeof (b as Record<string, unknown>).valueForDatabase === "function"
        ) {
          return (b as { valueForDatabase(): unknown }).valueForDatabase();
        }
        return b;
      });
      return [sql, castedBinds, preparable, allowRetry];
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
  const visitor = (host as any)?.arelVisitor as Visitors.ToSql | undefined;

  // Unwrap TreeManager → Node
  let node = arel;
  if (node && (node as any).ast != null && typeof (node as any).ast === "object") {
    node = (node as any).ast;
  }

  // Prepared path: compile with bind extraction, return Query + raw binds
  if (host?.preparedStatements && klass.query && visitor && node instanceof Nodes.Node) {
    const [sql, binds] = visitor.compileWithBinds(node);
    return [klass.query(sql), binds];
  }

  // Unprepared path: compile through PartialQueryCollector to produce
  // parts with Substitute slots, matching Rails' cacheable_query when
  // prepared_statements is false.
  if (klass.partialQueryCollector && klass.partialQuery && visitor && node instanceof Nodes.Node) {
    const collector = klass.partialQueryCollector() as {
      value: [unknown[], unknown[]];
    };
    visitor.compileWithCollector(node, collector);
    const [parts, collectedBinds] = collector.value;
    return [klass.partialQuery(parts), collectedBinds];
  }

  // Fallback: compile to SQL string
  let sql: string;
  if (typeof arel === "string") {
    sql = arel;
  } else if (visitor && node instanceof Nodes.Node) {
    sql = visitor.compile(node);
  } else {
    sql = (node as any).toSql?.() ?? String(node);
  }

  if (klass.partialQuery) {
    return [klass.partialQuery([sql]), []];
  }
  const queryObj = klass.query ? klass.query(sql) : sql;
  return [queryObj, []];
}

// --- Query execution ---

/**
 * Returns rows as record hashes.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#select_all
 */
export function selectAll(sql: string, _name?: string | null, _binds?: unknown[]): Promise<Result> {
  throw new Error("selectAll must be implemented by adapter subclass");
}

/**
 * Returns a single record hash.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#select_one
 */
export async function selectOne(
  this: DatabaseStatementsHost | void,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<Record<string, unknown> | undefined> {
  const doSelect = (this as DatabaseStatementsHost)?.selectAll ?? selectAll;
  const result = await doSelect(sql, name, binds);
  return result.first();
}

/**
 * Returns a single value from the first row/column.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#select_value
 */
export function selectValue(
  this: DatabaseStatementsHost | void,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<unknown> {
  return selectRows.call(this, sql, name, binds).then((rows) => singleValueFromRows(rows));
}

/**
 * Returns an array of the first column values.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#select_values
 */
export function selectValues(
  this: DatabaseStatementsHost | void,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<unknown[]> {
  return selectRows.call(this, sql, name, binds).then((rows) => rows.map((row) => row[0]));
}

/**
 * Returns an array of arrays (rows of column values).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#select_rows
 */
export async function selectRows(
  this: DatabaseStatementsHost | void,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<unknown[][]> {
  const doSelect = (this as DatabaseStatementsHost)?.selectAll ?? selectAll;
  const result = await doSelect(sql, name, binds);
  return result.rows;
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
  const result = await internalExecQuery.call(this, sql, name ?? "SQL", binds);
  return result.rows;
}

/**
 * Determines whether the SQL statement is a write query.
 * Must be overridden by adapter subclasses.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#write_query?
 */
export function isWriteQuery(_sql: string): boolean {
  throw new Error("isWriteQuery must be implemented by adapter subclass");
}

/**
 * Executes a SQL statement and returns the raw result.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#execute
 */
export function execute(_sql: string, _name?: string | null): Promise<unknown> {
  throw new Error("execute must be implemented by adapter subclass");
}

/**
 * Executes a query with binds and returns an ActiveRecord::Result.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#exec_query
 */
export function execQuery(
  this: DatabaseStatementsHost | void,
  sql: string,
  name: string = "SQL",
  binds: unknown[] = [],
): Promise<Result> {
  return internalExecQuery.call(this as DatabaseStatementsHost, sql, name, binds);
}

/**
 * Executes an INSERT statement.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#exec_insert
 */
export function execInsert(
  this: DatabaseStatementsHost | void,
  sql: string,
  name?: string | null,
  binds: unknown[] = [],
): Promise<Result> {
  return internalExecQuery.call(this as DatabaseStatementsHost, sql, name ?? "SQL", binds);
}

/**
 * Executes a DELETE statement and returns the number of affected rows.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#exec_delete
 */
export async function execDelete(
  this: DatabaseStatementsHost | void,
  sql: string,
  name?: string | null,
  binds: unknown[] = [],
): Promise<number> {
  const host = this as DatabaseStatementsHost;
  if (host?.internalExecute) {
    const result = await host.internalExecute(sql, name ?? "SQL", binds);
    return host.affectedRows ? host.affectedRows(result) : (result as number);
  }
  if (binds.length > 0) {
    throw new Error("execDelete requires internalExecute on the adapter when binds are provided");
  }
  const doExecute = host?.execute ?? execute;
  return doExecute(sql) as Promise<number>;
}

/**
 * Executes an UPDATE statement and returns the number of affected rows.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#exec_update
 */
export async function execUpdate(
  this: DatabaseStatementsHost | void,
  sql: string,
  name?: string | null,
  binds: unknown[] = [],
): Promise<number> {
  const host = this as DatabaseStatementsHost;
  if (host?.internalExecute) {
    const result = await host.internalExecute(sql, name ?? "SQL", binds);
    return host.affectedRows ? host.affectedRows(result) : (result as number);
  }
  if (binds.length > 0) {
    throw new Error("execUpdate requires internalExecute on the adapter when binds are provided");
  }
  const doExecute = host?.execute ?? execute;
  return doExecute(sql) as Promise<number>;
}

/**
 * Executes a bulk INSERT statement.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#exec_insert_all
 */
export function execInsertAll(
  this: DatabaseStatementsHost | void,
  sql: string,
  name: string = "SQL",
): Promise<Result> {
  return internalExecQuery.call(this as DatabaseStatementsHost, sql, name);
}

/**
 * Returns an EXPLAIN plan for the query. Must be overridden by adapters.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#explain
 */
export function explain(_arel: unknown, _binds?: unknown[], _options?: unknown[]): Promise<string> {
  throw new Error("explain must be implemented by adapter subclass");
}

// --- Data modification ---

/**
 * Executes an INSERT and returns the new record's ID.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#insert
 */
export async function insert(
  this: DatabaseStatementsHost | void,
  arel: unknown,
  name?: string | null,
  _pk?: string | null,
  idValue?: unknown,
  _sequenceName?: string | null,
  binds: unknown[] = [],
): Promise<unknown> {
  const host = this as DatabaseStatementsHost;
  const [sql, resolvedBinds] = toSqlAndBinds(arel, binds);
  const result = await execInsert.call(this, sql, name, resolvedBinds);
  if (idValue !== undefined && idValue !== null) return idValue;
  if (!host?.lastInsertedId) {
    throw new Error("adapter must implement lastInsertedId(result) to use insert()");
  }
  return host.lastInsertedId(result);
}

/**
 * Executes an UPDATE and returns the number of affected rows.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#update
 */
export async function update(
  this: DatabaseStatementsHost | void,
  arel: unknown,
  name?: string | null,
  binds: unknown[] = [],
): Promise<number> {
  const [sql, resolvedBinds] = toSqlAndBinds(arel, binds);
  return execUpdate.call(this, sql, name, resolvedBinds);
}

/**
 * Executes a DELETE and returns the number of affected rows.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#delete
 */
export async function deleteStatement(
  this: DatabaseStatementsHost | void,
  arel: unknown,
  name?: string | null,
  binds: unknown[] = [],
): Promise<number> {
  const [sql, resolvedBinds] = toSqlAndBinds(arel, binds);
  return execDelete.call(this, sql, name, resolvedBinds);
}
// Rails name: delete — aliased to avoid JS reserved word conflict.
// Consumers can import as: import { delete as delete_ } from "..."

export { deleteStatement as delete };

/**
 * Executes a TRUNCATE statement.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#truncate
 */
export async function truncate(
  this: DatabaseStatementsHost | void,
  tableName: string,
  name?: string | null,
): Promise<unknown> {
  const sql = `TRUNCATE TABLE ${quoteTableName(tableName)}`;
  const doExecute = (this as DatabaseStatementsHost)?.execute ?? execute;
  return doExecute(sql);
}

/**
 * Truncates multiple tables, skipping schema_migrations and ar_internal_metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#truncate_tables
 */
export async function truncateTables(
  this: DatabaseStatementsHost,
  ...tableNames: string[]
): Promise<void> {
  const schemaMigrationTable = this.pool?.schemaMigration?.tableName ?? "schema_migrations";
  const internalMetadataTable = this.pool?.internalMetadata?.tableName ?? "ar_internal_metadata";
  const filtered = tableNames.filter(
    (t) => t !== schemaMigrationTable && t !== internalMetadataTable,
  );

  if (filtered.length === 0) return;

  const statements = filtered.map((t) => `TRUNCATE TABLE ${quoteTableName(t)}`);

  const doExecute = this.execute ?? execute;
  const doTruncate = async () => {
    if (this.executeBatch) {
      await this.executeBatch(statements, "Truncate Tables");
    } else {
      for (const stmt of statements) {
        await doExecute(stmt);
      }
    }
  };

  if (this.disableReferentialIntegrity) {
    let executed = false;
    await this.disableReferentialIntegrity(async () => {
      executed = true;
      await doTruncate();
    });
    if (!executed) await doTruncate();
  } else {
    await doTruncate();
  }
}

// --- Transaction ---

/**
 * Runs the given block in a database transaction.
 * Supports nested transactions via savepoints, isolation levels,
 * and the requires_new option.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#transaction
 */
export async function transaction<T>(
  this: DatabaseStatementsHost,
  fn: (tx?: unknown) => Promise<T> | T,
  options: { requiresNew?: boolean; isolation?: string; joinable?: boolean } = {},
): Promise<T | undefined> {
  const { requiresNew, isolation, joinable = true } = options;

  // Check if we can join the current transaction.
  // joinable may be a boolean property or a function — support both.
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

  // Fallback: simple begin/commit/rollback — delegate through this, preserving context
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

// --- Transaction lifecycle ---

/**
 * The transaction manager for this connection.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#transaction_manager
 */
export function transactionManager(this: DatabaseStatementsHost): TransactionManager | null {
  return (this as any)._transactionManager ?? null;
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
export async function beginDbTransaction(): Promise<void> {
  // No-op in abstract base
}

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
    const levels = transactionIsolationLevels();
    const normalized = levels[isolationLevel] ?? isolationLevel;
    return host?.beginIsolatedDbTransaction
      ? host.beginIsolatedDbTransaction.call(host, normalized)
      : beginIsolatedDbTransaction.call(this, normalized);
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
export function resetIsolationLevel(): void {
  // No-op in abstract base
}

/**
 * Commits the database transaction. No-op in abstract base.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#commit_db_transaction
 */
export async function commitDbTransaction(): Promise<void> {
  // No-op in abstract base
}

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
export async function execRollbackDbTransaction(): Promise<void> {
  // No-op in abstract base
}

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
export async function execRestartDbTransaction(): Promise<void> {
  // No-op in abstract base
}

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

// --- Utility methods ---

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
): Promise<void> {
  // No-op by default. Implement for PostgreSQL, Oracle, etc.
}

/**
 * Inserts a single fixture row into a table.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#insert_fixture
 */
export async function insertFixture(
  this: DatabaseStatementsHost | void,
  fixture: Record<string, unknown>,
  tableName: string,
): Promise<unknown> {
  const host = this as DatabaseStatementsHost;
  const columns = Object.keys(fixture);
  const values = Object.values(fixture).map((v) => quote(withYamlFallback(v)));

  const emptyValue = host?.emptyInsertStatementValue?.() ?? emptyInsertStatementValue();
  const sql =
    columns.length > 0
      ? `INSERT INTO ${quoteTableName(tableName)} (${columns.map((c) => quoteColumnName(c)).join(", ")}) VALUES (${values.join(", ")})`
      : `INSERT INTO ${quoteTableName(tableName)} ${emptyValue}`;

  const doExecute = host?.execute ?? execute;
  return doExecute(sql);
}

/**
 * Inserts a set of fixtures into tables, wrapped in a transaction.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#insert_fixtures_set
 */
export async function insertFixturesSet(
  this: DatabaseStatementsHost,
  fixtureSet: Record<string, Record<string, unknown>[]>,
  tablesToDelete: string[] = [],
): Promise<void> {
  const deleteStatements = tablesToDelete.map((t) => `DELETE FROM ${quoteTableName(t)}`);

  const insertStatements: string[] = [];
  for (const [tableName, fixtures] of Object.entries(fixtureSet)) {
    if (fixtures.length === 0) continue;
    for (const fixture of fixtures) {
      const columns = Object.keys(fixture);
      if (columns.length === 0) {
        const emptyValue = this.emptyInsertStatementValue?.() ?? emptyInsertStatementValue();
        insertStatements.push(`INSERT INTO ${quoteTableName(tableName)} ${emptyValue}`);
      } else {
        const values = Object.values(fixture).map((v) => quote(withYamlFallback(v)));
        insertStatements.push(
          `INSERT INTO ${quoteTableName(tableName)} (${columns.map((c) => quoteColumnName(c)).join(", ")}) VALUES (${values.join(", ")})`,
        );
      }
    }
  }

  const allStatements = [...deleteStatements, ...insertStatements];

  const doExecute = this.execute ?? execute;
  const doInserts = async () => {
    if (this.executeBatch) {
      await this.executeBatch(allStatements, "Fixtures Load");
    } else {
      for (const stmt of allStatements) {
        await doExecute(stmt);
      }
    }
  };

  // Rails wraps fixture loading in a transaction with requires_new: true
  const doLoadInTransaction = async () => {
    if (this.disableReferentialIntegrity) {
      let executed = false;
      await this.disableReferentialIntegrity(async () => {
        executed = true;
        await doInserts();
      });
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
  if (typeof limit === "number" && Number.isInteger(limit)) {
    return limit;
  }
  if (limit instanceof Nodes.SqlLiteral) {
    return limit;
  }
  if (typeof limit === "string" && /^[+-]?\d+$/.test(limit.trim())) {
    return Number(limit.trim());
  }
  throw new TypeError(`Invalid LIMIT: ${limit}`);
}

/**
 * Converts Array/object fixture values to JSON strings, passes scalars through.
 * Rails uses YAML.dump; we use JSON.stringify as the TS equivalent.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#with_yaml_fallback
 */
export function withYamlFallback(value: unknown): unknown {
  if (
    Array.isArray(value) ||
    (value !== null && typeof value === "object" && !(value instanceof Date))
  ) {
    return JSON.stringify(value);
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
 * Extract database-cast primitive values from a bind array for the
 * `type_casted_binds` slot on `sql.active_record` payloads — matches
 * Rails' `type_casted_binds` contract: subscribers (LogSubscriber,
 * QueryCache, etc) see the primitive values that were actually sent to
 * the driver, not the Attribute / bind objects used to build the query.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#type_casted_binds
 */
export function typeCastedBinds(binds: unknown[] | undefined): unknown[] {
  return (binds ?? []).map((b: any) => {
    if (b && typeof b === "object" && typeof b.valueForDatabase === "function") {
      return b.valueForDatabase();
    }
    return b && typeof b === "object" && "value" in b ? b.value : b;
  });
}

/**
 * Wraps query execution in a `sql.active_record` instrumentation event,
 * mirroring Rails' `AbstractAdapter#log`.
 */
async function logSql<T>(
  host: DatabaseStatementsHost,
  sql: string,
  name: string,
  binds: unknown[] | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  // Rails' log() separates binds (Attribute objects) from type_casted_binds
  // (primitive values). type_casted_binds can be a lazy callable in Rails;
  // here we pass the primitive values directly.
  const bindArray = binds ?? [];
  const payload: Record<string, unknown> = {
    sql,
    name,
    binds: bindArray,
    type_casted_binds: typeCastedBinds(bindArray),
    connection: host,
    row_count: 0,
  };
  return Notifications.instrumentAsync("sql.active_record", payload, async () => {
    try {
      const result = await fn();
      if (result instanceof Result) {
        payload.row_count = result.length;
      }
      return result;
    } catch (e: any) {
      // Rails' Instrumenter sets payload[:exception] and [:exception_object]
      // so subscribers (e.g. ExplainSubscriber) can detect failed queries.
      payload.exception = e;
      payload.exception_object = e;
      throw e;
    }
  }) as Promise<T>;
}

/**
 * Executes a raw query and returns an ActiveRecord::Result.
 * Delegates to rawExecute + castResult.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#raw_exec_query
 */
export async function rawExecQuery(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<Result> {
  if (!this.rawExecute) {
    throw new Error("rawExecQuery requires rawExecute on the adapter");
  }
  const sqlName = name ?? "SQL";
  return logSql(this, sql, sqlName, binds, async () => {
    // Materialize lazy transactions before executing SQL, matching Rails'
    // with_raw_connection which calls materialize_transactions.
    const tm = (this as any)._transactionManager as TransactionManager | undefined;
    if (tm) await tm.materializeTransactions();
    const rawResult = await this.rawExecute!(sql, sqlName, binds);
    return this.castResult ? this.castResult(rawResult) : normalizeResult(rawResult);
  });
}

/**
 * Executes a query via internal_execute and returns an ActiveRecord::Result.
 * Delegates to internalExecute + castResult.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#internal_exec_query
 */
export async function internalExecQuery(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<Result> {
  const sqlName = name ?? "SQL";
  return logSql(this, sql, sqlName, binds, async () => {
    // Materialize lazy transactions before executing SQL
    const tm = (this as any)._transactionManager as TransactionManager | undefined;
    if (tm) await tm.materializeTransactions();
    if (this?.internalExecute) {
      const rawResult = await this.internalExecute(sql, sqlName, binds);
      return this.castResult ? this.castResult(rawResult) : normalizeResult(rawResult);
    }
    if (binds && binds.length > 0) {
      throw new Error(
        "internalExecQuery requires internalExecute on the adapter when binds are provided",
      );
    }
    // Fallback: delegate through this.execute only when there are no binds
    const doExecute = this?.execute ?? execute;
    const result = await doExecute(sql);
    return normalizeResult(result);
  });
}

// --- Private helpers ---

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

function singleValueFromRows(rows: unknown[][]): unknown {
  const row = rows[0];
  return row ? row[0] : undefined;
}

/**
 * Alias: create = insert (matches Rails)
 */
export { insert as create };

/**
 * Alias: remove = delete (backwards compat with prior TS API)
 */
export { deleteStatement as remove };
