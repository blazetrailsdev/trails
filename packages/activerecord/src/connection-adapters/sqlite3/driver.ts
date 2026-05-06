import type { SQLite3AdapterOptions } from "../../adapter.js";

export type SqliteConfig = SQLite3AdapterOptions & { database: string };

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface ColumnInfo {
  name: string;
  column: string | null;
  table: string | null;
  database: string | null;
  type: string | null;
}

export interface SqliteStatement {
  run(...binds: unknown[]): RunResult | Promise<RunResult>;
  get(...binds: unknown[]): unknown | Promise<unknown>;
  all(...binds: unknown[]): unknown[] | Promise<unknown[]>;
  columns(): ColumnInfo[];
  setReadBigInts(on: boolean): void;
  /** True when the statement returns rows (SELECT/PRAGMA that yields rows). */
  readonly reader: boolean;
  finalize?(): void | Promise<void>;
}

export interface SqliteDriver {
  prepare(sql: string): SqliteStatement | Promise<SqliteStatement>;
  exec(sql: string): void | Promise<void>;
  pragma(source: string, opts?: { simple?: boolean }): unknown | Promise<unknown>;
  close(): void | Promise<void>;
  /** True while the database connection is open. */
  readonly open: boolean;
  readonly raw: unknown;
}

export interface DriverFactory {
  readonly name: string;
  open(config: SqliteConfig): Promise<SqliteDriver>;
}
