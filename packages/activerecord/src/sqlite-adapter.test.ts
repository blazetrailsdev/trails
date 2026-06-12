import { describe, expect, it } from "vitest";
import { AbstractSQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";
import { NodeSQLiteAdapter } from "./connection-adapters/node-sqlite-adapter.js";
import { ExpoSQLiteAdapter } from "./connection-adapters/expo-sqlite-adapter.js";
import { betterSqlite3Driver } from "./sqlite/better-sqlite3.js";

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
});
