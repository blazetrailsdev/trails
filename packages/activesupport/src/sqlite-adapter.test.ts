import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSqliteDrivers,
  getSqlite,
  getSqliteAsync,
  registerSqliteDriver,
  type SqliteConnection,
  type SqliteDriver,
} from "./sqlite-adapter.js";

function stubDriver(name: string): SqliteDriver {
  return {
    name,
    capabilities: {
      inProcessSync: true,
      streaming: false,
      loadExtension: false,
      concurrentStatements: true,
      foreignKeysOnByDefault: false,
      immediateTransactions: false,
    },
    open: () => Promise.reject(new Error("stub")),
    openSync: () => ({}) as SqliteConnection,
  };
}

describe("sqlite-adapter registry", () => {
  beforeEach(() => clearSqliteDrivers());
  afterEach(() => {
    vi.unstubAllEnvs();
    clearSqliteDrivers();
  });

  it("returns the only registered driver when no name is passed", () => {
    const a = stubDriver("a");
    registerSqliteDriver(a);
    expect(getSqlite()).toBe(a);
  });

  it("resolves by explicit name", () => {
    registerSqliteDriver(stubDriver("a"));
    const b = stubDriver("b");
    registerSqliteDriver(b);
    expect(getSqlite("b")).toBe(b);
  });

  it("throws when no drivers are registered", () => {
    expect(() => getSqlite()).toThrow(/No SQLite driver registered/);
  });

  it("throws when multiple drivers are registered without a selection", () => {
    registerSqliteDriver(stubDriver("a"));
    registerSqliteDriver(stubDriver("b"));
    expect(() => getSqlite()).toThrow(/Multiple SQLite drivers registered/);
  });

  it("throws when an explicit name is unknown", () => {
    registerSqliteDriver(stubDriver("a"));
    expect(() => getSqlite("missing")).toThrow(/"missing" is not registered/);
  });

  it("AR_SQLITE_DRIVER overrides the implicit default", () => {
    const a = stubDriver("a");
    const b = stubDriver("b");
    registerSqliteDriver(a);
    registerSqliteDriver(b);
    vi.stubEnv("AR_SQLITE_DRIVER", "a");
    expect(getSqlite()).toBe(a);
  });

  it("warns and overwrites on duplicate registration", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerSqliteDriver(stubDriver("dup"));
    registerSqliteDriver(stubDriver("dup"));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("clearSqliteDrivers empties the registry", () => {
    registerSqliteDriver(stubDriver("a"));
    clearSqliteDrivers();
    expect(() => getSqlite()).toThrow(/No SQLite driver registered/);
  });

  it("getSqliteAsync mirrors sync resolution", async () => {
    const a = stubDriver("a");
    registerSqliteDriver(a);
    await expect(getSqliteAsync()).resolves.toBe(a);
  });
});
