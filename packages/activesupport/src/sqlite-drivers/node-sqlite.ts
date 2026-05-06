import { createRequire } from "node:module";
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

// Soft-load: Node 22.5+ only. Sync via createRequire so the module stays sync.
// open() rejects with a clear error on Node < 22.5 instead of crashing on import.
type NodeSqliteModule = typeof import("node:sqlite");
let nodeSqlite: NodeSqliteModule | undefined;
try {
  nodeSqlite = createRequire(import.meta.url)("node:sqlite") as NodeSqliteModule;
} catch {
  /* Node < 22.5 or --experimental-sqlite not set */
}

/** True when node:sqlite loaded successfully; use as a describe.skipIf gate in tests. */
export const isNodeSqliteAvailable = nodeSqlite !== undefined;

/** @internal */
function expandBinds(binds: SqliteBinds | undefined): unknown[] {
  if (binds === undefined) return [];
  if (Array.isArray(binds)) return binds as unknown[];
  return [binds]; // named object is the first positional argument
}

/** @internal */
class NodeSqliteStatement implements SqliteStatement, SyncSqliteStatement {
  readonly reader: boolean;

  constructor(private readonly stmt: import("node:sqlite").StatementSync) {
    stmt.setAllowBareNamedParameters(true); // allow { name: val } to bind $name
    const sql = stmt.sourceSQL.trimStart().toUpperCase();
    // PRAGMA without `=` returns rows; PRAGMA with `=` is a write. Matches better-sqlite3.
    this.reader =
      /^(SELECT|WITH|EXPLAIN|VALUES|TABLE)\b/.test(sql) ||
      (/^PRAGMA\b/.test(sql) && !sql.includes("="));
  }

  private call<T>(method: string, binds: SqliteBinds | undefined): T {
    return (this.stmt as unknown as Record<string, (...a: unknown[]) => T>)[method]!(
      ...expandBinds(binds),
    );
  }

  run(binds?: SqliteBinds): RunResult {
    const r = this.call<import("node:sqlite").StatementResultingChanges>("run", binds);
    return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
  }

  get(binds?: SqliteBinds): unknown {
    return this.call<unknown>("get", binds);
  }

  all(binds?: SqliteBinds): unknown[] {
    return this.call<unknown[]>("all", binds);
  }

  iterate(binds?: SqliteBinds): Iterable<unknown> {
    return this.call<Iterable<unknown>>("iterate", binds);
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
    this.stmt.setReadBigInts(on);
  }
}

/** @internal */
class NodeSqliteConnection implements SqliteConnection, SyncSqliteConnection {
  readonly raw: import("node:sqlite").DatabaseSync;
  private _open = true;

  constructor(db: import("node:sqlite").DatabaseSync) {
    this.raw = db;
  }

  prepare(sql: string): NodeSqliteStatement {
    return new NodeSqliteStatement(this.raw.prepare(sql));
  }

  isOpen(): boolean {
    return this._open;
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  pragma(source: string, opts?: { simple?: boolean }): unknown {
    const stmt = this.raw.prepare(`PRAGMA ${source}`);
    if (opts?.simple) {
      const row = stmt.get() as Record<string, unknown> | undefined;
      return row !== undefined ? Object.values(row)[0] : undefined;
    }
    return stmt.all();
  }

  close(): void {
    this._open = false;
    this.raw.close();
  }
}

/** @internal */
function resolveDatabasePath(database: string): string | null {
  if (database === ":memory:" || database.startsWith("file::memory:")) return null;
  if (!database.startsWith("file:")) return database;
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
function openDatabase(config: SqliteOpenConfig): import("node:sqlite").DatabaseSync {
  if (!nodeSqlite) {
    throw new Error(
      "node:sqlite is not available. Node 22.5+ is required. " +
        "On Node 22.5–22.9 you may also need --experimental-sqlite.",
    );
  }
  const opts: import("node:sqlite").DatabaseSyncOptions = {
    ...(config.driverOptions as import("node:sqlite").DatabaseSyncOptions | undefined),
    readOnly: config.readOnly ?? false,
    enableForeignKeyConstraints: false, // match better-sqlite3 default
  };
  if (config.timeout !== undefined) opts.timeout = config.timeout;
  return new nodeSqlite.DatabaseSync(config.database, opts);
}

const capabilities: SqliteDriverCapabilities = {
  inProcessSync: true,
  streaming: true,
  loadExtension: false,
  concurrentStatements: true,
  foreignKeysOnByDefault: false,
  immediateTransactions: true,
};

export const nodeSqliteDriver: SqliteDriver = {
  name: "node-sqlite",
  capabilities,

  async open(config: SqliteOpenConfig): Promise<SqliteConnection> {
    return new NodeSqliteConnection(openDatabase(config));
  },

  openSync(config: SqliteOpenConfig): SyncSqliteConnection {
    return new NodeSqliteConnection(openDatabase(config));
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
};

registerSqliteDriver(nodeSqliteDriver);
