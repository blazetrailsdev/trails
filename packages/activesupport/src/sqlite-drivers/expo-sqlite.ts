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
} from "../sqlite-adapter.js";

// Minimal subset of the expo-sqlite public API used by this driver.
// Kept inline so typecheck passes without installing the optional package.
/** @internal */
interface ExpoSQLiteStatement {
  // expo-sqlite accepts either positional array or named-param object
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

// Soft-load: expo-sqlite is only available in Expo/React Native runtimes.
// Non-Expo environments won't crash on import; open() rejects with a clear error.
let expoSqlite: ExpoSqliteModule | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  expoSqlite = require("expo-sqlite") as ExpoSqliteModule;
} catch {
  /* not an Expo runtime */
}

/** True when expo-sqlite loaded successfully; use as a describe.skipIf gate in tests. */
export const isExpoSqliteAvailable = expoSqlite !== undefined;

const NAMED_PREFIX = /^[$:@]/;

/** @internal */
function expandBinds(binds: SqliteBinds | undefined): unknown[] | Record<string, unknown> {
  if (binds === undefined) return [];
  if (Array.isArray(binds)) return binds as unknown[];
  // expo-sqlite requires $name/:name/@name keys. SqliteBinds uses bare names,
  // so prefix any key that doesn't already carry a sigil.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(binds)) {
    out[NAMED_PREFIX.test(k) ? k : `$${k}`] = v;
  }
  return out;
}

/** @internal */
function isReader(sql: string): boolean {
  const upper = sql.trimStart().toUpperCase();
  return (
    /^(SELECT|WITH|EXPLAIN|VALUES|TABLE)\b/.test(upper) ||
    (/^PRAGMA\b/.test(upper) && !upper.includes("="))
  );
}

/** @internal */
class ExpoSqliteStatement implements SqliteStatement {
  readonly reader: boolean;

  constructor(
    private readonly stmt: ExpoSQLiteStatement,
    sql: string,
  ) {
    this.reader = isReader(sql);
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
    // expo-sqlite does not expose column metadata on prepared statements;
    // return an empty array as a best-effort fallback.
    return [];
  }

  // expo-sqlite has no BigInt toggle API; this is a documented no-op.
  // Integer columns will return JS number, not bigint, regardless of this flag.
  setReadBigInts(_on: boolean): void {}

  async finalize(): Promise<void> {
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
    // readOnly, timeout, noMutex are not exposed by expo-sqlite's openDatabaseAsync;
    // pass driverOptions through for any driver-specific overrides.
    const db = await expoSqlite.openDatabaseAsync(config.database, {
      ...(config.driverOptions as Parameters<ExpoSqliteModule["openDatabaseAsync"]>[1] | undefined),
    });
    return new ExpoSqliteConnection(db);
  },
};

registerSqliteDriver(expoSqliteDriver);
