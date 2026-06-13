import { describe, expect, it } from "vitest";
import { AbstractSQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";
import { NodeSQLiteAdapter } from "./connection-adapters/node-sqlite-adapter.js";
import { ExpoSQLiteAdapter } from "./connection-adapters/expo-sqlite-adapter.js";
import { betterSqlite3Driver } from "./sqlite/better-sqlite3.js";
import type { SqliteConnection, SqliteDriver } from "./sqlite-adapter.js";

// Async-only driver (no `openSync()`) exercising the async construction path
// the way expo-sqlite / WASM drivers do, backed by better-sqlite3 so it runs
// in any Node test environment.
const asyncOnlyDriver: SqliteDriver = {
  name: "async-stub",
  capabilities: { ...betterSqlite3Driver.capabilities, inProcessSync: false },
  async open(config): Promise<SqliteConnection> {
    return betterSqlite3Driver.openSync!(config) as unknown as SqliteConnection;
  },
};

describe("SQLite adapter driver binding", () => {
  it("BetterSQLite3Adapter binds its bundled driver and opens", () => {
    const adapter = new BetterSQLite3Adapter(":memory:");
    expect(adapter).toBeInstanceOf(AbstractSQLite3Adapter);
    adapter.disconnectBang();
  });

  it("the abstract base has no bundled driver and cannot open directly", () => {
    expect(() => new AbstractSQLite3Adapter(":memory:")).toThrow(/No SQLite driver configured/);
  });

  it("accepts an explicit SqliteDriver via config.driver", () => {
    const adapter = new AbstractSQLite3Adapter(":memory:", { driver: betterSqlite3Driver });
    expect(adapter).toBeInstanceOf(AbstractSQLite3Adapter);
    adapter.disconnectBang();
  });

  it("rejects an invalid driver object", () => {
    expect(
      () => new AbstractSQLite3Adapter(":memory:", { driver: { name: "x" } as never }),
    ).toThrow(/config.driver must be a SqliteDriver/);
  });

  it("NodeSQLiteAdapter and ExpoSQLiteAdapter are thin AbstractSQLite3Adapter subclasses", () => {
    expect(Object.getPrototypeOf(NodeSQLiteAdapter)).toBe(AbstractSQLite3Adapter);
    expect(Object.getPrototypeOf(ExpoSQLiteAdapter)).toBe(AbstractSQLite3Adapter);
  });

  it("defers connection for an async-only driver constructed synchronously", () => {
    const adapter = new AbstractSQLite3Adapter(":memory:", { driver: asyncOnlyDriver });
    expect(adapter.active).toBe(false);
  });

  it("opens an async-only driver via openAsync and round-trips a query", async () => {
    const adapter = await AbstractSQLite3Adapter.openAsync(":memory:", { driver: asyncOnlyDriver });
    expect(adapter.active).toBe(true);
    await adapter.internalExecute(
      "CREATE TABLE async_t (id INTEGER PRIMARY KEY, name TEXT)",
      "SCHEMA",
    );
    await adapter.internalExecute("INSERT INTO async_t (name) VALUES ('async')", "SQL");
    const rows = await adapter.execute("SELECT name FROM async_t");
    expect(rows).toEqual([{ name: "async" }]);
    adapter.disconnectBang();
  });

  it("openAsync also opens sync drivers (better-sqlite3)", async () => {
    const adapter = await BetterSQLite3Adapter.openAsync(":memory:");
    expect(adapter.active).toBe(true);
    adapter.disconnectBang();
  });
});
