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
  bindParams(binds: SqliteBinds): void;
  step(): null | Promise<null>;
  toA(): unknown[][] | Promise<unknown[][]>;
  columns(): ColumnInfo[];
  setReadBigInts(on: boolean): void;
  readonly reader: boolean;
  close(): void | Promise<void>;
  readonly closed: boolean;
}

export interface SqliteConnection {
  prepare(sql: string): SqliteStatement | Promise<SqliteStatement>;
  exec(sql: string): void | Promise<void>;
  execute(sql: string, bindVars?: SqliteBinds): readonly unknown[] | Promise<readonly unknown[]>;
  execute(
    sql: string,
    bindVars: SqliteBinds | undefined,
    block: ((row: unknown) => void) | undefined,
  ): readonly unknown[] | null | Promise<readonly unknown[] | null>;
  getFirstValue(sql: string, ...bindVars: SqliteBindValue[]): unknown | Promise<unknown>;
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
  bindParams(binds: SqliteBinds): void;
  step(): null;
  toA(): unknown[][];
  columns(): ColumnInfo[];
  setReadBigInts(on: boolean): void;
  readonly reader: boolean;
  close(): void;
  readonly closed: boolean;
}

export interface SyncSqliteConnection {
  prepare(sql: string): SyncSqliteStatement;
  exec(sql: string): void;
  execute(sql: string, bindVars?: SqliteBinds): readonly unknown[];
  execute(
    sql: string,
    bindVars: SqliteBinds | undefined,
    block: ((row: unknown) => void) | undefined,
  ): readonly unknown[] | null;
  getFirstValue(sql: string, ...bindVars: SqliteBindValue[]): unknown;
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
  Optimize: {
    DEBUG: 0x00001,
    ANALYZE_TABLES: 0x00002,
    LIMIT_ANALYZE: 0x00010,
    CHECK_ALL_TABLES: 0x10000,
    DEFAULT: 0x00002 | 0x00010,
  },
  ErrorCode: {
    OK: 0,
    ERROR: 1,
    INTERNAL: 2,
    PERM: 3,
    ABORT: 4,
    BUSY: 5,
    LOCKED: 6,
    NOMEM: 7,
    READONLY: 8,
    INTERRUPT: 9,
    IOERR: 10,
    CORRUPT: 11,
    NOTFOUND: 12,
    FULL: 13,
    CANTOPEN: 14,
    PROTOCOL: 15,
    EMPTY: 16,
    SCHEMA: 17,
    TOOBIG: 18,
    CONSTRAINT: 19,
    MISMATCH: 20,
    MISUSE: 21,
    NOLFS: 22,
    AUTH: 23,
    FORMAT: 24,
    RANGE: 25,
    NOTADB: 26,
    NOTICE: 27,
    WARNING: 28,
    ROW: 100,
    DONE: 101,
  },
} as const;

export interface SqliteOpenConfig {
  database: string;
  flags?: number;
  readOnly?: boolean;
  noMutex?: boolean;
  timeout?: number;
  strict?: boolean;
  authToken?: string;
  syncUrl?: string;
  remoteUrl?: string;
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
  /** @internal */
  openSync?(config: SqliteOpenConfig): SyncSqliteConnection;
  databaseExists?(config: SqliteOpenConfig): boolean | Promise<boolean>;
  restoreFromPath?(sourcePath: string, destination: string): Promise<void>;
}
