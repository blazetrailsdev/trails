import Database from "better-sqlite3";
import { getFs } from "@blazetrails/ruby-compat";
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
class BetterSqlite3Statement implements SqliteStatement, SyncSqliteStatement {
  constructor(private readonly stmt: Database.Statement) {}

  run(binds?: SqliteBinds): RunResult {
    const result = this.stmt.run(...bindArgs(binds));
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }

  get(binds?: SqliteBinds): unknown {
    return this.stmt.get(...bindArgs(binds));
  }

  all(binds?: SqliteBinds): unknown[] {
    return this.stmt.all(...bindArgs(binds));
  }

  iterate(binds?: SqliteBinds): IterableIterator<unknown> {
    return this.stmt.iterate(...bindArgs(binds));
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

  finalize(): void {}
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
      return getFs().existsSync(path);
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
