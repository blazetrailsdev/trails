import { describe, expect, it } from "vitest";
import { AbstractSQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";
import { NodeSQLiteAdapter } from "./connection-adapters/node-sqlite-adapter.js";
import { ExpoSQLiteAdapter } from "./connection-adapters/expo-sqlite-adapter.js";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { ConnectionDescriptor } from "./connection-adapters/abstract/connection-descriptor.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { betterSqlite3Driver } from "./sqlite/better-sqlite3.js";
import type { DatabaseAdapter } from "./adapter.js";
import type { SqliteConnection, SqliteDriver } from "./sqlite-adapter.js";

// Async-only drivers (no `openSync()`) exercising the async construction path
// the way expo-sqlite / WASM drivers do, backed by better-sqlite3 so they run
// in any Node test environment.
const openVia = async (config: Parameters<SqliteDriver["open"]>[0]): Promise<SqliteConnection> =>
  betterSqlite3Driver.openSync!(config) as unknown as SqliteConnection;
const asyncDriver = (open: SqliteDriver["open"]): SqliteDriver => ({
  name: "async-stub",
  capabilities: { ...betterSqlite3Driver.capabilities, inProcessSync: false },
  open,
});
const asyncOnlyDriver = asyncDriver(openVia);

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

  it("forwards driver-specific open config (timeout, driverOptions) to open()", async () => {
    let seen: Record<string, unknown> | undefined;
    const driver = asyncDriver((config) => {
      seen = config as unknown as Record<string, unknown>;
      return openVia(config);
    });
    const adapter = await AbstractSQLite3Adapter.openAsync(":memory:", {
      driver,
      timeout: 1234,
      driverOptions: { foo: "bar" },
    } as never);
    expect(seen?.timeout).toBe(1234);
    expect(seen?.driverOptions).toEqual({ foo: "bar" });
    adapter.disconnectBang();
  });

  it("stays pending after a failed async open so verifyBang can retry", async () => {
    let attempts = 0;
    const driver = asyncDriver((config) => {
      if (++attempts === 1) throw new Error("boom");
      return openVia(config);
    });
    const adapter = new AbstractSQLite3Adapter(":memory:", { driver });
    await expect(adapter.completeAsyncConnect()).rejects.toThrow();
    expect(adapter.active).toBe(false);
    await adapter.completeAsyncConnect();
    expect(adapter.active).toBe(true);
    adapter.disconnectBang();
  });

  it("dedupes concurrent completeAsyncConnect() calls onto one open", async () => {
    let opens = 0;
    const driver = asyncDriver((config) => {
      opens++;
      return openVia(config);
    });
    const adapter = new AbstractSQLite3Adapter(":memory:", { driver });
    await Promise.all([adapter.completeAsyncConnect(), adapter.completeAsyncConnect()]);
    expect(opens).toBe(1);
    expect(adapter.active).toBe(true);
    adapter.disconnectBang();
  });

  it("disconnectBang is safe before an async-only connection completes", () => {
    const adapter = new AbstractSQLite3Adapter(":memory:", { driver: asyncOnlyDriver });
    expect(() => adapter.disconnectBang()).not.toThrow();
  });

  it("disconnectBang fires async driver.close() and close() drains it", async () => {
    let closed = false;
    let resolveClose: () => void;
    const closeGate = new Promise<void>((resolve) => {
      resolveClose = resolve;
    });
    const driver = asyncDriver(async (config) => {
      const conn = (await openVia(config)) as SqliteConnection;
      return new Proxy(conn, {
        get(target, prop, receiver) {
          if (prop === "close") {
            return async () => {
              await closeGate;
              (target.close as () => void)();
              closed = true;
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    });
    const adapter = await AbstractSQLite3Adapter.openAsync(":memory:", { driver });
    adapter.disconnectBang();
    expect(closed).toBe(false);
    resolveClose!();
    await adapter.close();
    expect(closed).toBe(true);
  });

  it("close() resolves when an async driver.close() fired by disconnectBang rejects", async () => {
    // The async close() fired by disconnectBang rejects; close() must drain the
    // swallowed rejection without surfacing it.
    const driver = asyncDriver(async (config) => {
      const conn = (await openVia(config)) as SqliteConnection;
      return new Proxy(conn, {
        get(target, prop, receiver) {
          if (prop === "close") {
            return async () => {
              (target.close as () => void)();
              throw new Error("close failed");
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    });
    const adapter = await AbstractSQLite3Adapter.openAsync(":memory:", { driver });
    adapter.disconnectBang();
    await expect(adapter.close()).resolves.toBeUndefined();
  });

  it("completes a deferred async-only open on the first query (sync checkout path)", async () => {
    // Mirrors what the synchronous pool checkout does: construct the adapter
    // without awaiting openAsync(), then issue the first query. The query must
    // transparently complete the deferred open rather than touch an unset handle.
    const adapter = new AbstractSQLite3Adapter(":memory:", { driver: asyncOnlyDriver });
    expect(adapter.active).toBe(false);
    await adapter.internalExecute(
      "CREATE TABLE sync_checkout (id INTEGER PRIMARY KEY, name TEXT)",
      "SCHEMA",
    );
    expect(adapter.active).toBe(true);
    await adapter.internalExecute("INSERT INTO sync_checkout (name) VALUES ('lazy')", "SQL");
    const rows = await adapter.execute("SELECT name FROM sync_checkout");
    expect(rows).toEqual([{ name: "lazy" }]);
    adapter.disconnectBang();
  });

  it("completes a deferred open when the first call is a schema introspection", async () => {
    // columns()/exec() must also drain the pending open: the first call after a
    // sync checkout is not always a SELECT.
    const adapter = new AbstractSQLite3Adapter(":memory:", { driver: asyncOnlyDriver });
    await adapter.exec("CREATE TABLE schema_first (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
    const cols = await adapter.columns("schema_first");
    expect(cols.map((c) => c.name)).toEqual(["id", "name"]);
    adapter.disconnectBang();
  });

  it("opens once when several queries race the deferred async-only open", async () => {
    let opens = 0;
    const driver = asyncDriver((config) => {
      opens++;
      return openVia(config);
    });
    const adapter = new AbstractSQLite3Adapter(":memory:", { driver });
    // These are the FIRST operations — no prior query has cleared the pending
    // flag, so all three race into completeAsyncConnect() and must dedupe onto
    // the single in-flight open rather than each opening their own handle.
    expect(adapter.active).toBe(false);
    await Promise.all([
      adapter.execute("SELECT 1 AS one"),
      adapter.execQuery("SELECT 2 AS two"),
      adapter.pragma("foreign_keys"),
    ]);
    expect(opens).toBe(1);
    adapter.disconnectBang();
  });

  it("serves an async-only driver through the synchronous pool checkout", async () => {
    // End-to-end: ConnectionPool#checkout is synchronous and hands back the
    // freshly-constructed (still-pending) adapter without awaiting the open.
    // The first query on the checked-out connection must complete it.
    const dbConfig = new HashConfig("test", "primary", { adapter: "sqlite3" });
    const poolConfig = new PoolConfig(
      new ConnectionDescriptor("primary"),
      dbConfig,
      "writing",
      "default",
      {
        adapterFactory: () =>
          new AbstractSQLite3Adapter(":memory:", {
            driver: asyncOnlyDriver,
          }) as unknown as DatabaseAdapter,
      },
    );
    const pool = new ConnectionPool(poolConfig);
    const conn = pool.checkout() as unknown as AbstractSQLite3Adapter;
    expect(conn.active).toBe(false);
    await conn.internalExecute("CREATE TABLE pool_t (id INTEGER PRIMARY KEY, name TEXT)", "SCHEMA");
    expect(conn.active).toBe(true);
    await conn.internalExecute("INSERT INTO pool_t (name) VALUES ('pooled')", "SQL");
    const rows = await conn.execute("SELECT name FROM pool_t");
    expect(rows).toEqual([{ name: "pooled" }]);
    pool.disconnectBang();
  });

  it("reconnects an async-only driver and reapplies pragmas", async () => {
    const adapter = await AbstractSQLite3Adapter.openAsync(":memory:", { driver: asyncOnlyDriver });
    adapter.disconnectBang();
    expect(adapter.active).toBe(false);
    // Full lifecycle: reconnectBang() -> reconnect() (opens) -> configureConnection().
    await adapter.reconnectBang();
    expect(adapter.active).toBe(true);
    // foreign_keys defaults OFF in SQLite; ON proves configure_connection ran.
    const rows = await adapter.execute("PRAGMA foreign_keys");
    expect(rows).toEqual([{ foreign_keys: 1 }]);
    adapter.disconnectBang();
  });
});
