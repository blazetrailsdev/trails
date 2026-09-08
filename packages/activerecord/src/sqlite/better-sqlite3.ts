/** @noRailsEquivalent PERMANENT MOVED-BY-SHORT-NAME: databaseExists, open. */
import Database from "better-sqlite3";
import { File } from "@blazetrails/ruby-compat";
import {
  type ColumnInfo,
  type RunResult,
  type SqliteBinds,
  type SqliteConnection,
  type SqliteDriver,
  type SqliteDriverCapabilities,
  type SqliteOpenConfig,
  type SqliteStatement,
  type SyncSqliteConnection,
  type SyncSqliteStatement,
} from "../sqlite-adapter.js";

/** @internal */
function bindArgs(binds?: SqliteBinds): unknown[] {
  if (binds === undefined) return [];
  if (Array.isArray(binds)) return binds as unknown[];
  return [binds as object];
}

/** @internal */
function withNullBinds<T>(source: string, args: unknown[], call: (args: unknown[]) => T): T {
  const limit = args.length + (source.split("?").length - 1);
  let padded = args;
  for (;;) {
    try {
      return call(padded);
    } catch (e) {
      if (
        !(e instanceof RangeError) ||
        !e.message.startsWith("Too few parameter values were provided") ||
        padded.length >= limit
      ) {
        throw e;
      }
      padded = [...padded, null];
    }
  }
}

/** @internal */
class BetterSqlite3Statement implements SqliteStatement, SyncSqliteStatement {
  constructor(private readonly stmt: Database.Statement) {}

  private bind<T>(binds: SqliteBinds | undefined, call: (args: unknown[]) => T): T {
    const args = bindArgs(binds);
    if (binds !== undefined && !Array.isArray(binds)) return call(args);
    return withNullBinds(this.stmt.source, args, call);
  }

  run(binds?: SqliteBinds): RunResult {
    const result = this.bind(binds, (args) => this.stmt.run(...args));
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }

  get(binds?: SqliteBinds): unknown {
    return this.bind(binds, (args) => this.stmt.get(...args));
  }

  all(binds?: SqliteBinds): unknown[] {
    return this.bind(binds, (args) => this.stmt.all(...args));
  }

  iterate(binds?: SqliteBinds): IterableIterator<unknown> {
    return this.bind(binds, (args) => this.stmt.iterate(...args));
  }

  get reader(): boolean {
    return this.stmt.reader;
  }

  columns(): ColumnInfo[] {
    return this.stmt.columns().map((c) => ({
      name: c.name,
      column: c.column,
      table: c.table,
      database: c.database,
      type: c.type,
    }));
  }

  setReadBigInts(on: boolean): void {
    this.stmt.safeIntegers(on);
  }

  private _closed = false;

  get closed(): boolean {
    return this._closed;
  }

  close(): void {
    this._closed = true;
  }
}

/** @internal */
class BetterSqlite3Connection implements SqliteConnection, SyncSqliteConnection {
  readonly raw: Database.Database;

  constructor(db: Database.Database) {
    this.raw = db;
  }

  prepare(sql: string): BetterSqlite3Statement {
    return new BetterSqlite3Statement(this.raw.prepare(sql));
  }

  isOpen(): boolean {
    return this.raw.open;
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  pragma(source: string, opts?: { simple?: boolean }): unknown {
    return this.raw.pragma(source, opts);
  }

  changes(): number {
    this.#changesStmt ??= this.raw.prepare("SELECT changes() AS v");
    return (this.#changesStmt.get() as { v: number }).v;
  }

  lastInsertRowId(): number | bigint {
    this.#lastInsertRowIdStmt ??= this.raw.prepare("SELECT last_insert_rowid() AS v");
    return (this.#lastInsertRowIdStmt.get() as { v: number | bigint }).v;
  }

  #changesStmt?: Database.Statement;
  #lastInsertRowIdStmt?: Database.Statement;

  close(): void {
    this.raw.close();
  }
}

/** @internal */
function resolveDatabasePath(database: string): string | null {
  return database === ":memory:" ? null : database;
}

/** @internal */
function openDatabase(config: SqliteOpenConfig): Database.Database {
  const opts: Database.Options = {
    ...(config.driverOptions as Database.Options | undefined),
    readonly: config.readOnly ?? false,
  };
  if (config.timeout !== undefined) opts.timeout = config.timeout;
  return new Database(config.database, opts);
}

const capabilities: SqliteDriverCapabilities = {
  inProcessSync: true,
  streaming: true,
  loadExtension: true,
  concurrentStatements: true,
  foreignKeysOnByDefault: false,
  immediateTransactions: true,
};

export const betterSqlite3Driver: SqliteDriver = {
  name: "better-sqlite3",
  capabilities,

  open(config: SqliteOpenConfig): Promise<SqliteConnection> {
    return Promise.resolve(new BetterSqlite3Connection(openDatabase(config)));
  },

  openSync(config: SqliteOpenConfig): SyncSqliteConnection {
    return new BetterSqlite3Connection(openDatabase(config));
  },

  databaseExists(config: SqliteOpenConfig): boolean {
    const path = resolveDatabasePath(config.database);
    if (path === null) return true;
    try {
      return File.isExist(path);
    } catch {
      return false;
    }
  },

  async restoreFromPath(sourcePath: string, destination: string): Promise<void> {
    const source = new Database(sourcePath, { readonly: true });
    try {
      await source.backup(destination);
    } finally {
      source.close();
    }
  },
};
