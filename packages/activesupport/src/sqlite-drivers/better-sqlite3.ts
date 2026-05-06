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

  close(): void {
    this.raw.close();
  }
}

/**
 * Decode `file:` URIs (including `file://`, percent-encoding, and `?mode=`
 * query strings) and `:memory:` aliases. Returns `null` for memory databases,
 * otherwise the bare decoded filesystem path.
 * @internal
 */
function resolveDatabasePath(database: string): string | null {
  if (database === ":memory:") return null;
  if (!database.startsWith("file:")) return database;
  // Special-case `file::memory:` (with or without query) before URL parsing —
  // the SQLite URI shape doesn't round-trip through `new URL` cleanly.
  if (database.startsWith("file::memory:")) return null;
  let url: URL;
  try {
    // Anchor relative forms (`file:foo.db`) against a fixed base so URL
    // accepts them; the base is discarded because we only read pathname.
    url = new URL(database, "file:///");
  } catch {
    return database;
  }
  if (url.searchParams.get("mode") === "memory") return null;
  // decodeURIComponent throws on malformed escapes (e.g. lone "%"); fall back
  // to the raw pathname so databaseExists() stays a total function.
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return url.pathname;
  }
}

/** @internal */
function openDatabase(config: SqliteOpenConfig): Database.Database {
  // better-sqlite3 specific keys, surfaced via the plan's `driverOptions`
  // pass-through. Spec keys (readOnly, timeout) win over duplicates in
  // driverOptions so AR config takes precedence.
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
    if (path === null) return true; // memory database
    try {
      return getFs().existsSync(path);
    } catch {
      return false;
    }
  },
};

registerSqliteDriver(betterSqlite3Driver);
