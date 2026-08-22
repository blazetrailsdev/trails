/**
 * SQLite3 database statements — SQLite-specific query execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements
 *
 * In Rails these are instance methods on the DatabaseStatements module
 * mixed into the adapter. Here they're standalone functions that accept
 * an adapter for execution, matching the codebase's mixin pattern.
 */

import { sql as arelSql } from "@blazetrails/arel";
import type { SqliteBinds, SqliteConnection, SqliteStatement } from "../../sqlite-adapter.js";
import { TransactionIsolationError } from "../../errors.js";
import { Result } from "../../result.js";
import { stripSqlComments } from "../sql-classification.js";
import { combineMultiStatements } from "../abstract/database-statements.js";

// Matches Rails' build_read_query_regexp(:pragma) which combines
// DEFAULT_READ_QUERY [:begin, :commit, :explain, :release, :rollback, :savepoint, :select, :with]
// with SQLite3's :pragma addition.
const READ_QUERY =
  /^(?:[(\s]|\/\*[\s\S]*?\*\/)*(?:begin|commit|explain|release|rollback|savepoint|select|with|pragma)\b/i;

type ExecutableAdapter = {
  execute(sql: string, binds?: unknown[]): Promise<unknown>;
  internalExecute(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<unknown>;
};

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
  return !READ_QUERY.test(stripSqlComments(sql));
}

export async function beginDbTransaction(this: InternalBeginTransactionHost): Promise<void> {
  await internalBeginTransaction.call(this, "immediate", null);
}

export async function beginDeferredTransaction(
  this: InternalBeginTransactionHost,
  isolation?: string | null,
): Promise<void> {
  await internalBeginTransaction.call(this, "deferred", isolation);
}

export async function beginIsolatedDbTransaction(
  this: InternalBeginTransactionHost,
  isolation: string,
): Promise<void> {
  await internalBeginTransaction.call(this, "deferred", isolation);
}

export async function commitDbTransaction(adapter: ExecutableAdapter): Promise<void> {
  await adapter.internalExecute("COMMIT TRANSACTION", "TRANSACTION", [], {
    allowRetry: true,
    materializeTransactions: false,
  });
}

export async function execRollbackDbTransaction(adapter: ExecutableAdapter): Promise<void> {
  await adapter.internalExecute("ROLLBACK TRANSACTION", "TRANSACTION", [], {
    allowRetry: true,
    materializeTransactions: false,
  });
}

export function highPrecisionCurrentTimestamp(): string {
  return "STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')";
}

export async function execute(
  adapter: ExecutableAdapter,
  sql: string,
  binds?: unknown[],
): Promise<unknown> {
  return adapter.execute(sql, binds);
}

export async function resetIsolationLevel(
  adapter: ExecutableAdapter,
  previousReadUncommitted: number | null,
): Promise<void> {
  if (previousReadUncommitted !== null) {
    await adapter.internalExecute(
      `PRAGMA read_uncommitted=${previousReadUncommitted}`,
      "TRANSACTION",
      [],
      { allowRetry: true, materializeTransactions: false },
    );
  }
}

interface InternalBeginTransactionHost {
  internalExecute(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<unknown>;
  queryValue(sql: string, name?: string): Promise<unknown>;
  isSharedCache?(): boolean;
  _previousReadUncommitted?: unknown;
}

// The state performQuery reads/writes on the adapter. Mirrors the members
// Rails' perform_query touches on the SQLite3Adapter instance: the statement
// pool (via _cachedStatement), @last_affected_rows / last insert rowid, and
// the verified! bookkeeping with_raw_connection performs around the
// round-trip. Dirtying the current transaction is the CALLER's — Rails does it
// in with_raw_connection's ensure gated on materialize_transactions
// (abstract_adapter.rb:1046), which `raw_execute`'s PRAGMA callers pass false
// for; doing it here would mark a reconnect's configure_connection as a write
// and make the transaction stack unrestorable.
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
  quoteTableName(tableName: string): string;
}

/** @internal */
export async function internalBeginTransaction(
  this: InternalBeginTransactionHost,
  mode: "deferred" | "immediate",
  isolation?: string | null,
): Promise<void> {
  if (isolation) {
    if (isolation !== "read_uncommitted") {
      throw new TransactionIsolationError(
        "SQLite3 only supports the `read_uncommitted` transaction isolation level",
      );
    }
    if (this.isSharedCache && !this.isSharedCache()) {
      // Rails raises a bare StandardError here, distinct from the
      // TransactionIsolationError above (database_statements.rb:67-68).
      // StandardError has no ported subclass — `Error` is its analogue.
      // eslint-disable-next-line blazetrails/rails-error-parity
      throw new Error(
        "You need to enable the shared-cache mode in SQLite mode before attempting to change the transaction isolation level",
      );
    }
  }
  await this.internalExecute(`BEGIN ${mode.toUpperCase()} TRANSACTION`, "TRANSACTION", [], {
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
 * Rails' `@lock.synchronize` around `perform_query` (see {@link performQuery}):
 * wait until every statement queued ahead has finished, then answer the
 * release. Non-reentrant on purpose — the whole point is that two
 * concurrently-issued writes on one connection cannot interleave between a
 * statement and its `sqlite3_changes()` readback. Every path that runs a
 * statement on the connection takes it, `internal_exec_query`'s included —
 * an unlocked write there would land between another's statement and readback.
 *
 * `_statementLock` is the TAIL of a queue, not a held/free flag: each caller
 * chains its own release onto whatever tail it found and publishes the new
 * tail, all synchronously before its first `await`. So arrival order fixes
 * service order, and there is no window in which two callers can both observe
 * a free lock and claim it.
 *
 * An UNCONTENDED acquisition answers synchronously — Ruby's `@lock.synchronize`
 * doesn't yield when nobody holds the monitor, and a gratuitous `await` here
 * does: it hands the event loop to whatever is queued, which on the
 * transaction-control path is enough for a pool `disconnect` to close the
 * handle between the acquisition and the statement. Hence the union return
 * type; the queue drains back to `null` so the fast path stays reachable.
 * @internal
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
    // Only the last queued caller clears the tail; a later arrival has already
    // published its own and must keep waiting on this one.
    if (host._statementLock === tail) host._statementLock = null;
    release();
  };
  if (!ahead) return drain;
  return ahead.then(() => drain);
}

/**
 * The single SQL primitive: run a statement and return its rows plus the
 * affected-rows / insert-rowid the connection reports for it. As Rails does,
 * the branch is the statement's column count alone (`stmt.reader` is
 * `column_count > 0`): a statement that returns columns — including
 * `INSERT … RETURNING` — takes `.all()`, and one that returns none takes
 * `.run()`.
 *
 * The counts come from `raw_connection.changes` /
 * `raw_connection.last_insert_row_id` after the statement, exactly as Rails'
 * `@last_affected_rows = raw_connection.changes` does, so they are the
 * connection-level `sqlite3_changes()` — advanced only by DML and PRESERVED
 * across DDL and transaction control — rather than the per-statement
 * `RunResult`, which reports `0` for DDL.
 *
 * Rails can read them post-hoc because `perform_query` runs inside
 * `with_raw_connection`'s `@lock.synchronize`, and one Ruby thread is never
 * inside two of them at once. Here the same discipline is a FIFO lock over
 * `_statementLock` held across the statement AND the two counter reads: an
 * interleaving `Promise.all` write would otherwise land between them and be
 * reported as this statement's rowid (the race PR #4893 first hit). The
 * connection's own reentrant `synchronize` cannot serve — a `Promise.all` of
 * writes inside one transaction shares its lock owner and re-enters.
 *
 * This is the live primitive `raw_execute` — and, in trails, `execute` /
 * `executeMutation` — delegate to. It is written against the async
 * `SqliteStatement` / `SqliteConnection` driver abstraction (array binds,
 * promise-returning, multi-driver) rather than better-sqlite3's native sync
 * API, so it is reachable from the adapter.
 *
 * Like Rails (`:85-107`) it returns an `ActiveRecord::Result` — built from the
 * statement's own columns, so a row-returning statement reports its column set
 * even when it matches no rows — which is why `castResult` below is the
 * identity, as it is in Rails (`:113-121`).
 *
 * One deviation, forced by that driver abstraction:
 *
 * - Rails' unprepared arm guards `stmt.bind_params` with
 *   `unless binds.nil? || binds.empty?` (`:96-98`); binds reach this driver as
 *   a call argument rather than a separate `bind_params` round-trip, so an
 *   empty array already means "bind nothing" and the guard has nothing to
 *   guard. `binds` stays in the signature at Rails' position regardless.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements#perform_query
 * @internal
 */
export async function performQuery(
  this: PerformQueryHost,
  rawConnection: SqliteConnection,
  sql: string,
  binds: unknown[],
  typeCastedBinds: SqliteBinds,
  options: {
    prepare?: boolean;
    notificationPayload?: Record<string, unknown>;
    batch?: boolean;
    // Out-parameter, filled in the same synchronous turn as
    // `this._last*` below. Rails reads `@last_affected_rows` back through
    // `affected_rows(result)` on the strength of `with_raw_connection`'s
    // `@lock`, which one Ruby thread holds across the whole call; a JS caller
    // resumes a microtask later, by which time an interleaving write's
    // `perform_query` may already have overwritten the shared fields. Callers
    // that need the counters (only `executeMutation` — itself the deviation
    // justified at the `AbstractAdapter` declaration) pass this and read it
    // instead. It carries no Rails behaviour of its own.
    counters?: { affectedRows: number; insertRowid: number | bigint };
  } = {},
): Promise<Result> {
  const { prepare = false, notificationPayload, batch = false, counters } = options;
  // The lock is taken BEFORE the statement is prepared: Rails' `@lock` is held
  // by `with_raw_connection` (abstract/database_statements.rb:552-559) around
  // the whole of `perform_query`, preparation included, and `disconnect!` takes
  // the same lock — so a close can never land between a statement's
  // preparation and its execution.
  //
  // An uncontended acquisition answers synchronously, so don't `await` it —
  // `await` on a plain value still yields a microtask, and on the
  // transaction-control path that is enough for a pool `disconnect` to close
  // the handle before the statement runs.
  const acquired = acquireStatementLock(this);
  const release = typeof acquired === "function" ? acquired : await acquired;
  let stmt: SqliteStatement | null = null;
  let result: Result;
  let affectedRows: number;
  let insertRowid: number | bigint;
  try {
    // Rails' three arms (sqlite3/database_statements.rb:78-108): batch, which
    // hands the whole multi-statement string to `execute_batch2`; prepared,
    // which takes the statement from the pool; and unprepared, which prepares a
    // fresh statement rather than caching it.
    stmt = batch
      ? null
      : prepare
        ? await this._cachedStatement(sql)
        : await this._freshStatement(sql);
    if (stmt === null) {
      await rawConnection.exec(sql);
      result = Result.empty();
    } else if (stmt.reader) {
      // `ActiveRecord::Result.new(stmt.columns, stmt.to_a)` (`:93`, `:104`) —
      // the columns come off the statement, not off the rows, so a SELECT that
      // matches nothing still reports them.
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
      // `stmt.step; ActiveRecord::Result.empty` (`:90-92`, `:101-103`).
      await stmt.run(typeCastedBinds);
      result = Result.empty();
    }
    affectedRows = await rawConnection.changes();
    insertRowid = await rawConnection.lastInsertRowId();
  } finally {
    release();
    // Rails closes the uncached statement in its own ensure
    // (sqlite3/database_statements.rb:93-107); the pooled one on the `prepare`
    // arm is the pool's to close. `finalize` is the driver's `close`.
    if (!prepare && stmt !== null) await stmt.finalize?.();
  }
  // `@last_affected_rows = raw_connection.changes` (`:108`). The insert rowid
  // has no Rails field; it backs `executeMutation`'s INSERT return value.
  this._lastAffectedRows = affectedRows;
  this._lastInsertRowid = insertRowid;
  if (counters) {
    counters.affectedRows = affectedRows;
    counters.insertRowid = insertRowid;
  }
  // Rails' perform_query: `verified!` after @last_affected_rows, success
  // path only — a successful round-trip proves the connection is live.
  this.verifiedBang();
  if (notificationPayload) notificationPayload.row_count = result.length;
  return result;
}

/** @internal */
export function castResult(result: Result): Result {
  // Given that SQLite3 doesn't really a Result type, raw_execute already return
  // an ActiveRecord::Result and we have nothing to cast here.
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
  name?: string | null,
): Promise<void> {
  const sql = combineMultiStatements(statements);
  // Rails: `raw_execute(sql, name, batch: true, **kwargs)`
  // (sqlite3/database_statements.rb:126-129); the positional defaults below are
  // `raw_execute`'s own (abstract/database_statements.rb:552). Going through
  // `raw_execute` rather than `internal_execute` is also what leaves batch
  // statements uncommented — `preprocess_query`, which runs the
  // query_transformers, is `internal_execute`'s step (`:589-591`) — so the
  // `_inQueryTransformers` suppression flag this used to set is gone with it.
  await this.rawExecute(sql, name, [], false, false, false, true, true);
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
 *
 * @missingRailsCall first — PERMANENT: Per-site verified (RFC 0106 wave 4b):
 *   sqlite3/database_statements.rb:136 is `result.rows.first`, which is
 *   `result.rows[0]` on a JS array; `Array#first` is not a ported method name.
 */
export function returningColumnValues(result: Result): unknown[] | undefined {
  return result.rows[0] as unknown[] | undefined;
}

/**
 * @internal
 *
 * @missingRailsCall sql — PERMANENT: Per-site verified (RFC 0106 wave 4b):
 *   sqlite3/database_statements.rb:140 is `Arel.sql(column.default_function)`;
 *   trails calls the same `Arel.sql` export, imported as `arelSql` because the
 *   surrounding bodies bind `sql` as a parameter name
 *   (sqlite3/database-statements.ts:11).
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
