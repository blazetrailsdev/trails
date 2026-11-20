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
  busyHandler?: (count: number) => boolean | Promise<boolean>;
  busyHandlerTimeout?: number;
  exec(sql: string): void | Promise<void>;
  execute(sql: string, bindVars?: SqliteBinds): readonly unknown[] | Promise<readonly unknown[]>;
  execute(
    sql: string,
    bindVars: SqliteBinds | undefined,
    block: ((row: unknown) => void) | undefined,
  ): readonly unknown[] | null | Promise<readonly unknown[] | null>;
  rollback(): true | Promise<true>;
  getFirstValue(sql: string, ...bindVars: SqliteBindValue[]): unknown | Promise<unknown>;
  pragma(source: string, opts?: { simple?: boolean }): unknown | Promise<unknown>;
  changes(): number | Promise<number>;
  lastInsertRowId(): number | bigint | Promise<number | bigint>;
  close(): void | Promise<void>;
  isOpen(): boolean;
  filename(dbName?: string): string | null | Promise<string | null>;
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
  busyHandler?: (count: number) => boolean | Promise<boolean>;
  busyHandlerTimeout?: number;
  exec(sql: string): void;
  execute(sql: string, bindVars?: SqliteBinds): readonly unknown[];
  execute(
    sql: string,
    bindVars: SqliteBinds | undefined,
    block: ((row: unknown) => void) | undefined,
  ): readonly unknown[] | null;
  rollback(): true;
  getFirstValue(sql: string, ...bindVars: SqliteBindValue[]): unknown;
  pragma(source: string, opts?: { simple?: boolean }): unknown;
  changes(): number;
  lastInsertRowId(): number | bigint;
  close(): void;
  isOpen(): boolean;
  filename(dbName?: string): string | null;
  readonly raw: unknown;
}

export interface SqliteOpenConfig {
  database: string;
  flags?: number;
  readOnly?: boolean;
  noMutex?: boolean;
  strict?: boolean;
  authToken?: string;
  syncUrl?: string;
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
  databaseExists?(config: SqliteOpenConfig): boolean | Promise<boolean>;
  restoreFromPath?(sourcePath: string, destination: string): Promise<void>;
}
