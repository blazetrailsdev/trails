import { describe, expect, it, vi } from "vitest";
import { SQLite3Adapter } from "../../lib/connection-adapters/sqlite3-adapter.js";
import { File, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { ConnectionPool } from "../../lib/connection-adapters/abstract/connection-pool.js";
import { PoolConfig } from "../../lib/connection-adapters/pool-config.js";
import { ConnectionDescriptor } from "../../lib/connection-adapters/abstract/connection-handler.js";
import { HashConfig } from "../../lib/database-configurations/hash-config.js";
import { engine, errors } from "@blazetrails/sqlite3/engine/better-sqlite3";
import { engine as libsqlEngine } from "@blazetrails/sqlite3/engine/libsql";
import { engine as nodeSqliteEngine } from "@blazetrails/sqlite3/engine/node-sqlite";
import { nodeSqlite } from "@blazetrails/sqlite3/engine/node-sqlite";
import { Pragmas, SQLite3 } from "@blazetrails/sqlite3";
import type { EngineDatabase, EngineOpenV2 } from "@blazetrails/sqlite3";
import type { AbstractAdapter as DatabaseAdapter } from "../../lib/connection-adapters/abstract-adapter.js";
import { load, register } from "../../lib/connection-adapters.js";

let registeredTestAdapters = 0;
async function registerTestAdapter(build: () => DatabaseAdapter): Promise<string> {
  const adapter = `sqlite3_test_${(registeredTestAdapters += 1)}`;
  const className = `SQLite3TestAdapter${registeredTestAdapters}`;
  constSet(TopLevel, className, function () {
    return build();
  });
  register(adapter, className);
  await load(adapter);
  return adapter;
}

type OpenArgs = Parameters<EngineOpenV2>;
const openVia = (...args: OpenArgs): EngineDatabase => engine(...args);
const asyncDriver = (open: (...args: OpenArgs) => EngineDatabase): EngineOpenV2 =>
  Object.assign((...args: OpenArgs): EngineDatabase => {
    const db = open(...args);
    return {
      ...db,
      prepare: async (sql) => db.prepare(sql),
      execBatch: async (sql, resultsAsHash) => db.execBatch(sql, resultsAsHash),
      changes: async () => db.changes(),
      close: async () => db.close(),
    };
  }, errors);
const asyncOnlyDriver = asyncDriver(openVia);

describe("SQLite adapter driver binding", () => {
  it("BetterSQLite3Adapter binds its bundled driver and opens", async () => {
    const adapter = new SQLite3Adapter({ database: ":memory:" });
    expect(adapter).toBeInstanceOf(SQLite3Adapter);
    await adapter.disconnectBang();
  });

  it("leaves the raw connection unopened until connectBang", async () => {
    const adapter = new SQLite3Adapter({ database: ":memory:" });
    expect(adapter.isConnected()).toBe(false);
    expect(await adapter.active()).toBe(false);

    await adapter.connectBang();
    expect(adapter.isConnected()).toBe(true);
    await adapter.disconnectBang();
  });

  it("defers connection for an async-only driver constructed synchronously", async () => {
    const adapter = new SQLite3Adapter({ database: ":memory:", engine: asyncOnlyDriver });
    expect(await adapter.active()).toBe(false);
  });

  it("opens an async-only driver via openAsync and round-trips a query", async () => {
    const adapter = await new SQLite3Adapter({
      database: ":memory:",
      engine: asyncOnlyDriver,
    }).connectBang();
    expect(await adapter.active()).toBe(true);
    await adapter.internalExecute(
      "CREATE TABLE async_t (id INTEGER PRIMARY KEY, name TEXT)",
      "SCHEMA",
    );
    await adapter.internalExecute("INSERT INTO async_t (name) VALUES ('async')", "SQL");
    const rows = await adapter.execute("SELECT name FROM async_t");
    expect(rows).toEqual([{ name: "async" }]);
    await adapter.internalExecute("DROP TABLE IF EXISTS async_t", "SCHEMA");
    await adapter.disconnectBang();
  });

  it("openAsync also opens sync drivers (better-sqlite3)", async () => {
    const adapter = await new SQLite3Adapter({ database: ":memory:" }).connectBang();
    expect(await adapter.active()).toBe(true);
    await adapter.disconnectBang();
  });

  it.skipIf(nodeSqlite === undefined)(
    "applies the busy timeout in configureConnection on node:sqlite",
    async () => {
      const set = vi.spyOn(SQLite3.Database.prototype, "setBusyHandlerTimeout");
      const adapter = await new SQLite3Adapter({
        database: ":memory:",
        engine: nodeSqliteEngine,
        timeout: 1234,
      }).connectBang();
      expect(set).toHaveBeenCalledWith(1234);
      expect(await Pragmas.busyTimeout.call(adapter["_rawConnection"]!)).toBe(0);
      await adapter.disconnectBang();
    },
  );

  it("applies the busy timeout in configureConnection on local libsql", async () => {
    const set = vi.spyOn(SQLite3.Database.prototype, "setBusyHandlerTimeout");
    const adapter = await new SQLite3Adapter({
      database: ":memory:",
      engine: libsqlEngine,
      timeout: 1234,
    }).connectBang();
    expect(set).toHaveBeenCalledWith(1234);
    expect(await Pragmas.busyTimeout.call(adapter["_rawConnection"]!)).toBe(0);
    await adapter.disconnectBang();
  });

  it("stays pending after a failed async open so verifyBang can retry", async () => {
    let attempts = 0;
    const driver = asyncDriver((...args) => {
      if (++attempts === 1) throw new Error("boom");
      return openVia(...args);
    });
    const adapter = new SQLite3Adapter({ database: ":memory:", engine: driver });
    await expect(adapter.connectBang()).rejects.toThrow();
    expect(await adapter.active()).toBe(false);
    await adapter.connectBang();
    expect(await adapter.active()).toBe(true);
    await adapter.disconnectBang();
  });

  it("dedupes concurrent completeAsyncConnect() calls onto one open", async () => {
    let opens = 0;
    const driver = asyncDriver((...args) => {
      opens++;
      return openVia(...args);
    });
    const adapter = new SQLite3Adapter({ database: ":memory:", engine: driver });
    await Promise.all([adapter.connectBang(), adapter.connectBang()]);
    expect(opens).toBe(1);
    expect(await adapter.active()).toBe(true);
    await adapter.disconnectBang();
  });

  it("disconnectBang is safe before an async-only connection completes", () => {
    const adapter = new SQLite3Adapter({ database: ":memory:", engine: asyncOnlyDriver });
    expect(() => adapter.disconnectBang()).not.toThrow();
  });

  it("disconnectBang fires async driver.close() and close() drains it", async () => {
    let closed = false;
    let resolveClose: () => void;
    let closeGate = new Promise<void>((resolve) => {
      resolveClose = resolve;
    });
    const driver = asyncDriver((...args) => {
      const conn = openVia(...args);
      return {
        ...conn,
        close: async () => {
          await closeGate;
          await conn.close();
          closed = true;
        },
      };
    });
    const adapter = await new SQLite3Adapter({
      database: ":memory:",
      engine: driver,
    }).connectBang();
    const disconnecting = adapter.disconnectBang();
    expect(closed).toBe(false);
    resolveClose!();
    await disconnecting;
    expect(closed).toBe(true);

    const queued = await new SQLite3Adapter({ database: ":memory:", engine: driver }).connectBang();
    let releaseStatement: () => void;
    const statement = queued.lock.synchronize(
      () =>
        new Promise<void>((resolve) => {
          releaseStatement = resolve;
        }),
    );
    closed = false;
    closeGate = new Promise<void>((resolve) => {
      resolveClose = resolve;
    });
    let settled = false;
    const queuedDisconnect = queued.disconnectBang().then(() => {
      settled = true;
    });
    releaseStatement!();
    await statement;
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    resolveClose!();
    await queuedDisconnect;
    expect(closed).toBe(true);
  });

  it("close() resolves when an async driver.close() fired by disconnectBang rejects", async () => {
    const driver = asyncDriver((...args) => {
      const conn = openVia(...args);
      return {
        ...conn,
        close: async () => {
          await conn.close();
          throw new Error("close failed");
        },
      };
    });
    const adapter = await new SQLite3Adapter({
      database: ":memory:",
      engine: driver,
    }).connectBang();
    await expect(adapter.disconnectBang()).resolves.toBeUndefined();
  });

  it("completes a deferred async-only open on the first query (sync checkout path)", async () => {
    const adapter = new SQLite3Adapter({ database: ":memory:", engine: asyncOnlyDriver });
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
    await adapter.disconnectBang();
  });

  it("completes a deferred open when the first call is a schema introspection", async () => {
    const adapter = new SQLite3Adapter({ database: ":memory:", engine: asyncOnlyDriver });
    await adapter.execute("CREATE TABLE schema_first (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
    const cols = await adapter.columns("schema_first");
    expect(cols.map((c) => c.name)).toEqual(["id", "name"]);
    await adapter.execute("DROP TABLE IF EXISTS schema_first");
    await adapter.disconnectBang();
  });

  it("opens once when several queries race the deferred async-only open", async () => {
    let opens = 0;
    const driver = asyncDriver((...args) => {
      opens++;
      return openVia(...args);
    });
    const adapter = new SQLite3Adapter({ database: ":memory:", engine: driver });
    expect(await adapter.active()).toBe(false);
    await Promise.all([
      adapter.execute("SELECT 1 AS one"),
      adapter.execQuery("SELECT 2 AS two"),
      adapter.execute("PRAGMA foreign_keys"),
    ]);
    expect(opens).toBe(1);
    await adapter.disconnectBang();
  });

  it("serves an async-only driver through the synchronous pool checkout", async () => {
    const adapter = await registerTestAdapter(
      () =>
        new SQLite3Adapter({
          database: ":memory:",
          engine: asyncOnlyDriver,
        }),
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
    const driver = asyncDriver((...args) => {
      const conn = openVia(...args);
      return {
        ...conn,
        close: async () => {
          await closeGate;
          await conn.close();
          closed = true;
        },
      };
    });
    const adapter = await registerTestAdapter(
      () => new SQLite3Adapter({ database: ":memory:", engine: driver }),
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
        new SQLite3Adapter({
          database: ":memory:",
          engine,
        }),
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
    driver: EngineOpenV2;
    release: () => void;
    isClosed: () => boolean;
  } => {
    let closed = false;
    let resolveClose!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveClose = resolve;
    });
    const driver = asyncDriver((...args) => {
      const conn = openVia(...args);
      return {
        ...conn,
        close: async () => {
          await gate;
          await conn.close();
          closed = true;
        },
      };
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
        new Proxy(new SQLite3Adapter({ database: ":memory:", engine: driver }), {
          get(target, prop) {
            if (prop === "requiresReloading") return () => true;
            const value = Reflect.get(target, prop, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }),
    );
    const pool = new ConnectionPool(poolConfig);
    const conn = (await pool.checkout()) as unknown as SQLite3Adapter;
    await conn.internalExecute("CREATE TABLE reload_t (id INTEGER PRIMARY KEY)", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS reload_t", "SCHEMA");
    pool.checkin(conn);

    const draining = pool.clearReloadableConnections();
    expect(isClosed()).toBe(false);
    release();
    await draining;
    expect(isClosed()).toBe(true);
  });

  it("pool flushBang drains an in-flight async-only close", async () => {
    const { driver, release, isClosed } = gatedCloseDriver();
    const pool = new ConnectionPool(
      await makePoolConfig(() => new SQLite3Adapter({ database: ":memory:", engine: driver })),
    );
    const conn = (await pool.checkout()) as unknown as SQLite3Adapter;
    await conn.internalExecute("CREATE TABLE flush_t (id INTEGER PRIMARY KEY)", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS flush_t", "SCHEMA");
    pool.checkin(conn);

    const draining = pool.flushBang();
    expect(isClosed()).toBe(false);
    release();
    await draining;
    expect(isClosed()).toBe(true);
  });

  it("pool discardBang drains an in-flight async-only close", async () => {
    const { driver, release, isClosed } = gatedCloseDriver();
    const pool = new ConnectionPool(
      await makePoolConfig(() => new SQLite3Adapter({ database: ":memory:", engine: driver })),
    );
    const conn = (await pool.checkout()) as unknown as SQLite3Adapter;
    await conn.internalExecute("CREATE TABLE discard_t (id INTEGER PRIMARY KEY)", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS discard_t", "SCHEMA");
    const disconnecting = conn.disconnectBang();

    const draining = pool.discardBang();
    expect(isClosed()).toBe(false);
    release();
    await disconnecting;
    await draining;
    expect(isClosed()).toBe(true);
  });

  it("pool drains a checkout-failure swap discard", async () => {
    const { driver, release, isClosed } = gatedCloseDriver();
    let failCheckout = false;
    const pool = new ConnectionPool(
      await makePoolConfig(
        () =>
          new Proxy(new SQLite3Adapter({ database: ":memory:", engine: driver }), {
            get(target, prop) {
              if (prop === "cleanBang")
                return () => {
                  if (failCheckout) throw new Error("checkout boom");
                };
              const value = Reflect.get(target, prop, target);
              return typeof value === "function" ? value.bind(target) : value;
            },
          }),
      ),
    );
    const conn = (await pool.checkout()) as unknown as SQLite3Adapter;
    await conn.internalExecute("CREATE TABLE swap_t (id INTEGER PRIMARY KEY)", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS swap_t", "SCHEMA");
    pool.checkin(conn);

    failCheckout = true;
    const rejection = expect(pool.checkout()).rejects.toThrow(/checkout boom/);
    expect(isClosed()).toBe(false);
    release();
    await rejection;
    expect(isClosed()).toBe(true);
  });

  it("sync-driver teardown seams stay synchronous (whenClosed no-ops)", async () => {
    const pool = new ConnectionPool(
      await makePoolConfig(
        () =>
          new SQLite3Adapter({
            database: ":memory:",
            engine,
          }),
      ),
    );
    const conn = (await pool.checkout()) as unknown as SQLite3Adapter;
    await conn.internalExecute("CREATE TABLE sync_seam_t (id INTEGER PRIMARY KEY)", "SCHEMA");
    await conn.internalExecute("DROP TABLE IF EXISTS sync_seam_t", "SCHEMA");
    pool.checkin(conn);
    await expect(pool.flushBang()).resolves.toBeUndefined();
    await expect(pool.clearReloadableConnections()).resolves.toBeUndefined();
    await expect(pool.discardBang()).resolves.toBeUndefined();
  });

  it("reconnects an async-only driver and reapplies pragmas", async () => {
    const adapter = await new SQLite3Adapter({
      database: ":memory:",
      engine: asyncOnlyDriver,
    }).connectBang();
    await adapter.disconnectBang();
    expect(await adapter.active()).toBe(false);
    await adapter.reconnectBang();
    expect(await adapter.active()).toBe(true);
    const rows = await adapter.execute("PRAGMA foreign_keys");
    expect(rows).toEqual([{ foreign_keys: 1 }]);
    await adapter.disconnectBang();
  });

  it("encoding is memoized at connect for an async-only driver", async () => {
    const adapter = await new SQLite3Adapter({
      database: ":memory:",
      engine: asyncOnlyDriver,
    }).connectBang();
    expect(await adapter.encoding()).toBe("UTF-8");
    await adapter.disconnectBang();
  });

  it("encoding falls back to UTF-8 before a deferred async-only open completes", async () => {
    const adapter = new SQLite3Adapter({ database: ":memory:", engine: asyncOnlyDriver });
    expect(await adapter.active()).toBe(false);
    expect(await adapter.encoding()).toBe("UTF-8");
  });

  it("encoding returns the database encoding for a sync driver", async () => {
    const adapter = new SQLite3Adapter({ database: ":memory:", engine });
    expect(await adapter.encoding()).toBe("UTF-8");
    await adapter.disconnectBang();
  });

  it("encoding reads a non-UTF-8 database's encoding through an async-only driver", async () => {
    const utf16Driver = asyncDriver((...args) => {
      const conn = engine(...args);
      conn.execBatch('PRAGMA encoding = "UTF-16le"', null);
      return conn;
    });
    const adapter = new SQLite3Adapter({ database: ":memory:", engine: utf16Driver });
    expect(await adapter.encoding()).toBe("UTF-16LE");
    await adapter.disconnectBang();
  });

  it("isOpen and raw degrade gracefully before a deferred async-only open", () => {
    const adapter = new SQLite3Adapter({ database: ":memory:", engine: asyncOnlyDriver });
    expect(adapter.isActive()).toBeFalsy();
  });
});

describe("SQLite3Adapter connection parameters", () => {
  it("carry only the keys Rails' merge produces, and newClient resolves the driver by class", async () => {
    const adapter = new SQLite3Adapter({ database: ":memory:" });
    const params = adapter._connectionParameters;
    expect(params).not.toHaveProperty("engine");
    expect(params).toMatchObject({
      database: ":memory:",
      resultsAsHash: true,
      defaultTransactionMode: "immediate",
    });
    const conn = SQLite3Adapter.newClient({ ...params, engine });
    expect(conn.isClosed()).toBe(false);
    await conn.close();
  });

  it("does not expand or mkdir a libsql remote URL as a local path", () => {
    const adapter = new SQLite3Adapter({ database: "libsql://trails-remote-probe.invalid" });
    expect(adapter._connectionParameters.database).toBe("libsql://trails-remote-probe.invalid");
    expect(adapter.supportsConcurrentConnections()).toBe(true);
    expect(adapter._memoryDatabase).toBe(false);
    expect(adapter._previousReadUncommitted).toBeNull();
    expect(File.isDirectory("libsql:")).toBe(false);
  });
});
