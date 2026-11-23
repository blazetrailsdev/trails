import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import { SQLite3 } from "../lib/index.js";
import type { EngineOpenV2 } from "../lib/database.js";

const native = (message: string) =>
  Object.assign(new Error(message), { code: "ERR_INTERNAL_SQLITE_ERROR" });

const busy = { left: 0 };

vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    const raw = new BetterSqlite3(":memory:");
    return {
      prepareAsync: async (sql: string) => {
        let stmt: BetterSqlite3.Statement;
        try {
          stmt = raw.prepare(sql);
        } catch (e) {
          throw native(`Error code 1: ${(e as Error).message}`);
        }
        if (stmt.reader) stmt.raw(true);
        return {
          executeForRawResultAsync: async (params: unknown[] | Record<string, unknown>) => {
            if (busy.left > 0) {
              busy.left--;
              throw native("Error code 5: database is locked");
            }
            const args = Array.isArray(params) ? params : [params];
            try {
              if (!stmt.reader) {
                const { changes } = stmt.run(...args);
                return { changes, [Symbol.asyncIterator]: async function* () {} };
              }
              const rows = stmt.all(...args) as unknown[][];
              return {
                changes: 0,
                [Symbol.asyncIterator]: async function* () {
                  yield* rows;
                },
              };
            } catch (e) {
              throw native(`Error code 19: ${(e as Error).message}`);
            }
          },
          getColumnNamesAsync: async () => (stmt.reader ? stmt.columns().map((c) => c.name) : []),
          finalizeAsync: async () => {},
        };
      },
      closeAsync: async () => raw.close(),
    };
  },
}));

describe("SQLite3::Database over the expo-sqlite engine", () => {
  let engine: EngineOpenV2;
  let db: InstanceType<typeof SQLite3.Database>;

  beforeAll(async () => {
    ({ engine } = await import("../lib/engine/expo-sqlite.js"));
    db = new SQLite3.Database(":memory:", { engine });
    await db.executeBatch2(
      "CREATE TABLE t (a INTEGER UNIQUE, b TEXT); INSERT INTO t VALUES (1, 'x');",
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it("reads rows back through a prepared statement", async () => {
    expect(await db.execute("SELECT a, b FROM t WHERE a = ?", [1])).toEqual([[1, "x"]]);
    expect(await db.executeBatch2("SELECT b FROM t")).toEqual([["x"]]);
  });

  it("answers changes and column_count from the last result, without I/O", async () => {
    await db.execute("INSERT INTO t VALUES (2, 'y')");
    expect(db.changes()).toBe(1);
    const stmt = await db.prepare("SELECT a, b FROM t");
    await stmt.step();
    expect(stmt.columnCount()).toBe(2);
    expect(stmt.columns()).toEqual(["a", "b"]);
    await stmt.close();
  });

  it("raises the gem's class with the native code for a failed step", async () => {
    const error = await db.execute("INSERT INTO t VALUES (1, 'z')").then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(SQLite3.ConstraintException);
    expect((error as InstanceType<typeof SQLite3.Exception>).code).toBe(19);
  });

  it("calls the busy handler with a growing count until it answers false, as retries does", async () => {
    const counts: number[] = [];
    db.busyHandler((count) => (counts.push(count), count <= 1));
    busy.left = 1;
    expect(await db.execute("SELECT a FROM t WHERE a = 1")).toEqual([[1]]);
    expect(counts).toEqual([0]);
    busy.left = 5;
    await expect(db.execute("SELECT a FROM t")).rejects.toBeInstanceOf(SQLite3.BusyException);
    expect(counts).toEqual([0, 0, 1, 2]);
    busy.left = 0;
    db.busyHandler(null);
  });

  it("rejects a shared-cache open", () => {
    expect(
      () =>
        new SQLite3.Database(":memory:", {
          engine,
          flags: SQLite3.Constants.Open.READWRITE | SQLite3.Constants.Open.SHAREDCACHE,
        }),
    ).toThrow("SQLITE_OPEN_SHAREDCACHE is not supported by the expo-sqlite driver");
  });

  it("execute_batch2 answers sqlite3_exec's column text", async () => {
    expect(await db.executeBatch2("SELECT 1.0, 0.1 + 0.2, 7, 1e20")).toEqual([
      ["1.0", "0.3", "7", "1.0e+20"],
    ]);
  });

  it("raises a failed prepare from Database#prepare, with its SQL", async () => {
    const error = await Promise.resolve(db.prepare("SELECT * FROM nope")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SQLite3.SQLException);
    expect((error as InstanceType<typeof SQLite3.SQLException>).sql).toBe("SELECT * FROM nope");
  });

  it("reads an INTEGER past 2^53 exactly as a bigint with read-bigints on", async () => {
    const stmt = await db.prepare("SELECT 9007199254740993, 'x', 1.5, CAST(? AS INTEGER)");
    stmt.setReadBigInts(true);
    stmt.bindParam(1, 2);
    expect(await stmt.step()).toEqual([9007199254740993n, "x", 1.5, 2n]);
    await stmt.close();
  });
});
