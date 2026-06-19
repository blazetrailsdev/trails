import Database from "libsql";
import { getFs } from "@blazetrails/activesupport/fs-adapter";
import { ConfigurationError } from "../errors.js";
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
class LibsqlStatement implements SqliteStatement, SyncSqliteStatement {
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
    // libsql (better-sqlite3 API) has no explicit finalize; statements are GC'd.
  }
}

/** @internal */
class LibsqlConnection implements SqliteConnection, SyncSqliteConnection {
  readonly raw: Database.Database;

  constructor(db: Database.Database) {
    this.raw = db;
  }

  prepare(sql: string): LibsqlStatement {
    return new LibsqlStatement(this.raw.prepare(sql));
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
 * otherwise the bare decoded filesystem path. Mirrors the better-sqlite3
 * driver's resolver.
 * @internal
 */
function resolveDatabasePath(database: string): string | null {
  if (database === ":memory:") return null;
  if (!database.startsWith("file:")) return database;
  if (database.startsWith("file::memory:")) return null;
  let url: URL;
  try {
    url = new URL(database, "file:///");
  } catch {
    return database;
  }
  if (url.searchParams.get("mode") === "memory") return null;
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return url.pathname;
  }
}

/** @internal */
function openDatabase(config: SqliteOpenConfig): Database.Database {
  // libsql shares better-sqlite3's Options shape; spec keys (readOnly, timeout)
  // win over duplicates in driverOptions so AR config takes precedence.
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
  // libsql disables runtime extension loading; loadExtension() throws.
  loadExtension: false,
  concurrentStatements: true,
  foreignKeysOnByDefault: false,
  immediateTransactions: true,
};

export const libsqlDriver: SqliteDriver = {
  name: "libsql",
  capabilities,

  open(config: SqliteOpenConfig): Promise<SqliteConnection> {
    return Promise.resolve(new LibsqlConnection(openDatabase(config)));
  },

  openSync(config: SqliteOpenConfig): SyncSqliteConnection {
    return new LibsqlConnection(openDatabase(config));
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
    // libsql exposes better-sqlite3's backup() signature, but the local build
    // throws "not implemented" for it (backup is reserved for the remote-sync
    // path). Try the page-copy primitive first so we benefit if a future build
    // implements it, then fall back to an async file clone of the source DB.
    const source = new Database(sourcePath, { readonly: true });
    try {
      await source.backup(destination);
      return;
    } catch {
      /* fall through to file-clone fallback */
    } finally {
      source.close();
    }
    // File-clone fallback: copy the cleanly-closed source DB file's bytes into
    // destination. Unlike the native backup primitive (which sets
    // SQLITE_OPEN_URI and resolves the destination), a raw file write needs a
    // real path: decode `file:` URIs, and reject in-memory destination URIs
    // since a clone cannot populate the held shared-cache memory DB.
    const destPath = resolveDatabasePath(destination);
    if (destPath === null) {
      throw new ConfigurationError(
        "libsql restoreFromPath cannot populate an in-memory destination " +
          `(${destination}) via the file-clone fallback; libsql's backup() ` +
          "primitive is required for memory-backed restores.",
      );
    }
    const fs = getFs();
    if (fs.readFile === undefined || fs.writeFile === undefined) {
      throw new ConfigurationError(
        "libsql restoreFromPath fallback requires async fs.readFile/fs.writeFile; " +
          "the configured fs adapter provides neither.",
      );
    }
    const bytes = await fs.readFile(resolveDatabasePath(sourcePath) ?? sourcePath);
    await fs.writeFile(destPath, bytes);
  },
};
