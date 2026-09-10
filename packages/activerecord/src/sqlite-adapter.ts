export type SqliteBindValue = null | string | number | bigint | boolean | Uint8Array;

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
  run(binds?: SqliteBinds): RunResult | Promise<RunResult>;
  get(binds?: SqliteBinds): unknown | Promise<unknown>;
  all(binds?: SqliteBinds): unknown[] | Promise<unknown[]>;
  iterate(binds?: SqliteBinds): Iterable<unknown> | AsyncIterable<unknown>;
  columns(): ColumnInfo[];
  setReadBigInts(on: boolean): void;
  readonly reader: boolean;
  close(): void | Promise<void>;
  readonly closed: boolean;
}

export interface SqliteConnection {
  prepare(sql: string): SqliteStatement | Promise<SqliteStatement>;
  exec(sql: string): void | Promise<void>;
  pragma(source: string, opts?: { simple?: boolean }): unknown | Promise<unknown>;
  changes(): number | Promise<number>;
  lastInsertRowId(): number | bigint | Promise<number | bigint>;
  close(): void | Promise<void>;
  isOpen(): boolean;
  readonly raw: unknown;
}

export interface SyncSqliteStatement {
  run(binds?: SqliteBinds): RunResult;
  get(binds?: SqliteBinds): unknown;
  all(binds?: SqliteBinds): unknown[];
  iterate(binds?: SqliteBinds): Iterable<unknown>;
  columns(): ColumnInfo[];
  setReadBigInts(on: boolean): void;
  readonly reader: boolean;
  close(): void;
  readonly closed: boolean;
}

export interface SyncSqliteConnection {
  prepare(sql: string): SyncSqliteStatement;
  exec(sql: string): void;
  pragma(source: string, opts?: { simple?: boolean }): unknown;
  changes(): number;
  lastInsertRowId(): number | bigint;
  close(): void;
  isOpen(): boolean;
  readonly raw: unknown;
}

export const SQLite3Constants = {
  Open: {
    READONLY: 0x00000001,
    READWRITE: 0x00000002,
    CREATE: 0x00000004,
    URI: 0x00000040,
    SHAREDCACHE: 0x00020000,
  },
} as const;

export interface SqliteOpenConfig {
  database: string;
  flags?: number;
  readOnly?: boolean;
  noMutex?: boolean;
  timeout?: number;
  strict?: boolean;
  driverOptions?: Record<string, unknown>;
}

export const PRAGMA_SETTERS: ReadonlySet<string> = new Set([
  "application_id",
  "automatic_index",
  "auto_vacuum",
  "busy_timeout",
  "cache_size",
  "cache_spill",
  "case_sensitive_like",
  "cell_size_check",
  "checkpoint_fullfsync",
  "count_changes",
  "default_cache_size",
  "default_synchronous",
  "default_temp_store",
  "defer_foreign_keys",
  "encoding",
  "foreign_keys",
  "full_column_names",
  "fullfsync",
  "ignore_check_constraints",
  "journal_mode",
  "journal_size_limit",
  "legacy_file_format",
  "locking_mode",
  "max_page_count",
  "mmap_size",
  "page_size",
  "parser_trace",
  "query_only",
  "read_uncommitted",
  "recursive_triggers",
  "reverse_unordered_selects",
  "schema_cookie",
  "schema_version",
  "secure_delete",
  "short_column_names",
  "soft_heap_limit",
  "synchronous",
  "temp_store",
  "threads",
  "user_cookie",
  "user_version",
  "vdbe_addoptrace",
  "vdbe_debug",
  "vdbe_listing",
  "vdbe_trace",
  "wal_autocheckpoint",
  "wal_checkpoint",
  "writable_schema",
]);

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
  /** @internal */
  openSync?(config: SqliteOpenConfig): SyncSqliteConnection;
  databaseExists?(config: SqliteOpenConfig): boolean | Promise<boolean>;
  restoreFromPath?(sourcePath: string, destination: string): Promise<void>;
}
