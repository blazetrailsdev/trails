/** @noRailsEquivalent PERMANENT MOVED-BY-SHORT-NAME: databaseExists, open. */
import { createRequire } from "node:module";
import { File } from "@blazetrails/ruby-compat";
import {
  type ColumnInfo,
  type RunResult,
  type SqliteBindValue,
  type SqliteBinds,
  type SqliteConnection,
  type SqliteDriver,
  type SqliteDriverCapabilities,
  type SqliteOpenConfig,
  SQLite3Constants,
  type SqliteStatement,
  type SyncSqliteConnection,
  type SyncSqliteStatement,
} from "../sqlite-adapter.js";
import { resolveUriDatabasePath } from "./sqlite-uri.js";
import { rbSqlite3Raise, rbSqlite3RaiseWithSql } from "./errors.js";

type NodeSqliteModule = typeof import("node:sqlite");
let nodeSqlite: NodeSqliteModule | undefined;
try {
  nodeSqlite = createRequire(import.meta.url)("node:sqlite") as NodeSqliteModule;
} catch {}

export const isNodeSqliteAvailable = nodeSqlite !== undefined;

/** @internal */
function expandBinds(binds: SqliteBinds | undefined): unknown[] {
  if (binds === undefined) return [];
  if (Array.isArray(binds)) return binds as unknown[];
  return [binds];
}

/** @internal */
class NodeSqliteStatement implements SqliteStatement, SyncSqliteStatement {
  readonly reader: boolean;

  constructor(private readonly stmt: import("node:sqlite").StatementSync) {
    stmt.setAllowBareNamedParameters(true);
    this.reader = stmt.columns().length > 0;
  }

  private call<T>(method: string, binds: SqliteBinds | undefined): T {
    try {
      return (this.stmt as unknown as Record<string, (...a: unknown[]) => T>)[method](
        ...expandBinds(binds),
      );
    } catch (e) {
      rbSqlite3Raise(e);
    }
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

  private boundParams: SqliteBinds | undefined;

  bindParams(binds: SqliteBinds): void {
    this.boundParams = binds;
  }

  toA(): unknown[][] {
    this.stmt.setReturnArrays(true);
    try {
      return this.call<unknown[][]>("all", this.boundParams);
    } finally {
      this.stmt.setReturnArrays(false);
    }
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

  private _closed = false;

  get closed(): boolean {
    return this._closed;
  }

  close(): void {
    this._closed = true;
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
    try {
      return new NodeSqliteStatement(this.raw.prepare(sql));
    } catch (e) {
      rbSqlite3RaiseWithSql(e, sql);
    }
  }

  isOpen(): boolean {
    return this._open;
  }

  exec(sql: string): void {
    try {
      this.raw.exec(sql);
    } catch (e) {
      rbSqlite3Raise(e);
    }
  }

  execute(sql: string, bindVars?: SqliteBinds): readonly unknown[];
  execute(
    sql: string,
    bindVars: SqliteBinds | undefined,
    block: ((row: unknown) => void) | undefined,
  ): readonly unknown[] | null;
  execute(
    sql: string,
    bindVars: SqliteBinds = [],
    block?: (row: unknown) => void,
  ): readonly unknown[] | null {
    const stmt = this.prepare(sql);
    try {
      if (block) {
        for (const row of stmt.all(bindVars)) block(row);
        return null;
      } else {
        return Object.freeze(stmt.all(bindVars));
      }
    } finally {
      stmt.close();
    }
  }

  getFirstValue(sql: string, ...bindVars: SqliteBindValue[]): unknown {
    const row = this.execute(sql, bindVars)[0];
    if (row) return Object.values(row as object)[0];
    return null;
  }

  pragma(source: string, opts?: { simple?: boolean }): unknown {
    try {
      const stmt = this.raw.prepare(`PRAGMA ${source}`);
      if (source.includes("=")) {
        stmt.run();
        return [];
      }
      if (opts?.simple) {
        const row = stmt.get() as Record<string, unknown> | undefined;
        return row !== undefined ? Object.values(row)[0] : undefined;
      }
      return stmt.all();
    } catch (e) {
      rbSqlite3Raise(e);
    }
  }

  changes(): number {
    try {
      this.#changesStmt ??= this.raw.prepare("SELECT changes() AS v");
      return (this.#changesStmt.get() as { v: number }).v;
    } catch (e) {
      rbSqlite3Raise(e);
    }
  }

  lastInsertRowId(): number | bigint {
    try {
      this.#lastInsertRowIdStmt ??= this.raw.prepare("SELECT last_insert_rowid() AS v");
      return (this.#lastInsertRowIdStmt.get() as { v: number | bigint }).v;
    } catch (e) {
      rbSqlite3Raise(e);
    }
  }

  #changesStmt?: import("node:sqlite").StatementSync;
  #lastInsertRowIdStmt?: import("node:sqlite").StatementSync;

  close(): void {
    try {
      this._open = false;
      this.raw.close();
    } catch (e) {
      rbSqlite3Raise(e);
    }
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
    enableForeignKeyConstraints: false,
  };
  if (config.timeout !== undefined) opts.timeout = config.timeout;
  opts.enableDoubleQuotedStringLiterals = !(config.strict ?? false);
  try {
    return new nodeSqlite.DatabaseSync(sharedCacheDatabase(config), opts);
  } catch (e) {
    rbSqlite3Raise(e);
  }
}

function sharedCacheDatabase(config: SqliteOpenConfig): string {
  if (((config.flags ?? 0) & SQLite3Constants.Open.SHAREDCACHE) === 0) return config.database;
  if (config.database.startsWith("file:")) {
    const hash = config.database.indexOf("#");
    const body = hash === -1 ? config.database : config.database.slice(0, hash);
    const fragment = hash === -1 ? "" : config.database.slice(hash);
    return `${body}${body.includes("?") ? "&" : "?"}cache=shared${fragment}`;
  }
  return `file:${config.database}?cache=shared`;
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
    const path = resolveUriDatabasePath(config.database);
    if (path === null) return true;
    try {
      return File.isExist(path);
    } catch {
      return false;
    }
  },

  async restoreFromPath(sourcePath: string, destination: string): Promise<void> {
    if (!nodeSqlite) {
      throw new Error(
        "node:sqlite is not available. Node 22.5+ is required. " +
          "On Node 22.5–22.9 you may also need --experimental-sqlite.",
      );
    }
    const source = new nodeSqlite.DatabaseSync(sourcePath, { readOnly: true });
    try {
      await nodeSqlite.backup(source, destination);
    } finally {
      source.close();
    }
  },
};
