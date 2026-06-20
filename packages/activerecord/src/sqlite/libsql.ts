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

  /**
   * Pull the latest changes from the remote primary into this embedded
   * replica. Only meaningful for replica handles (opened with a `syncUrl`);
   * libsql's `Database.sync()` throws for plain local/remote handles, so the
   * replica adapter is the only caller. Exposed here as the narrow,
   * libsql-specific escape hatch the core `SqliteConnection` interface omits.
   */
  async sync(): Promise<void> {
    await this.raw.sync();
  }
}

/**
 * A libsql connection that can pull from a remote primary via {@link sync}.
 * Embedded-replica handles satisfy this; plain local/remote handles do not.
 */
export interface SyncableSqliteConnection extends SqliteConnection {
  sync(): Promise<void>;
}

/**
 * Decode `file:` URIs (including `file://`, percent-encoding, and `?mode=`
 * query strings) and `:memory:` aliases. Returns `null` for memory databases,
 * otherwise the decoded filesystem path.
 *
 * Unlike better-sqlite3 (whose build doesn't set `SQLITE_OPEN_URI`, so it
 * treats the string literally), libsql is URI-aware and opens a rootless
 * `file:foo.db` relative to the cwd. So this resolver preserves relative
 * `file:` paths (returning `foo.db`, not `/foo.db`) so `databaseExists()`
 * checks the path libsql actually opens; only `file:/...` / `file://host/...`
 * is absolute.
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
  const decode = (s: string): string => {
    try {
      return decodeURIComponent(s);
    } catch {
      // Malformed escapes (e.g. lone "%") keep databaseExists() total.
      return s;
    }
  };
  // `new URL` anchors a rootless path at "/", losing relativity. A `file:` body
  // that doesn't start with "/" (e.g. `file:foo.db`, `file:./foo.db`) is a
  // cwd-relative SQLite URI; strip any `?query`/`#frag` and return it as-is.
  const body = database.slice("file:".length);
  if (!body.startsWith("/")) {
    const sep = body.search(/[?#]/);
    return decode(sep === -1 ? body : body.slice(0, sep));
  }
  return decode(url.pathname);
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

/**
 * Returns true when the URL scheme identifies a remote libsql/Turso endpoint
 * (`libsql://`, `http://`, `https://`, `ws://`, `wss://`). Used by the remote
 * driver and config helpers to distinguish network from local-file configs.
 */
export function isRemoteLibsqlUrl(url: string): boolean {
  return (
    url.startsWith("libsql://") ||
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("wss://") ||
    url.startsWith("ws://")
  );
}

/** @internal */
function openRemoteDatabase(config: SqliteOpenConfig): Database.Database {
  // driverOptions carries authToken (and any other driver-specific keys).
  // Unlike the local openDatabase, we don't force readonly here — remote
  // Turso connections don't expose a read-only open mode.
  const opts: Database.Options = { ...(config.driverOptions as Database.Options | undefined) };
  if (config.timeout !== undefined) opts.timeout = config.timeout;
  return new Database(config.database, opts);
}

const remoteCapabilities: SqliteDriverCapabilities = {
  inProcessSync: false,
  streaming: false,
  loadExtension: false,
  concurrentStatements: false,
  foreignKeysOnByDefault: false,
  immediateTransactions: false,
};

/**
 * libsql driver for remote Turso connections (`libsql://`, `https://`, etc.).
 *
 * Remote handles are network-backed; they must go through the async-open path
 * (`AbstractSQLite3Adapter.openAsync()` / `completeAsyncConnect()`). The driver
 * intentionally omits `openSync` so the abstract base defers to `connectAsync`.
 * `restoreFromPath` and `databaseExists` are omitted — remote databases have no
 * local-file counterpart.
 *
 * `connectAsync` issues `SELECT sqlite_version()` and `PRAGMA encoding` over
 * the network during open. Turso supports both, so the happy path is reliable;
 * a network error surfaces as a `DatabaseConnectionError` at connect time.
 */
export const libsqlRemoteDriver: SqliteDriver = {
  name: "libsql-remote",
  capabilities: remoteCapabilities,

  open(config: SqliteOpenConfig): Promise<SqliteConnection> {
    return Promise.resolve(new LibsqlConnection(openRemoteDatabase(config)));
  },
};

/**
 * Returns true when a config selects libsql **embedded-replica** mode — i.e. a
 * non-empty `syncUrl` is present in `driverOptions`. A replica keeps a local
 * file (`config.database`) in sync with the remote primary named by `syncUrl`;
 * this distinguishes it from a plain remote config (no local file) or a plain
 * local config (no `syncUrl`).
 */
export function isReplicaConfig(config: SqliteOpenConfig): boolean {
  const syncUrl = (config.driverOptions as { syncUrl?: unknown } | undefined)?.syncUrl;
  return typeof syncUrl === "string" && syncUrl.length > 0;
}

/** @internal */
function openReplicaDatabase(config: SqliteOpenConfig): Database.Database {
  if (!isReplicaConfig(config)) {
    throw new ConfigurationError(
      "libsql embedded-replica mode requires a non-empty `syncUrl` in " +
        "driverOptions (alongside the local replica path); none was provided.",
    );
  }
  // driverOptions carries syncUrl + authToken (and any other driver keys). The
  // local replica file is config.database, so unlike the remote driver we open
  // a path, not a URL. Don't force readonly — replicas accept writes (which are
  // forwarded to the primary).
  const opts: Database.Options = { ...(config.driverOptions as Database.Options | undefined) };
  if (config.timeout !== undefined) opts.timeout = config.timeout;
  return new Database(config.database, opts);
}

const replicaCapabilities: SqliteDriverCapabilities = {
  inProcessSync: false,
  streaming: false,
  loadExtension: false,
  concurrentStatements: false,
  foreignKeysOnByDefault: false,
  immediateTransactions: false,
};

/**
 * libsql driver for **embedded-replica** connections: a local file
 * (`config.database`) kept in sync with a remote Turso primary named by
 * `driverOptions.syncUrl`. Reads are served locally; `sync()` pulls the latest
 * primary state into the local file.
 *
 * Construction (`new Database(localPath, { syncUrl, authToken })`) performs an
 * initial network sync, so the driver goes through the async-open path
 * (`openSync` omitted, like the remote driver). `databaseExists` and
 * `restoreFromPath` are omitted — the replica file is materialized by libsql on
 * first sync, not a caller-managed local DB.
 */
export const libsqlReplicaDriver: SqliteDriver = {
  name: "libsql-replica",
  capabilities: replicaCapabilities,

  async open(config: SqliteOpenConfig): Promise<SqliteConnection> {
    return new LibsqlConnection(openReplicaDatabase(config));
  },
};

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
