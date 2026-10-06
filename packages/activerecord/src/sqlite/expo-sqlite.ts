/** @noRailsEquivalent CONVERGEABLE sqlite3-gem-c-surface-and-driver-covers-score-against-the-vendored-gem MOVED-BY-SHORT-NAME: open. */
import { createRequire } from "node:module";
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
} from "../sqlite-adapter.js";
import { statementIsReader } from "./statement-reader.js";
import { ConfigurationError } from "../errors.js";
import { rbSqlite3Raise, rbSqlite3RaiseWithSql } from "./errors.js";

/** @internal */
interface ExpoSQLiteStatement {
  executeAsync(params?: unknown[] | Record<string, unknown>): Promise<ExpoSQLiteExecuteResult>;
  executeForRawResultAsync(
    params?: unknown[] | Record<string, unknown>,
  ): Promise<ExpoSQLiteExecuteResult>;
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

const COMPLETE_KEYWORDS: Record<string, number> = {
  explain: 3,
  create: 4,
  temp: 5,
  temporary: 5,
  trigger: 6,
  end: 7,
};

const COMPLETE_TRANS = [
  [1, 0, 2, 3, 4, 2, 2, 2],
  [1, 1, 2, 3, 4, 2, 2, 2],
  [1, 2, 2, 2, 2, 2, 2, 2],
  [1, 3, 3, 2, 4, 2, 2, 2],
  [1, 4, 2, 2, 2, 4, 5, 2],
  [6, 5, 5, 5, 5, 5, 5, 5],
  [6, 6, 5, 5, 5, 5, 5, 7],
  [1, 7, 5, 5, 5, 5, 5, 5],
];

/** @internal */
function statementTail(sql: string): [tail: number, empty: boolean] {
  let state = 1;
  let empty = true;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    let token = 2;
    if (c === ";") {
      token = 0;
      i++;
    } else if (/\s/.test(c)) {
      token = 1;
      i++;
    } else if (c === "/" && sql[i + 1] === "*") {
      const close = sql.indexOf("*/", i + 2);
      if (close === -1) return [sql.length, empty];
      token = 1;
      i = close + 2;
    } else if (c === "-" && sql[i + 1] === "-") {
      const newline = sql.indexOf("\n", i);
      if (newline === -1) return [sql.length, empty];
      token = 1;
      i = newline + 1;
    } else if (c === "[" || c === "`" || c === '"' || c === "'") {
      const close = sql.indexOf(c === "[" ? "]" : c, i + 1);
      if (close === -1) return [sql.length, false];
      i = close + 1;
    } else {
      const word = /^[A-Za-z_\u0080-\uffff][\w$\u0080-\uffff]*/.exec(sql.slice(i))?.[0];
      if (word !== undefined) token = COMPLETE_KEYWORDS[word.toLowerCase()] ?? 2;
      i += word?.length ?? 1;
    }
    if (token > 1) empty = false;
    state = COMPLETE_TRANS[state][token];
    if (token === 0 && state === 1) return [i, empty];
  }
  return [sql.length, empty];
}

/** @internal */
class ExpoSqliteStatement implements SqliteStatement {
  readonly reader: boolean;

  constructor(
    private readonly stmt: ExpoSQLiteStatement | null,
    sql: string,
    readonly remainder: string,
  ) {
    this.reader = statementIsReader(sql);
    this._closed = stmt === null;
  }

  async run(binds?: SqliteBinds): Promise<RunResult> {
    try {
      const result = await this.stmt!.executeAsync(expandBinds(binds));
      return {
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowId,
      };
    } catch (e) {
      rbSqlite3Raise(e);
    }
  }

  async get(binds?: SqliteBinds): Promise<unknown> {
    try {
      const result = await this.stmt!.executeAsync(expandBinds(binds));
      return await result.getFirstAsync();
    } catch (e) {
      rbSqlite3Raise(e);
    }
  }

  async all(binds?: SqliteBinds): Promise<unknown[]> {
    try {
      const result = await this.stmt!.executeAsync(expandBinds(binds));
      return await result.getAllAsync();
    } catch (e) {
      rbSqlite3Raise(e);
    }
  }

  async *iterate(binds?: SqliteBinds): AsyncIterable<unknown> {
    try {
      const result = await this.stmt!.executeAsync(expandBinds(binds));
      for await (const row of result) {
        yield row;
      }
    } catch (e) {
      rbSqlite3Raise(e);
    }
  }

