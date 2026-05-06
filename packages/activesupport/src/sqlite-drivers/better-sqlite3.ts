import Database from "better-sqlite3";
import { getFs } from "../fs-adapter.js";
import {
  registerSqliteDriver,
  type ColumnInfo,
  type RunResult,
  type SqliteBinds,
  type SqliteConnection,
  type SqliteDriver,
  type SqliteDriverCapabilities,
  type SqliteOpenConfig,
  type SqliteStatement,
} from "../sqlite-adapter.js";

/** @internal */
function bindArgs(binds?: SqliteBinds): unknown[] {
  if (binds === undefined) return [];
  if (Array.isArray(binds)) return binds as unknown[];
  return [binds as object];
}

/** @internal */
class BetterSqlite3Statement implements SqliteStatement {
  constructor(private readonly stmt: Database.Statement) {}

  run(binds?: SqliteBinds): RunResult {
    const result = this.stmt.run(...bindArgs(binds));
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }

  get(binds?: SqliteBinds): unknown {
    return this.stmt.get(...bindArgs(binds));
  }

  all(binds?: SqliteBinds): unknown[] {
    return this.stmt.all(...bindArgs(binds)) as unknown[];
  }

  iterate(binds?: SqliteBinds): IterableIterator<unknown> {
    return this.stmt.iterate(...bindArgs(binds)) as IterableIterator<unknown>;
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

  finalize(): void {
    // better-sqlite3 has no explicit finalize; statements are GC'd. No-op.
  }
}

/** @internal */
class BetterSqlite3Connection implements SqliteConnection {
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

  close(): void {
    this.raw.close();
  }
}

/**
 * Decode `file:` URIs and `:memory:` aliases. Returns `null` for memory
 * databases, otherwise the bare filesystem path.
 * @internal
 */
function resolveDatabasePath(database: string): string | null {
  if (database === ":memory:") return null;
  if (!database.startsWith("file:")) return database;
  const q = database.indexOf("?");
  const path = q === -1 ? database.slice("file:".length) : database.slice("file:".length, q);
  const params = q === -1 ? null : new URLSearchParams(database.slice(q + 1));
  if (path === ":memory:" || params?.get("mode") === "memory") return null;
  return path;
}

/** @internal */
function openDatabase(config: SqliteOpenConfig): Database.Database {
  const opts: Database.Options = { readonly: config.readOnly ?? false };
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

  openSync(config: SqliteOpenConfig): SqliteConnection {
    return new BetterSqlite3Connection(openDatabase(config));
  },

  databaseExists(config: SqliteOpenConfig): boolean {
    const path = resolveDatabasePath(config.database);
    if (path === null) return true; // memory database
    try {
      return getFs().existsSync(path);
    } catch {
      return false;
    }
  },
};

registerSqliteDriver(betterSqlite3Driver);
