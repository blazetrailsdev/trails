import initSqlJs, { type Database, type SqlValue, type Statement } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

const SQL = await initSqlJs({ locateFile: () => wasmUrl } as unknown as Parameters<
  typeof initSqlJs
>[0]);

const databases = new Map<string, Database>();

const key = (name: string) => name.replace(/^.*\//, "");

/** The bytes the runtime restores before boot, and persists after each request. */
export function seedDatabase(name: string, bytes: Uint8Array | null): void {
  databases.set(key(name), bytes ? new SQL.Database(bytes) : new SQL.Database());
}

export function exportDatabase(name: string): Uint8Array | null {
  return databases.get(key(name))?.export() ?? null;
}

type Params = unknown[] | Record<string, unknown>;

function toSql(value: unknown): SqlValue {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === undefined) return null;
  return value as SqlValue;
}

function convert(params: Params): SqlValue[] | Record<string, SqlValue> {
  if (Array.isArray(params)) return params.map(toSql);
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, toSql(v)]));
}

function hasParams(bound: SqlValue[] | Record<string, SqlValue>): boolean {
  return Array.isArray(bound) ? bound.length > 0 : Object.keys(bound).length > 0;
}

function result<T>(rows: T[], changes: number, lastInsertRowId: number) {
  return {
    changes,
    lastInsertRowId,
    async getFirstAsync() {
      return rows[0] ?? null;
    },
    async getAllAsync() {
      return rows;
    },
    async *[Symbol.asyncIterator]() {
      yield* rows;
    },
  };
}

/**
 * The slice of expo-sqlite's async API that `@blazetrails/sqlite3`'s
 * expo-sqlite engine calls, answered by sql.js (SQLite compiled to wasm).
 * The runtime seats it where the `node:module` shim's `createRequire` and
 * runtime.html's import map find `expo-sqlite`, so the stock
 * `adapter: "expo-sqlite"` path runs unchanged in the browser.
 */
export async function openDatabaseAsync(name: string) {
  let db = databases.get(key(name));
  if (!db) databases.set(key(name), (db = new SQL.Database()));
  const database = db;
  const lastInsertRowId = () => Number(database.exec("SELECT last_insert_rowid()")[0].values[0][0]);

  function run<T>(sql: string, params: Params | undefined, shape: "raw" | "object") {
    const stmt = database.prepare(sql);
    try {
      return execute<T>(stmt, params, shape);
    } finally {
      stmt.free();
    }
  }

  function execute<T>(stmt: Statement, params: Params | undefined, shape: "raw" | "object") {
    stmt.reset();
    const bound = convert(params ?? []);
    if (hasParams(bound)) stmt.bind(bound);
    const rows: T[] = [];
    while (stmt.step()) rows.push((shape === "raw" ? stmt.get() : stmt.getAsObject()) as T);
    const changes = database.getRowsModified();
    stmt.reset();
    return result(rows, changes, lastInsertRowId());
  }

  return {
    async prepareAsync(sql: string) {
      const stmt = database.prepare(sql);
      return {
        async executeAsync(params?: Params) {
          return execute(stmt, params, "object");
        },
        async executeForRawResultAsync(params?: Params) {
          return execute(stmt, params, "raw");
        },
        async getColumnNamesAsync() {
          return stmt.getColumnNames();
        },
        async finalizeAsync() {
          stmt.free();
        },
      };
    },
    async execAsync(sql: string) {
      database.exec(sql);
    },
    async runAsync(sql: string, params?: Params) {
      const { changes, lastInsertRowId } = run(sql, params, "object");
      return { changes, lastInsertRowId };
    },
    async getAllAsync(sql: string, params?: Params) {
      return run(sql, params, "object").getAllAsync();
    },
    async getFirstAsync(sql: string, params?: Params) {
      return run(sql, params, "object").getFirstAsync();
    },
    async closeAsync() {},
  };
}

export default { openDatabaseAsync };
