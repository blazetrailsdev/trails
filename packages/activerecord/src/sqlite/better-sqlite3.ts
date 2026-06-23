import Database from "better-sqlite3";
import { getFs } from "@blazetrails/activesupport/fs-adapter";
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
 * Map a `database` config value to the filesystem path `databaseExists()`
 * should probe, returning `null` for in-memory databases.
 *
 * better-sqlite3's build does NOT set `SQLITE_OPEN_URI`, so `open()` passes the
 * string straight to `sqlite3_open` without URI interpretation: `file:foo.db`
 * opens a literal on-disk file named `file:foo.db`, and even `file::memory:` /
 * `?mode=memory` are written as on-disk files (see `restoreFromPath`). The only
 * name `sqlite3_open` treats specially without the URI flag is the bare
 * `:memory:` alias. So `databaseExists()` must check the literal string to
 * agree with `open()`. (Contrast libsql.ts, whose resolver decodes `file:`
 * URIs because libsql IS URI-aware.)
 * @internal
 */
function resolveDatabasePath(database: string): string | null {
  return database === ":memory:" ? null : database;
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
  // `config.strict` is intentionally unread: better-sqlite3 compiles with
  // SQLITE_DQS=0 and exposes no sqlite3_db_config binding, so the strict
  // flag has nothing to attach to here.
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

  async restoreFromPath(sourcePath: string, destination: string): Promise<void> {
    // better-sqlite3's backup() page-copies the source handle into the
    // destination filename (folding in WAL pages), so the restore is
    // consistent even from a live/WAL template. NB: this build does not set
    // SQLITE_OPEN_URI, so `destination` is always a literal filename — a
    // `file:...?mode=memory` URI would be written as an on-disk file, not a
    // memory DB. Open the source read-only so a live template isn't blocked.
    const source = new Database(sourcePath, { readonly: true });
    try {
      await source.backup(destination);
    } finally {
      source.close();
    }
  },
};
