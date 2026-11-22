import "./constants.js";
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
  type SqliteStatement,
  type SyncSqliteConnection,
  type SyncSqliteStatement,
} from "./driver.js";
import { resolveUriDatabasePath } from "./sqlite-uri.js";
import { rbSqlite3Raise, rbSqlite3RaiseWithSql } from "./errors.js";
import { errors, loadNodeSqlite, nodeSqlite, sharedCacheDatabase } from "./engine/node-sqlite.js";
import "./constants.generated.js";

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
      rbSqlite3Raise(e, errors);
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
    this.boundParams = Array.isArray(binds)
      ? binds.map((value: unknown) =>
          value instanceof Number
            ? value.valueOf()
            : typeof value === "number" && Number.isInteger(value)
              ? BigInt(value)
              : (value as SqliteBindValue),
        )
      : binds;
  }

  step(): null {
    this.run(this.boundParams);
    return null;
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
      rbSqlite3RaiseWithSql(e, sql, errors);
    }
  }

  isOpen(): boolean {
    return this._open;
  }

  filename(dbName = "main"): string | null {
    const list = this.pragma("database_list") as { name: string; file: string }[];
    return list.find(({ name }) => name === dbName)?.file ?? null;
  }

  exec(sql: string): void {
    try {
      this.raw.exec(sql);
    } catch (e) {
      rbSqlite3Raise(e, errors);
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

  rollback(): true {
    this.execute("rollback transaction");
    return true;
  }

  getFirstValue(sql: string, ...bindVars: SqliteBindValue[]): unknown {
    const rs = this.prepare(sql);
    try {
      for (const row of rs.iterate(bindVars)) {
        return (row as Record<string, unknown>)[rs.columns()[0].name];
      }
    } finally {
      rs.close();
    }
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
      rbSqlite3Raise(e, errors);
    }
  }

  changes(): number {
    try {
      this.#changesStmt ??= this.raw.prepare("SELECT changes() AS v");
      return (this.#changesStmt.get() as { v: number }).v;
    } catch (e) {
      rbSqlite3Raise(e, errors);
    }
  }

  lastInsertRowId(): number | bigint {
    try {
      this.#lastInsertRowIdStmt ??= this.raw.prepare("SELECT last_insert_rowid() AS v");
      return (this.#lastInsertRowIdStmt.get() as { v: number | bigint }).v;
    } catch (e) {
      rbSqlite3Raise(e, errors);
    }
  }

  #changesStmt?: import("node:sqlite").StatementSync;
  #lastInsertRowIdStmt?: import("node:sqlite").StatementSync;

  close(): void {
    try {
      this._open = false;
      this.raw.close();
    } catch (e) {
      rbSqlite3Raise(e, errors);
    }
  }
}

/** @internal */
function openDatabase(config: SqliteOpenConfig): import("node:sqlite").DatabaseSync {
  const { DatabaseSync } = loadNodeSqlite();
  const opts: import("node:sqlite").DatabaseSyncOptions = {
    ...(config.driverOptions as import("node:sqlite").DatabaseSyncOptions | undefined),
    readOnly: config.readOnly ?? false,
    enableForeignKeyConstraints: false,
  };
  opts.enableDoubleQuotedStringLiterals = !(config.strict ?? false);
  try {
    return new DatabaseSync(sharedCacheDatabase(config.database, config.flags ?? 0), opts);
  } catch (e) {
    rbSqlite3Raise(e, errors);
  }
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
    const sqlite = loadNodeSqlite();
    const source = new sqlite.DatabaseSync(sourcePath, { readOnly: true });
    try {
      await sqlite.backup(source, destination);
    } finally {
      source.close();
    }
  },
};
