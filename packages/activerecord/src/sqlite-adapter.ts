/**
 * SQLite driver adapter — generic "open a SQLite handle and run statements"
 * abstraction. A driver is bound to a concrete adapter subclass via the
 * `defaultSqliteDriver()` hook (e.g. `BetterSQLite3Adapter`), or passed
 * directly through `config.driver`.
 *
 * The driver is opaque to query construction: bytes-in (SQL string + binds),
 * rows-out (raw row values + column metadata). Type coercion and Date encoding
 * stay in callers (e.g. `Sqlite3Adapter`) so PG/MySQL/SQLite share one path.
 */

/**
 * Anything a sqlite driver must accept as a bound parameter. Date is
 * intentionally NOT in the union: the rest of trails uses Temporal types and
 * the AR quoting layer pre-formats temporal values to strings before they
 * reach a driver. Including Date here would force every driver author to
 * carry a dead branch that callers never exercise.
 */
export type SqliteBindValue = null | string | number | bigint | boolean | Uint8Array;

/** Positional or named binds; statement methods accept either form. */
export type SqliteBinds = readonly SqliteBindValue[] | { readonly [name: string]: SqliteBindValue };

export interface ColumnInfo {
  name: string;
  column: string | null;
  table: string | null;
  database: string | null;
  type: string | null;
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SqliteStatement {
  /** INSERT/UPDATE/DELETE/DDL. */
  run(binds?: SqliteBinds): RunResult | Promise<RunResult>;
  /** First row, or undefined if none. */
  get(binds?: SqliteBinds): unknown | Promise<unknown>;
  /** All rows. Drivers MAY stream internally but MUST return a fully-realized array. */
  all(binds?: SqliteBinds): unknown[] | Promise<unknown[]>;
  /**
   * Row-at-a-time iteration. Sync drivers return Iterable; async drivers return
   * AsyncIterable. AR's batch path uses this for large result sets.
   */
  iterate(binds?: SqliteBinds): Iterable<unknown> | AsyncIterable<unknown>;
  columns(): ColumnInfo[];
  /** Toggle bigint return for integer columns. Default: false. */
  setReadBigInts(on: boolean): void;
  /** True when the statement returns rows (SELECT/PRAGMA that yields rows). */
  readonly reader: boolean;
  /** Optional — drivers without explicit finalization MAY omit. */
  finalize?(): void | Promise<void>;
}

/** An open SQLite handle. */
export interface SqliteConnection {
  prepare(sql: string): SqliteStatement | Promise<SqliteStatement>;
  exec(sql: string): void | Promise<void>;
  pragma(source: string, opts?: { simple?: boolean }): unknown | Promise<unknown>;
  /** Idempotent. After close(), all calls reject / throw. */
  close(): void | Promise<void>;
  /** True between successful open() and close(). */
  isOpen(): boolean;
  /** Driver-specific escape hatch (e.g. better-sqlite3 `Database` instance). */
  readonly raw: unknown;
}

/**
 * Synchronous narrowing of `SqliteStatement` for `inProcessSync` drivers. The
 * sync constructor path binds to this via `openSync()`; async drivers can't be
 * wired here (they'd return Promises the sync path casts as concrete values)
 * and instead use the async `open()` path (`AbstractSQLite3Adapter.openAsync()`).
 */
export interface SyncSqliteStatement {
  run(binds?: SqliteBinds): RunResult;
  get(binds?: SqliteBinds): unknown;
  all(binds?: SqliteBinds): unknown[];
  iterate(binds?: SqliteBinds): Iterable<unknown>;
  columns(): ColumnInfo[];
  setReadBigInts(on: boolean): void;
  readonly reader: boolean;
  finalize?(): void;
}

/** Synchronous narrowing of `SqliteConnection`. See `SyncSqliteStatement`. */
export interface SyncSqliteConnection {
  prepare(sql: string): SyncSqliteStatement;
  exec(sql: string): void;
  pragma(source: string, opts?: { simple?: boolean }): unknown;
  close(): void;
  isOpen(): boolean;
  readonly raw: unknown;
}

export interface SqliteOpenConfig {
  /** File path or special URI (`:memory:`, `file::memory:?cache=shared`). */
  database: string;
  /** Open in read-only mode. Default false. */
  readOnly?: boolean;
  /** SQLITE_OPEN_NOMUTEX equivalent — opt-in for single-threaded use. */
  noMutex?: boolean;
  /** busy_timeout ms for SQLITE_BUSY contention. Default 5000. */
  timeout?: number;
  /**
   * Opt into SQLite's connection-level strict-strings mode when the driver
   * supports it. Maps to `sqlite3_db_config(SQLITE_DBCONFIG_DQS_DDL=0,
   * SQLITE_DBCONFIG_DQS_DML=0)`, which rejects double-quoted string literals.
   * Drivers that can't honor this MUST silently ignore it (e.g. better-sqlite3
   * compiles with `SQLITE_DQS=0` so DQS is already off, and the upstream
   * binding doesn't expose `sqlite3_db_config`). Per-table `STRICT` semantics
   * are a `CREATE TABLE` clause and belong to schema-creation, not here.
   * Default: false.
   */
  strict?: boolean;
  /** Driver-specific options pass-through. AR core never inspects this. */
  driverOptions?: Record<string, unknown>;
}

export interface SqliteDriverCapabilities {
  readonly inProcessSync: boolean;
  readonly streaming: boolean;
  readonly loadExtension: boolean;
  readonly concurrentStatements: boolean;
  readonly foreignKeysOnByDefault: boolean;
  readonly immediateTransactions: boolean;
}

export interface SqliteDriver {
  readonly name: string;
  readonly capabilities: SqliteDriverCapabilities;
  open(config: SqliteOpenConfig): Promise<SqliteConnection>;
  /**
   * Sync open for `inProcessSync` drivers. Retained — NOT superseded by the
   * async path: `AbstractSQLite3Adapter`'s constructor is synchronous, so
   * in-process drivers (better-sqlite3, node:sqlite) connect eagerly here,
   * keeping `new Adapter()` usable without `await`. Async-only drivers
   * (expo-sqlite, WASM/network) omit this hook and are opened via
   * `AbstractSQLite3Adapter.openAsync()`, which awaits `open()`. Returns the
   * narrowed `SyncSqliteConnection` so the type system rejects async drivers
   * wired here. @internal
   */
  openSync?(config: SqliteOpenConfig): SyncSqliteConnection;
  /**
   * Pre-flight existence check. Optional — drivers that can't statelessly
   * answer (network-backed) leave undefined and callers fall back to
   * attempt-and-catch.
   */
  databaseExists?(config: SqliteOpenConfig): boolean | Promise<boolean>;
  /**
   * Restore the SQLite database file at `sourcePath` into `destination` using
   * the driver's native online-backup primitive (SQLite's
   * `sqlite3_backup_*`). `destination` is a path or `file:` URI; when it is a
   * shared-cache in-memory URI (`file:name?mode=memory&cache=shared`) the
   * caller MUST hold a connection open to that same URI for the restored DB to
   * persist past the backup. Optional — drivers without a backup primitive
   * (e.g. expo-sqlite) omit it and callers fall back to a file clone.
   */
  restoreFromPath?(sourcePath: string, destination: string): Promise<void>;
}