  private boundParams: SqliteBinds | undefined;

  bindParams(binds: SqliteBinds): void {
    this.boundParams = binds;
  }

  async step(): Promise<null> {
    await this.run(this.boundParams);
    return null;
  }

  async toA(): Promise<unknown[][]> {
    try {
      const result = await this.stmt!.executeForRawResultAsync(expandBinds(this.boundParams));
      return (await result.getAllAsync()) as unknown[][];
    } catch (e) {
      rbSqlite3Raise(e);
    }
  }

  columns(): ColumnInfo[] {
    return [];
  }

  setReadBigInts(_on: boolean): void {}

  private _closed: boolean;

  get closed(): boolean {
    return this._closed;
  }

  async close(): Promise<void> {
    this._closed = true;
    try {
      await this.stmt?.finalizeAsync();
    } catch (e) {
      rbSqlite3Raise(e);
    }
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
    const [tail, empty] = statementTail(sql);
    const remainder = sql.slice(tail);
    try {
      const stmt = empty ? null : await this.raw.prepareAsync(sql.slice(0, tail));
      return new ExpoSqliteStatement(stmt, sql, remainder);
    } catch (e) {
      rbSqlite3RaiseWithSql(e, sql);
    }
  }

  isOpen(): boolean {
    return this._open;
  }

  async exec(sql: string): Promise<void> {
    sql = sql.trim();
    while (sql !== "") {
      const stmt = await this.prepare(sql);
      try {
        if (!stmt.closed) await stmt.step();
        sql = stmt.remainder.trim();
      } finally {
        await stmt.close();
      }
    }
  }

  execute(sql: string, bindVars?: SqliteBinds): Promise<readonly unknown[]>;
  execute(
    sql: string,
    bindVars: SqliteBinds | undefined,
    block: ((row: unknown) => void) | undefined,
  ): Promise<readonly unknown[] | null>;
  async execute(
    sql: string,
    bindVars: SqliteBinds = [],
    block?: (row: unknown) => void,
  ): Promise<readonly unknown[] | null> {
    const stmt = await this.prepare(sql);
    try {
      if (block) {
        for (const row of await stmt.all(bindVars)) block(row);
        return null;
      } else {
        return Object.freeze(await stmt.all(bindVars));
      }
    } finally {
      await stmt.close();
    }
  }

  async getFirstValue(sql: string, ...bindVars: SqliteBindValue[]): Promise<unknown> {
    const row = (await this.execute(sql, bindVars))[0];
    if (row) return Object.values(row as object)[0];
    return null;
  }

  async pragma(source: string, opts?: { simple?: boolean }): Promise<unknown> {
    if (source.includes("=")) {
      await this.exec(`PRAGMA ${source}`);
      return [];
    }
    try {
      if (opts?.simple) {
        const row = (await this.raw.getFirstAsync(`PRAGMA ${source}`)) as
          | Record<string, unknown>
          | undefined;
        return row !== undefined ? Object.values(row)[0] : undefined;
      }
      return await this.raw.getAllAsync(`PRAGMA ${source}`);
    } catch (e) {
      rbSqlite3Raise(e);
    }
  }

  async changes(): Promise<number> {
    try {
      const row = (await this.raw.getFirstAsync("SELECT changes() AS v")) as { v: number };
      return row.v;
    } catch (e) {
      rbSqlite3Raise(e);
    }
  }

  async lastInsertRowId(): Promise<number | bigint> {
    try {
      const row = (await this.raw.getFirstAsync("SELECT last_insert_rowid() AS v")) as {
        v: number | bigint;
      };
      return row.v;
    } catch (e) {
      rbSqlite3Raise(e);
    }
  }

  async close(): Promise<void> {
    try {
      this._open = false;
      await this.raw.closeAsync();
    } catch (e) {
      rbSqlite3Raise(e);
    }
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
    if (((config.flags ?? 0) & SQLite3Constants.Open.SHAREDCACHE) !== 0) {
      throw new ConfigurationError(
        "SQLITE_OPEN_SHAREDCACHE is not supported by the expo-sqlite driver",
      );
    }
    try {
      const db = await expoSqlite.openDatabaseAsync(config.database, {
        ...config.driverOptions,
      });
      return new ExpoSqliteConnection(db);
    } catch (e) {
      rbSqlite3Raise(e);
    }
  },
};
