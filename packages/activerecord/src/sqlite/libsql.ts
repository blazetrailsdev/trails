/** @noRailsEquivalent PERMANENT MOVED-BY-SHORT-NAME: databaseExists, open. */
import Database from "libsql";
import { File, FileUtils } from "@blazetrails/ruby-compat";
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
import { resolveUriDatabasePath } from "./sqlite-uri.js";

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

  private _closed = false;

  get closed(): boolean {
    return this._closed;
  }

  close(): void {
    this._closed = true;
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

  async sync(): Promise<void> {
    await this.raw.sync();
  }
}

export interface SyncableSqliteConnection extends SqliteConnection {
  sync(): Promise<void>;
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

export const libsqlRemoteDriver: SqliteDriver = {
  name: "libsql-remote",
  capabilities: remoteCapabilities,

  open(config: SqliteOpenConfig): Promise<SqliteConnection> {
    return Promise.resolve(new LibsqlConnection(openRemoteDatabase(config)));
  },
};

export function isReplicaConfig(config: SqliteOpenConfig): boolean {
  const syncUrl = (config.driverOptions as { syncUrl?: unknown } | undefined)?.syncUrl;
  return typeof syncUrl === "string" && syncUrl.length > 0;
}

export interface LibsqlReplicaOptions extends Database.Options {
  authToken?: string;
  syncPeriod?: number;
}

/** @internal */
export function buildReplicaOptions(config: SqliteOpenConfig): LibsqlReplicaOptions {
  if (!isReplicaConfig(config)) {
    throw new ConfigurationError(
      "libsql embedded-replica mode requires a non-empty `syncUrl` in " +
        "driverOptions (alongside the local replica path); none was provided.",
    );
  }
  const opts: LibsqlReplicaOptions = {
    ...(config.driverOptions as LibsqlReplicaOptions | undefined),
  };
  if (config.timeout !== undefined) opts.timeout = config.timeout;
  if (opts.syncPeriod !== undefined) {
    if (
      typeof opts.syncPeriod !== "number" ||
      !Number.isFinite(opts.syncPeriod) ||
      opts.syncPeriod <= 0
    ) {
      throw new ConfigurationError(
        "libsql embedded-replica `syncPeriod` must be a positive number of " +
          `seconds (got ${String(opts.syncPeriod)}); omit it for caller-driven sync.`,
      );
    }
  }
  return opts;
}

/** @internal */
function openReplicaDatabase(config: SqliteOpenConfig): Database.Database {
  return new Database(config.database, buildReplicaOptions(config));
}

const replicaCapabilities: SqliteDriverCapabilities = {
  inProcessSync: false,
  streaming: false,
  loadExtension: false,
  concurrentStatements: false,
  foreignKeysOnByDefault: false,
  immediateTransactions: false,
};

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
    const path = resolveUriDatabasePath(config.database);
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
      return;
    } catch {
    } finally {
      source.close();
    }
    const destPath = resolveUriDatabasePath(destination);
    if (destPath === null) {
      throw new ConfigurationError(
        "libsql restoreFromPath cannot populate an in-memory destination " +
          `(${destination}) via the file-clone fallback; libsql's backup() ` +
          "primitive is required for memory-backed restores.",
      );
    }
    FileUtils.cp(resolveUriDatabasePath(sourcePath) ?? sourcePath, destPath);
  },
};
