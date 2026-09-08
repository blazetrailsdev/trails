/** @noRailsEquivalent PERMANENT MOVED-BY-SHORT-NAME: open. */
import { createRequire } from "node:module";
import {
  type ColumnInfo,
  type RunResult,
  type SqliteBinds,
  type SqliteConnection,
  type SqliteDriver,
  type SqliteDriverCapabilities,
  type SqliteOpenConfig,
  type SqliteStatement,
} from "../sqlite-adapter.js";
import { statementIsReader } from "./statement-reader.js";

/** @internal */
interface ExpoSQLiteStatement {
  executeAsync(params?: unknown[] | Record<string, unknown>): Promise<ExpoSQLiteExecuteResult>;
  finalizeAsync(): Promise<void>;
}
/** @internal */
interface ExpoSQLiteExecuteResult extends AsyncIterable<unknown> {
  changes: number;
  lastInsertRowId: number;
  getFirstAsync(): Promise<unknown>;
  getAllAsync(): Promise<unknown[]>;
}
/** @internal */
interface ExpoSQLiteDatabase {
  prepareAsync(sql: string): Promise<ExpoSQLiteStatement>;
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getAllAsync(sql: string, params?: unknown[]): Promise<unknown[]>;
  getFirstAsync(sql: string, params?: unknown[]): Promise<unknown>;
  closeAsync(): Promise<void>;
}
/** @internal */
interface ExpoSqliteModule {
  openDatabaseAsync(name: string, options?: Record<string, unknown>): Promise<ExpoSQLiteDatabase>;
}

let expoSqlite: ExpoSqliteModule | undefined;
try {
  expoSqlite = createRequire(import.meta.url)("expo-sqlite") as ExpoSqliteModule;
} catch {}

export const isExpoSqliteAvailable = expoSqlite !== undefined;

const NAMED_PREFIX = /^[$:@]/;

/** @internal */
function expandBinds(binds: SqliteBinds | undefined): unknown[] | Record<string, unknown> {
  if (binds === undefined) return [];
  if (Array.isArray(binds)) return binds as unknown[];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(binds)) {
    out[NAMED_PREFIX.test(k) ? k : `$${k}`] = v;
  }
  return out;
}

/** @internal */
class ExpoSqliteStatement implements SqliteStatement {
  readonly reader: boolean;

  constructor(
    private readonly stmt: ExpoSQLiteStatement,
    sql: string,
  ) {
    this.reader = statementIsReader(sql);
  }

  async run(binds?: SqliteBinds): Promise<RunResult> {
    const result = await this.stmt.executeAsync(expandBinds(binds));
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowId,
    };
  }

  async get(binds?: SqliteBinds): Promise<unknown> {
    const result = await this.stmt.executeAsync(expandBinds(binds));
    return result.getFirstAsync();
  }

  async all(binds?: SqliteBinds): Promise<unknown[]> {
    const result = await this.stmt.executeAsync(expandBinds(binds));
    return result.getAllAsync();
  }

  async *iterate(binds?: SqliteBinds): AsyncIterable<unknown> {
    const result = await this.stmt.executeAsync(expandBinds(binds));
    for await (const row of result) {
      yield row;
    }
  }

  columns(): ColumnInfo[] {
    return [];
  }

  setReadBigInts(_on: boolean): void {}

  private _closed = false;

  get closed(): boolean {
    return this._closed;
  }

  async close(): Promise<void> {
    this._closed = true;
    await this.stmt.finalizeAsync();
  }
}

/** @internal */
class ExpoSqliteConnection implements SqliteConnection {
  readonly raw: ExpoSQLiteDatabase;
  private _open = true;

  constructor(db: ExpoSQLiteDatabase) {
    this.raw = db;
  }

  async prepare(sql: string): Promise<ExpoSqliteStatement> {
    const stmt = await this.raw.prepareAsync(sql);
    return new ExpoSqliteStatement(stmt, sql);
  }

  isOpen(): boolean {
    return this._open;
  }

  async exec(sql: string): Promise<void> {
    await this.raw.execAsync(sql);
  }

  async pragma(source: string, opts?: { simple?: boolean }): Promise<unknown> {
    if (source.includes("=")) {
      await this.raw.execAsync(`PRAGMA ${source}`);
      return [];
    }
    if (opts?.simple) {
      const row = (await this.raw.getFirstAsync(`PRAGMA ${source}`)) as
        | Record<string, unknown>
        | undefined;
      return row !== undefined ? Object.values(row)[0] : undefined;
    }
    return this.raw.getAllAsync(`PRAGMA ${source}`);
  }

  async changes(): Promise<number> {
    const row = (await this.raw.getFirstAsync("SELECT changes() AS v")) as { v: number };
    return row.v;
  }

  async lastInsertRowId(): Promise<number | bigint> {
    const row = (await this.raw.getFirstAsync("SELECT last_insert_rowid() AS v")) as {
      v: number | bigint;
    };
    return row.v;
  }

  async close(): Promise<void> {
    this._open = false;
    await this.raw.closeAsync();
  }
}

const capabilities: SqliteDriverCapabilities = {
  inProcessSync: false,
  streaming: true,
  loadExtension: false,
  concurrentStatements: false,
  foreignKeysOnByDefault: false,
  immediateTransactions: true,
};

export const expoSqliteDriver: SqliteDriver = {
  name: "expo-sqlite",
  capabilities,

  async open(config: SqliteOpenConfig): Promise<SqliteConnection> {
    if (!expoSqlite) {
      throw new Error(
        "expo-sqlite is not available. This driver requires an Expo / React Native runtime.",
      );
    }
    const db = await expoSqlite.openDatabaseAsync(config.database, {
      ...config.driverOptions,
    });
    return new ExpoSqliteConnection(db);
  },
};
