import { describe, expect, it } from "vitest";
import { SQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";
import { NodeSQLiteAdapter } from "./connection-adapters/node-sqlite-adapter.js";
import { ExpoSQLiteAdapter } from "./connection-adapters/expo-sqlite-adapter.js";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { ConnectionDescriptor } from "./connection-adapters/abstract/connection-handler.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { betterSqlite3Driver } from "./sqlite/better-sqlite3.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { SqliteConnection, SqliteDriver } from "./sqlite-adapter.js";
import { register, resolve } from "./connection-adapters.js";

let registeredTestAdapters = 0;
async function registerTestAdapter(build: () => DatabaseAdapter): Promise<string> {
  const adapter = `sqlite3_test_${(registeredTestAdapters += 1)}`;
  register(
    adapter,
    async () =>
      function () {
        return build();
      } as unknown as new () => DatabaseAdapter,
  );
  await resolve(adapter);
  return adapter;
}

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
    expect(adapter).toBeInstanceOf(SQLite3Adapter);
    adapter.disconnectBang();
  });

  it("the abstract base has no bundled driver and cannot open directly", () => {
    expect(() => new SQLite3Adapter(":memory:")).toThrow(/No SQLite driver configured/);
  });

  it("accepts an explicit SqliteDriver via config.driver", () => {
    const adapter = new SQLite3Adapter(":memory:", { driver: betterSqlite3Driver });
    expect(adapter).toBeInstanceOf(SQLite3Adapter);
    adapter.disconnectBang();
  });

  it("rejects an invalid driver object", () => {
    expect(() => new SQLite3Adapter(":memory:", { driver: { name: "x" } as never })).toThrow(
      /config.driver must be a SqliteDriver/,
    );
  });

  it("NodeSQLiteAdapter and ExpoSQLiteAdapter are thin SQLite3Adapter subclasses", () => {
    expect(Object.getPrototypeOf(NodeSQLiteAdapter)).toBe(SQLite3Adapter);
    expect(Object.getPrototypeOf(ExpoSQLiteAdapter)).toBe(SQLite3Adapter);
  });

  it("defers connection for an async-only driver constructed synchronously", async () => {
    const adapter = new SQLite3Adapter(":memory:", { driver: asyncOnlyDriver });
    expect(await adapter.active()).toBe(false);
  });

  it("opens an async-only driver via openAsync and round-trips a query", async () => {
    const adapter = await SQLite3Adapter.openAsync(":memory:", { driver: asyncOnlyDriver });
    expect(await adapter.active()).toBe(true);
    await adapter.internalExecute(
      "CREATE TABLE async_t (id INTEGER PRIMARY KEY, name TEXT)",
      "SCHEMA",
    );
    await adapter.internalExecute("INSERT INTO async_t (name) VALUES ('async')", "SQL");
    const rows = await adapter.execute("SELECT name FROM async_t");
    expect(rows).toEqual([{ name: "async" }]);
    await adapter.internalExecute("DROP TABLE IF EXISTS async_t", "SCHEMA");
    adapter.disconnectBang();
  });

  it("openAsync also opens sync drivers (better-sqlite3)", async () => {
    const adapter = await BetterSQLite3Adapter.openAsync(":memory:");
    expect(await adapter.active()).toBe(true);
    adapter.disconnectBang();
  });

  it("forwards driver-specific open config (timeout, driverOptions) to open()", async () => {
    let seen: Record<string, unknown> | undefined;
    const driver = asyncDriver((config) => {
      seen = config as unknown as Record<string, unknown>;
      return openVia(config);
    });
    const adapter = await SQLite3Adapter.openAsync(":memory:", {
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
    const adapter = new SQLite3Adapter(":memory:", { driver });
    await expect(adapter.completeAsyncConnect()).rejects.toThrow();
    expect(await adapter.active()).toBe(false);
    await adapter.completeAsyncConnect();
    expect(await adapter.active()).toBe(true);
    adapter.disconnectBang();
  });

  it("dedupes concurrent completeAsyncConnect() calls onto one open", async () => {
    let opens = 0;
    const driver = asyncDriver((config) => {
      opens++;
      return openVia(config);
    });
    const adapter = new SQLite3Adapter(":memory:", { driver });
    await Promise.all([adapter.completeAsyncConnect(), adapter.completeAsyncConnect()]);
    expect(opens).toBe(1);
    expect(await adapter.active()).toBe(true);
    adapter.disconnectBang();
  });

  it("disconnectBang is safe before an async-only connection completes", () => {
    const adapter = new SQLite3Adapter(":memory:", { driver: asyncOnlyDriver });
    expect(() => adapter.disconnectBang()).not.toThrow();
  });

  it("disconnectBang fires async driver.close() and close() drains it", async () => {
    let closed = false;
    let resolveClose: () => void;
    const closeGate = new Promise<void>((resolve) => {
      resolveClose = resolve;
    });
    const driver = asyncDriver(async (config) => {
      const conn = await openVia(config);
      return new Proxy(conn, {
        get(target, prop) {
          if (prop === "close") {
            return async () => {
              await closeGate;
              (target.close as () => void)();
              closed = true;
            };
          }
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    });
    const adapter = await SQLite3Adapter.openAsync(":memory:", { driver });
    adapter.disconnectBang();
    expect(closed).toBe(false);
    resolveClose!();
    await adapter.close();
    expect(closed).toBe(true);
  });

  it("close() resolves when an async driver.close() fired by disconnectBang rejects", async () => {
    const driver = asyncDriver(async (config) => {
      const conn = await openVia(config);
      return new Proxy(conn, {
        get(target, prop, receiver) {
          if (prop === "close") {
            return async () => {
              (target.close as () => void)();
              throw new Error("close failed");
            };
          }
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    });
    const adapter = await SQLite3Adapter.openAsync(":memory:", { driver });
    adapter.disconnectBang();
    await expect(adapter.close()).resolves.toBeUndefined();
  });

  it("completes a deferred async-only open on the first query (sync checkout path)", async () => {
    const adapter = new SQLite3Adapter(":memory:", { driver: asyncOnlyDriver });
    expect(await adapter.active()).toBe(false);
    await adapter.internalExecute(
      "CREATE TABLE sync_checkout (id INTEGER PRIMARY KEY, name TEXT)",
      "SCHEMA",
    );
    expect(await adapter.active()).toBe(true);
    await adapter.internalExecute("INSERT INTO sync_checkout (name) VALUES ('lazy')", "SQL");
    const rows = await adapter.execute("SELECT name FROM sync_checkout");
    expect(rows).toEqual([{ name: "lazy" }]);
    await adapter.internalExecute("DROP TABLE IF EXISTS sync_checkout", "SCHEMA");
    adapter.disconnectBang();
  });

  it("completes a deferred open when the first call is a schema introspection", async () => {
    const adapter = new SQLite3Adapter(":memory:", { driver: asyncOnlyDriver });
    await adapter.exec("CREATE TABLE schema_first (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
    const cols = await adapter.columns("schema_first");
    expect(cols.map((c) => c.name)).toEqual(["id", "name"]);
    await adapter.exec("DROP TABLE IF EXISTS schema_first");
    adapter.disconnectBang();
  });

  it("opens once when several queries race the deferred async-only open", async () => {
    let opens = 0;
    const driver = asyncDriver((config) => {
      opens++;
      return openVia(config);
    });
    const adapter = new SQLite3Adapter(":memory:", { driver });
    expect(await adapter.active()).toBe(false);
    await Promise.all([
      adapter.execute("SELECT 1 AS one"),
      adapter.execQuery("SELECT 2 AS two"),
      adapter.execute("PRAGMA foreign_keys"),
    ]);
    expect(opens).toBe(1);
    adapter.disconnectBang();
  });

  it("serves an async-only driver through the synchronous pool checkout", async () => {
    const adapter = await registerTestAdapter(
      () =>
        new SQLite3Adapter(":memory:", { driver: asyncOnlyDriver }) as unknown as DatabaseAdapter,
    );
    const dbConfig = new HashConfig("test", "primary", { adapter });
    const poolConfig = new PoolConfig(
      new ConnectionDescriptor("primary"),
      dbConfig,
      "writing",
      "default",
    );
    const pool = new ConnectionPool(poolConfig);
    const conn = (await pool.checkout()) as unknown as SQLite3Adapter;
    expect(await conn.active()).toBe(false);
    await conn.internalExecute("CREATE TABLE pool_t (id INTEGER PRIMARY KEY, name TEXT)", "SCHEMA");
    expect(await conn.active()).toBe(true);
    await conn.internalExecute("INSERT INTO pool_t (name) VALUES ('pooled')", "SQL");
    const rows = await conn.execute("SELECT name FROM pool_t");
    expect(rows).toEqual([{ name: "pooled" }]);
    await conn.internalExecute("DROP TABLE IF EXISTS pool_t", "SCHEMA");
    await pool.disconnectBang();
  });

  it("pool disconnect drains an in-flight async-only close before resolving", async () => {
    let closed = false;
    let resolveClose: () => void;
    const closeGate = new Promise<void>((resolve) => {
      resolveClose = resolve;
    });
    const driver = asyncDriver(async (config) => {
      const conn = await openVia(config);
      return new Proxy(conn, {
        get(target, prop) {
          if (prop === "close") {
            return async () => {
              await closeGate;
              (target.close as () => void)();
              closed = true;
            };
          }
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    });
    const adapter = await registerTestAdapter(
      () => new SQLite3Adapter(":memory:", { driver }) as unknown as DatabaseAdapter,
    );
    const dbConfig = new HashConfig("test", "primary", { adapter });
    const poolConfig = new PoolConfig(
      new ConnectionDescriptor("primary"),
      dbConfig,
      "writing",
      "default",
    );
    const pool = new ConnectionPool(poolConfig);
    const conn = (await pool.checkout()) as unknown as SQLite3Adapter;
    await conn.internalExecute("CREATE TABLE drain_t (id INTEGER PRIMARY KEY)", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS drain_t", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS drain_t", "SCHEMA");

    const draining = pool.disconnect();
    expect(closed).toBe(false);
    resolveClose!();
    await draining;
    expect(closed).toBe(true);
  });

  it("pool disconnect no-ops to a resolved promise for a sync driver", async () => {
    const adapter = await registerTestAdapter(
      () =>
        new SQLite3Adapter(":memory:", {
          driver: betterSqlite3Driver,
        }) as unknown as DatabaseAdapter,
    );
    const dbConfig = new HashConfig("test", "primary", { adapter });
    const poolConfig = new PoolConfig(
      new ConnectionDescriptor("primary"),
      dbConfig,
      "writing",
      "default",
    );
    const pool = new ConnectionPool(poolConfig);
    const conn = (await pool.checkout()) as unknown as SQLite3Adapter;
    await conn.internalExecute("CREATE TABLE sync_drain_t (id INTEGER PRIMARY KEY)", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS sync_drain_t", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS sync_drain_t", "SCHEMA");
    await expect(pool.disconnect()).resolves.toBeUndefined();
    expect(await conn.active()).toBe(false);
  });

  const gatedCloseDriver = (): {
    driver: SqliteDriver;
    release: () => void;
    isClosed: () => boolean;
  } => {
    let closed = false;
    let resolveClose!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveClose = resolve;
    });
    const driver = asyncDriver(async (config) => {
      const conn = await openVia(config);
      return new Proxy(conn, {
        get(target, prop) {
          if (prop === "close") {
            return async () => {
              await gate;
              (target.close as () => void)();
              closed = true;
            };
          }
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    });
    return { driver, release: () => resolveClose(), isClosed: () => closed };
  };

  const makePoolConfig = async (build: () => DatabaseAdapter): Promise<PoolConfig> =>
    new PoolConfig(
      new ConnectionDescriptor("primary"),
      new HashConfig("test", "primary", { adapter: await registerTestAdapter(build) }),
      "writing",
      "default",
    );

  it("pool clearReloadableConnections drains an in-flight async-only close", async () => {
    const { driver, release, isClosed } = gatedCloseDriver();
    const poolConfig = await makePoolConfig(
      () =>
        new Proxy(new SQLite3Adapter(":memory:", { driver }), {
          get(target, prop, receiver) {
            if (prop === "requiresReloading") return () => true;
            const value = Reflect.get(target, prop, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as unknown as DatabaseAdapter,
    );
    const pool = new ConnectionPool(poolConfig);
    const conn = (await pool.checkout()) as unknown as SQLite3Adapter;
    await conn.internalExecute("CREATE TABLE reload_t (id INTEGER PRIMARY KEY)", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS reload_t", "SCHEMA");
    pool.checkin(conn as unknown as DatabaseAdapter);

    const draining = pool.clearReloadableConnections();
    expect(isClosed()).toBe(false);
    release();
    await draining;
    expect(isClosed()).toBe(true);
  });

  it("pool flushBang drains an in-flight async-only close", async () => {
    const { driver, release, isClosed } = gatedCloseDriver();
    const pool = new ConnectionPool(
      await makePoolConfig(
        () => new SQLite3Adapter(":memory:", { driver }) as unknown as DatabaseAdapter,
      ),
    );
    const conn = (await pool.checkout()) as unknown as SQLite3Adapter;
    await conn.internalExecute("CREATE TABLE flush_t (id INTEGER PRIMARY KEY)", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS flush_t", "SCHEMA");
    pool.checkin(conn as unknown as DatabaseAdapter);

    const draining = pool.flushBang();
    expect(isClosed()).toBe(false);
    release();
    await draining;
    expect(isClosed()).toBe(true);
  });

  it("pool discardBang drains an in-flight async-only close", async () => {
    const { driver, release, isClosed } = gatedCloseDriver();
    const pool = new ConnectionPool(
      await makePoolConfig(
        () => new SQLite3Adapter(":memory:", { driver }) as unknown as DatabaseAdapter,
      ),
    );
    const conn = (await pool.checkout()) as unknown as SQLite3Adapter;
    await conn.internalExecute("CREATE TABLE discard_t (id INTEGER PRIMARY KEY)", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS discard_t", "SCHEMA");
    conn.disconnectBang();

    const draining = pool.discardBang();
    expect(isClosed()).toBe(false);
    release();
    await draining;
    expect(isClosed()).toBe(true);
  });

  it("pool drainPendingCloses drains a checkout-failure swap discard", async () => {
    const { driver, release, isClosed } = gatedCloseDriver();
    let failCheckout = false;
    const pool = new ConnectionPool(
      await makePoolConfig(
        () =>
          new Proxy(new SQLite3Adapter(":memory:", { driver }), {
            get(target, prop, receiver) {
              if (prop === "cleanBang")
                return () => {
                  if (failCheckout) throw new Error("checkout boom");
                };
              const value = Reflect.get(target, prop, target);
              return typeof value === "function" ? value.bind(target) : value;
            },
          }) as unknown as DatabaseAdapter,
      ),
    );
    const conn = (await pool.checkout()) as unknown as SQLite3Adapter;
    await conn.internalExecute("CREATE TABLE swap_t (id INTEGER PRIMARY KEY)", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS swap_t", "SCHEMA");
    pool.checkin(conn as unknown as DatabaseAdapter);

    failCheckout = true;
    await expect(pool.checkout()).rejects.toThrow(/checkout boom/);
    expect(isClosed()).toBe(false);
    release();
    await pool.drainPendingCloses();
    expect(isClosed()).toBe(true);
  });

  it("sync-driver teardown seams stay synchronous (whenClosed no-ops)", async () => {
    const pool = new ConnectionPool(
      await makePoolConfig(
        () =>
          new SQLite3Adapter(":memory:", {
            driver: betterSqlite3Driver,
          }) as unknown as DatabaseAdapter,
      ),
    );
    const conn = (await pool.checkout()) as unknown as SQLite3Adapter;
    await conn.internalExecute("CREATE TABLE sync_seam_t (id INTEGER PRIMARY KEY)", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS sync_seam_t", "SCHEMA");
    pool.checkin(conn as unknown as DatabaseAdapter);
    await expect(pool.flushBang()).resolves.toBeUndefined();
    await expect(pool.clearReloadableConnections()).resolves.toBeUndefined();
    await expect(pool.discardBang()).resolves.toBeUndefined();
    await expect(pool.drainPendingCloses()).resolves.toBeUndefined();
  });

  it("reconnects an async-only driver and reapplies pragmas", async () => {
    const adapter = await SQLite3Adapter.openAsync(":memory:", { driver: asyncOnlyDriver });
    adapter.disconnectBang();
    expect(await adapter.active()).toBe(false);
    await adapter.reconnectBang();
    expect(await adapter.active()).toBe(true);
    const rows = await adapter.execute("PRAGMA foreign_keys");
    expect(rows).toEqual([{ foreign_keys: 1 }]);
    adapter.disconnectBang();
  });

  const asyncPragmaDriver = asyncDriver(async (config) => {
    const conn = await openVia(config);
    return new Proxy(conn, {
      get(target, prop, receiver) {
        if (prop === "pragma") {
          return (source: string, opts?: { simple?: boolean }) =>
            Promise.resolve(target.pragma(source, opts));
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as unknown as SqliteConnection;
  });

  it("encoding is memoized at connect for an async-only driver", async () => {
    const adapter = await SQLite3Adapter.openAsync(":memory:", {
      driver: asyncPragmaDriver,
    });
    expect(adapter.encoding).toBe("UTF-8");
    adapter.disconnectBang();
  });

  it("encoding falls back to UTF-8 before a deferred async-only open completes", async () => {
    const adapter = new SQLite3Adapter(":memory:", { driver: asyncPragmaDriver });
    expect(await adapter.active()).toBe(false);
    expect(adapter.encoding).toBe("UTF-8");
  });

  it("encoding returns the database encoding for a sync driver", () => {
    const adapter = new SQLite3Adapter(":memory:", { driver: betterSqlite3Driver });
    expect(adapter.encoding).toBe("UTF-8");
    adapter.disconnectBang();
  });

  it("isOpen and raw degrade gracefully before a deferred async-only open", () => {
    const adapter = new SQLite3Adapter(":memory:", { driver: asyncOnlyDriver });
    expect(adapter.isOpen).toBe(false);
    expect(adapter.raw).toBeUndefined();
  });
});
