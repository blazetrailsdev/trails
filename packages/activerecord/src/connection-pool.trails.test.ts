import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, it, expect, vi } from "vitest";
import { NoMethodError } from "@blazetrails/activemodel";
import { Reaper } from "./connection-adapters/abstract/connection-pool/reaper.js";
import { ConnectionPool, NullPool } from "./connection-adapters/abstract/connection-pool.js";
import { withExecutionContext } from "./connection-adapters/abstract/connection-pool/execution-context.js";
import { AdapterNotFound } from "./errors.js";
import { Store } from "./connection-adapters/abstract/query-cache.js";
import { ConnectionDescriptor } from "./connection-adapters/abstract/connection-handler.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { SchemaReflection, BoundSchemaReflection } from "./connection-adapters/schema-cache.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { rawTestAdapterConfiguration } from "./test-adapter.js";
import { inMemoryDb } from "./support/adapter-helper.js";
import type { LeasedTestAdapter } from "./test-adapter.js";
import { fixtures } from "./test-fixtures.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { adapterNameFromConfig } from "./connection-adapters/abstract-adapter.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";

function makeAmbientDbConfig(overrides: Record<string, unknown> = {}): HashConfig {
  return new HashConfig("test", "primary", {
    ...rawTestAdapterConfiguration(),
    checkoutTimeout: 0.2,
    reapingFrequency: null,
    ...overrides,
  });
}

function makeAmbientPool(overrides: Record<string, unknown> = {}): ConnectionPool {
  const dbConfig = makeAmbientDbConfig(overrides);
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default");
  return new ConnectionPool(pc);
}

async function withCacheDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "trails-schema-cache-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function closePoolConnections(pool: ConnectionPool): Promise<void> {
  await pool.disconnect();
}

function makePool(size: number = 5): ConnectionPool {
  return makeAmbientPool({ pool: size });
}

it("verifyBang on a checked-out adapter establishes the raw connection on every lane", async () => {
  const pool = makePool();
  const conn = await pool.checkout();
  try {
    await conn.verifyBang();
    expect(conn.isConnected()).toBe(true);
    expect(pool.isConnected()).toBe(true);
  } finally {
    pool.checkin(conn);
    await closePoolConnections(pool);
  }
});

it("leaseConnection routes its verify through checkout and establishes on verifyBang", async () => {
  const pool = makePool();
  const checkoutSpy = vi.spyOn(pool, "checkout");
  try {
    const conn = await pool.leaseConnection();
    expect(checkoutSpy).toHaveBeenCalledTimes(1);
    await conn.verifyBang();
    expect(conn.isConnected()).toBe(true);
    expect(pool.isConnected()).toBe(true);
  } finally {
    checkoutSpy.mockRestore();
    pool.releaseConnection();
    await closePoolConnections(pool);
  }
});

it("with connection prevent permanent checkout releases connection", async () => {
  const pool = makePool();
  await pool.leaseConnection();
  expect(pool.activeConnection).toBeTruthy();
  await pool.withConnection(
    (conn) => {
      expect(conn).toBeTruthy();
    },
    { preventPermanentCheckout: true },
  );
  expect(pool.activeConnection).toBeTruthy();
  pool.releaseConnection();
});

it("with connection prevent permanent checkout on fresh lease releases", async () => {
  const pool = makePool();
  await pool.withConnection(
    (conn) => {
      expect(conn).toBeTruthy();
    },
    { preventPermanentCheckout: true },
  );
  expect(pool.activeConnection).toBeNull();
});

it("withConnection waits for a released connection when pool is saturated", async () => {
  const pool = makePool(1);
  const held = await pool.checkout();

  let connSeen: DatabaseAdapter | undefined;
  const waiter = pool.withConnection((conn) => {
    connSeen = conn;
  });
  pool.checkin(held);
  await waiter;
  expect(connSeen).toBe(held);
  expect(pool.stat().busy).toBe(0);
  expect(pool.stat().idle).toBe(1);
});

it("withConnection rejects with ConnectionTimeoutError when pool stays saturated past timeout", async () => {
  const { ConnectionTimeoutError } = await import("./errors.js");
  vi.useFakeTimers();
  try {
    const pool = makeAmbientPool({ pool: 1, checkoutTimeout: 0.05 });
    await pool.checkout();

    const waiter = pool.withConnection(() => {});
    const assertion = expect(waiter).rejects.toThrow(ConnectionTimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});

it("withConnection waits using pool default timeout without explicit checkoutTimeout", async () => {
  const pool = makePool(1);
  const held = await pool.checkout();

  let connSeen: DatabaseAdapter | undefined;
  const waiter = pool.withConnection((conn) => {
    connSeen = conn;
  });
  pool.checkin(held);
  await waiter;
  expect(connSeen).toBe(held);
  expect(pool.stat().busy).toBe(0);
});

it("full pool async checkout timeout", async () => {
  const pool = makePool(1);
  await pool.checkout();
  await expect(pool.checkout(0.05)).rejects.toThrow(/could not obtain a connection/);
});

it("reaper flushes idle connections after idle_timeout", async () => {
  try {
    vi.useFakeTimers();
    const pool = makeAmbientPool({ idleTimeout: 1, reapingFrequency: 10 });
    const conn = await pool.checkout();
    pool.checkin(conn);
    expect(pool.stat().connections).toBe(1);

    vi.advanceTimersByTime(2000);
    expect(pool.stat().connections).toBe(1);

    vi.advanceTimersByTime(10_000);
    expect(pool.stat().connections).toBe(0);
  } finally {
    (Reaper as any)._timers.forEach((t: any) => clearInterval(t));
    (Reaper as any)._timers.clear();
    (Reaper as any)._pools.clear();
    vi.useRealTimers();
  }
});

it("disconnect calls disconnectBang on each pooled connection", async () => {
  const pool = makePool(3);
  const c1 = await pool.checkout();
  const c2 = await pool.checkout();
  pool.checkin(c1);
  pool.checkin(c2);
  const spy1 = vi.fn();
  const spy2 = vi.fn();
  (c1 as unknown as { disconnectBang: () => void }).disconnectBang = spy1;
  (c2 as unknown as { disconnectBang: () => void }).disconnectBang = spy2;

  await pool.disconnectBang();

  expect(spy1).toHaveBeenCalled();
  expect(spy2).toHaveBeenCalled();
  expect(pool.connections).toEqual([]);
});

it("disconnect under exclusive acquisition checks out idle connections during the block", async () => {
  const pool = makePool(2);
  const c1 = await pool.checkout();
  pool.checkin(c1);
  const stat = pool.stat();
  expect(stat.busy).toBe(0);
  expect(stat.idle).toBe(1);

  await pool.disconnectBang();
  expect(pool.stat().connections).toBe(0);
});

it("clearReloadableConnections only disconnects reloadable adapters", async () => {
  const pool = makePool(3);
  const c1 = await pool.checkout();
  const c2 = await pool.checkout();
  pool.checkin(c1);
  pool.checkin(c2);
  (c1 as unknown as { requiresReloading: () => boolean }).requiresReloading = () => true;
  (c2 as unknown as { requiresReloading: () => boolean }).requiresReloading = () => false;
  const spy1 = vi.fn();
  const spy2 = vi.fn();
  (c1 as unknown as { disconnectBang: () => void }).disconnectBang = spy1;
  (c2 as unknown as { disconnectBang: () => void }).disconnectBang = spy2;

  await pool.clearReloadableConnectionsBang();

  expect(spy1).toHaveBeenCalled();
  expect(spy2).not.toHaveBeenCalled();
  expect(pool.connections).toContain(c2);
  expect(pool.connections).not.toContain(c1);
  expect(pool.stat().busy).toBe(0);
  const reused = await pool.checkout();
  expect(reused).toBe(c2);
  pool.checkin(reused);
});

it("pin connection reuses leased connection and checks in on unpin", async () => {
  const pool = makeAmbientPool({ pool: 5 });
  try {
    const leased = (await pool.leaseConnection()) as LeasedTestAdapter;

    await pool.pinConnectionBang();
    const pinned = (await pool.checkout()) as LeasedTestAdapter;
    expect(pinned).toBe(leased);
    expect(leased.transactionManager.openTransactions).toBe(1);
    expect(leased.transactionManager.currentTransaction.joinable).toBe(false);

    const clean = await pool.unpinConnectionBang();
    expect(clean).toBe(true);
    expect(leased.transactionManager.openTransactions).toBe(0);

    expect(pool.stat().idle).toBe(1);
  } finally {
    await closePoolConnections(pool);
  }
});

it("pin connection isolation across execution contexts", async () => {
  const pool = makeAmbientPool({ pool: 5 });
  let ctx1Conn: DatabaseAdapter | null = null;
  let ctx2Conn: DatabaseAdapter | null = null;

  try {
    await withExecutionContext(async () => {
      await pool.pinConnectionBang();
      ctx1Conn = await pool.checkout();

      await withExecutionContext(async () => {
        await pool.pinConnectionBang();
        ctx2Conn = await pool.checkout();
        expect(ctx2Conn).not.toBe(ctx1Conn);

        pool.checkin(ctx2Conn);
        expect(await pool.checkout()).toBe(ctx2Conn);

        await pool.unpinConnectionBang();
      });

      expect(await pool.checkout()).toBe(ctx1Conn);
      await pool.unpinConnectionBang();
    });

    expect(ctx1Conn).toBeTruthy();
    expect(ctx2Conn).toBeTruthy();
    expect(ctx1Conn).not.toBe(ctx2Conn);
  } finally {
    await closePoolConnections(pool);
  }
});

it("concurrent checkouts within a pinned context all return the pinned connection", async () => {
  const pool = makeAmbientPool({ pool: 5 });
  try {
    await pool.pinConnectionBang();
    const pinned = await pool.checkout();

    const results = await Promise.all(
      Array.from({ length: 11 }, async () => {
        const first = await pool.checkout();
        const second = await pool.checkout();
        return { first, second };
      }),
    );
    for (const { first, second } of results) {
      expect(first).toBe(pinned);
      expect(second).toBe(pinned);
    }
    await pool.unpinConnectionBang();
  } finally {
    await closePoolConnections(pool);
  }
});

it("fixture pin survives across execution contexts (vitest beforeEach/afterEach)", async () => {
  const pool = makeAmbientPool({ pool: 5 });
  let pinned: DatabaseAdapter | null = null;
  try {
    await withExecutionContext(async () => {
      await pool.pinConnectionBang({ fixture: true });
      pinned = await pool.checkout();
    });
    await withExecutionContext(async () => {
      expect(await pool.checkout()).toBe(pinned);
      const clean = await pool.unpinConnectionBang();
      expect(clean).toBe(true);
    });
  } finally {
    await closePoolConnections(pool);
  }
});

it("fixture pin holds a leased connection", async () => {
  const pool = makeAmbientPool({ pool: 5 });
  try {
    const established = await pool.checkout();
    pool.checkin(established);
    expect(established.inUse).toBe(false);

    await withExecutionContext(async () => {
      await pool.pinConnectionBang({ fixture: true });
      expect((await pool.checkout()).inUse).toBe(true);
      await pool.unpinConnectionBang();
    });
  } finally {
    await closePoolConnections(pool);
  }
});

it("context pin takes priority over fixture pin in unpin", async () => {
  const pool = makeAmbientPool({ pool: 5 });
  try {
    await pool.pinConnectionBang({ fixture: true });
    await withExecutionContext(async () => {
      await pool.pinConnectionBang();
      const before = await pool.checkout();
      await pool.unpinConnectionBang();
      expect(await pool.checkout()).toBe(before);
    });
    await pool.unpinConnectionBang();
    await expect(pool.unpinConnectionBang()).rejects.toThrow(/isn't a pinned connection/);
  } finally {
    await closePoolConnections(pool);
  }
});

it("concurrent unpinConnectionBang calls do not interleave inside the pin tear-down", async () => {
  const pool = makeAmbientPool({ pool: 5 });
  try {
    await pool.pinConnectionBang();
    const pinned = (await pool.checkout()) as LeasedTestAdapter;

    const tm = pinned.transactionManager as unknown as {
      rollbackTransaction: (...args: unknown[]) => Promise<unknown>;
    };
    const original = tm.rollbackTransaction.bind(tm);
    const events: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    tm.rollbackTransaction = async (...args: unknown[]) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      events.push("rollback:begin");
      try {
        await Promise.resolve();
        return await original(...args);
      } finally {
        events.push("rollback:end");
        inFlight--;
      }
    };

    const [first, second] = await Promise.allSettled([
      pool.unpinConnectionBang(),
      pool.unpinConnectionBang(),
    ]);

    expect(maxInFlight).toBe(1);
    expect(events).toEqual(["rollback:begin", "rollback:end"]);
    expect(first).toMatchObject({ status: "fulfilled", value: true });
    expect(second).toMatchObject({ status: "rejected" });
    expect((second as PromiseRejectedResult).reason).toMatchObject({
      message: expect.stringContaining("isn't a pinned connection"),
    });
    expect(pinned.transactionManager.openTransactions).toBe(0);
  } finally {
    await closePoolConnections(pool);
  }
});

it("unpinConnectionBang leaves the connection checked out when the rollback raises", async () => {
  const pool = makeAmbientPool({ pool: 5 });
  try {
    await pool.pinConnectionBang();
    const pinned = (await pool.checkout()) as LeasedTestAdapter;

    const tm = pinned.transactionManager as unknown as {
      rollbackTransaction: (...args: unknown[]) => Promise<unknown>;
    };
    tm.rollbackTransaction = async () => {
      throw new Error("rollback exploded");
    };

    await expect(pool.unpinConnectionBang()).rejects.toThrow("rollback exploded");
    expect(pinned.inUse).toBe(true);
    await expect(pool.unpinConnectionBang()).rejects.toThrow(/isn't a pinned connection/);
  } finally {
    await closePoolConnections(pool);
  }
});

describe("ConnectionPool schema cache", () => {
  fixtures(["posts"], { useTransactionalTests: false });

  it("exposes a BoundSchemaReflection via pool.schemaCache", async () => {
    const pool = makePool();
    expect(pool.schemaCache).toBeInstanceOf(BoundSchemaReflection);
  });

  it("memoizes the bound reflection across calls", async () => {
    const pool = makePool();
    expect(pool.schemaCache).toBe(pool.schemaCache);
  });

  it("adapter.internalSchemaCache reads the raw SchemaCache from poolConfig, not the bound reflection", async () => {
    const { SchemaCache } = await import("./connection-adapters/schema-cache.js");
    const pool = makeAmbientPool();
    try {
      const cache = await pool.withConnection(
        (conn) => (conn as unknown as { internalSchemaCache: unknown }).internalSchemaCache,
      );
      expect(cache).toBeInstanceOf(SchemaCache);
      expect(cache).not.toBe(pool.schemaCache);
      expect(pool.poolConfig.schemaCache).toBe(cache);
    } finally {
      await closePoolConnections(pool);
    }
  });

  it("swapping schemaReflection invalidates the cached BoundSchemaReflection", async () => {
    const pool = makePool();
    const before = pool.schemaCache;
    pool.schemaReflection = new SchemaReflection("db/other_cache.json");
    const after = pool.schemaCache;
    expect(after).not.toBe(before);
  });

  const realisticColumnJson = {
    name: "id",
    default: null,
    sqlTypeMetadata: {
      sqlType: "INTEGER",
      type: "integer",
      limit: null,
      precision: null,
      scale: null,
    },
    null: false,
    defaultFunction: null,
    collation: null,
    comment: null,
    primaryKey: true,
  };

  async function writeCacheFixture(
    cacheFile: string,
    tableName: string,
    version: string | number | null,
  ): Promise<void> {
    await writeFile(
      cacheFile,
      JSON.stringify({
        columns: { [tableName]: [realisticColumnJson] },
        primary_keys: { [tableName]: "id" },
        data_sources: { [tableName]: true },
        indexes: {},
        version,
      }),
    );
  }

  it("lazily loads the schema cache on first connection when enabled", async () => {
    const prevLazy = SchemaReflection.lazilyLoadSchemaCache;
    SchemaReflection.lazilyLoadSchemaCache = true;

    await withCacheDir(async (dir) => {
      const cacheFile = join(dir, "schema_cache.json");
      await writeCacheFixture(cacheFile, "more_testings", 0);
      const pool = makeAmbientPool({ schemaCachePath: cacheFile });
      try {
        await pool.leaseConnection();
        pool.releaseConnection();
        await pool._lazyLoadPromise;
        expect(pool.schemaCache.isCached("more_testings")).toBe(true);
        expect(pool.poolConfig.schemaCache).not.toBeNull();
        expect(pool.poolConfig.schemaCache!.isCached("more_testings")).toBe(true);
      } finally {
        SchemaReflection.lazilyLoadSchemaCache = prevLazy;
        await closePoolConnections(pool);
      }
    });
  });

  it("rejects a stale schema cache when checkSchemaCacheDumpVersion is enabled", async () => {
    const prevLazy = SchemaReflection.lazilyLoadSchemaCache;
    SchemaReflection.lazilyLoadSchemaCache = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await withCacheDir(async (dir) => {
      const cacheFile = join(dir, "schema_cache.json");
      await writeCacheFixture(cacheFile, "stale_thing", 42);
      const pool = makeAmbientPool({ schemaCachePath: cacheFile });
      try {
        await pool.leaseConnection();
        pool.releaseConnection();
        expect(pool._lazyLoadPromise).not.toBeNull();
        await pool._lazyLoadPromise;
        expect(pool.schemaCache.isCached("stale_thing")).toBe(false);
      } finally {
        SchemaReflection.lazilyLoadSchemaCache = prevLazy;
        vi.restoreAllMocks();
        await closePoolConnections(pool);
      }
    });
  });

  it("does not lazy-load when the flag is off (default)", async () => {
    expect(SchemaReflection.lazilyLoadSchemaCache).toBe(false);

    await withCacheDir(async (dir) => {
      const cacheFile = join(dir, "schema_cache.json");
      await writeCacheFixture(cacheFile, "widgets", 0);
      const pool = makeAmbientPool({ schemaCachePath: cacheFile });
      try {
        await pool.leaseConnection();
        pool.releaseConnection();
        expect(pool._lazyLoadPromise).toBeNull();
        expect(pool.schemaCache.isCached("widgets")).toBe(false);
      } finally {
        await closePoolConnections(pool);
      }
    });
  });

  it.skipIf(inMemoryDb())(
    "eagerly warms the schema cache by introspection on first connection when enabled",
    async () => {
      const prevEager = SchemaReflection.eagerLoadSchemaCache;
      SchemaReflection.eagerLoadSchemaCache = true;

      const pool = makeAmbientPool({ schemaCachePath: "" });
      try {
        await pool.leaseConnection();
        pool.releaseConnection();
        expect(pool._eagerWarmPromise).not.toBeNull();
        await pool._eagerWarmPromise;
        expect(pool.schemaCache.isCached("posts")).toBe(true);
        expect(pool.poolConfig.schemaCache).not.toBeNull();
        expect(pool.poolConfig.schemaCache!.isColumnsHash(null, "posts")).toBe(true);
      } finally {
        SchemaReflection.eagerLoadSchemaCache = prevEager;
        await closePoolConnections(pool);
      }
    },
  );

  it.skipIf(inMemoryDb())(
    "lets eager warming win when both lazy and eager flags are on",
    async () => {
      const prevLazy = SchemaReflection.lazilyLoadSchemaCache;
      const prevEager = SchemaReflection.eagerLoadSchemaCache;
      SchemaReflection.lazilyLoadSchemaCache = true;
      SchemaReflection.eagerLoadSchemaCache = true;

      const pool = makeAmbientPool({ schemaCachePath: "" });
      try {
        await pool.leaseConnection();
        pool.releaseConnection();
        expect(pool._lazyLoadPromise).toBeNull();
        expect(pool._eagerWarmPromise).not.toBeNull();
        await pool._eagerWarmPromise;
        expect(pool.schemaCache.isCached("posts")).toBe(true);
      } finally {
        SchemaReflection.lazilyLoadSchemaCache = prevLazy;
        SchemaReflection.eagerLoadSchemaCache = prevEager;
        await closePoolConnections(pool);
      }
    },
  );

  it("does not eagerly warm when the flag is off (default)", async () => {
    expect(SchemaReflection.eagerLoadSchemaCache).toBe(false);

    const pool = makeAmbientPool({ schemaCachePath: "" });
    try {
      await pool.leaseConnection();
      pool.releaseConnection();
      expect(pool._eagerWarmPromise).toBeNull();
      expect(pool.schemaCache.isCached("posts")).toBe(false);
    } finally {
      await closePoolConnections(pool);
    }
  });

  it.skipIf(inMemoryDb())(
    "BoundSchemaReflection.dumpTo(filename) round-trips through the pool",
    async () => {
      await withCacheDir(async (dir) => {
        const pool = makeAmbientPool();
        try {
          const filename = join(dir, "schema_cache.json");
          await pool.schemaCache.dumpTo(filename);
          const parsed = JSON.parse(await readFile(filename, "utf8")) as {
            columns: Record<string, unknown[]>;
          };
          expect(Object.keys(parsed.columns)).toContain("posts");
        } finally {
          await closePoolConnections(pool);
        }
      });
    },
  );

  it("PoolConfig treats blank/empty schemaCachePath as presence-based 'no cache'", async () => {
    for (const blank of ["", "   "]) {
      const dbConfig = makeAmbientDbConfig({ schemaCachePath: blank });
      const pc = new PoolConfig(
        new ConnectionDescriptor("primary"),
        dbConfig,
        "writing",
        "default",
      );
      expect(
        (pc.schemaReflection as unknown as { _cachePath: string | null })._cachePath,
      ).toBeNull();
    }
  });

  it("PoolConfig aligns SchemaReflection path with DatabaseTasks.dbDir", async () => {
    const { DatabaseTasks } = await import("./tasks/database-tasks.js");
    const originalDbDir = DatabaseTasks.dbDir;
    DatabaseTasks.dbDir = "custom_db_dir";
    try {
      const dbConfig = makeAmbientDbConfig();
      const pc = new PoolConfig(
        new ConnectionDescriptor("primary"),
        dbConfig,
        "writing",
        "default",
      );
      const cachePath = (pc.schemaReflection as unknown as { _cachePath: string | null })
        ._cachePath;
      expect(cachePath).toBe("custom_db_dir/schema_cache.json");
    } finally {
      DatabaseTasks.dbDir = originalDbDir;
    }
  });

  it("PoolConfig primes SchemaReflection with the config's schemaCachePath", async () => {
    const dbConfig = makeAmbientDbConfig({ schemaCachePath: "db/custom_cache.json" });
    const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default");
    const reflection = pc.schemaReflection;
    expect(reflection).toBeInstanceOf(SchemaReflection);
    expect((reflection as unknown as { _cachePath: string | null })._cachePath).toBe(
      "db/custom_cache.json",
    );
  });
});

describe("adapterNameFromConfig", () => {
  it("answers the registered Rails adapter names verbatim", async () => {
    expect(adapterNameFromConfig("postgresql")).toBe("postgresql");
    expect(adapterNameFromConfig("mysql2")).toBe("mysql2");
    expect(adapterNameFromConfig("sqlite3")).toBe("sqlite3");
  });

  it("answers sqlite3 for the trails-only SQLite drivers", async () => {
    expect(adapterNameFromConfig("libsql")).toBe("sqlite3");
    expect(adapterNameFromConfig("node-sqlite")).toBe("sqlite3");
    expect(adapterNameFromConfig("expo-sqlite")).toBe("sqlite3");
  });

  it("raises AdapterNotFound for an unregistered adapter", async () => {
    expect(() => adapterNameFromConfig(undefined)).toThrow(AdapterNotFound);
    expect(() => adapterNameFromConfig("postgres")).toThrow(
      "Database configuration specifies nonexistent 'postgres' adapter.",
    );
    expect(() => adapterNameFromConfig("unknown")).toThrow(
      "Database configuration specifies nonexistent 'unknown' adapter.",
    );
  });
});

describe("ConnectionPoolConfiguration query cache", () => {
  describe("context-keyed cache registry", () => {
    it("two concurrent execution contexts each get their own Store", async () => {
      const pool = makePool(2);

      let cacheA: Store | null = null;
      let cacheB: Store | null = null;

      await Promise.all([
        withExecutionContext(async () => {
          const conn = await pool.checkout();
          cacheA = (conn as unknown as { _queryCache: Store | null })._queryCache;
          pool.checkin(conn);
        }),
        withExecutionContext(async () => {
          const conn = await pool.checkout();
          cacheB = (conn as unknown as { _queryCache: Store | null })._queryCache;
          pool.checkin(conn);
        }),
      ]);

      expect(cacheA).toBeInstanceOf(Store);
      expect(cacheB).toBeInstanceOf(Store);
      expect(cacheA).not.toBe(cacheB);
    });

    it("writing to the cache in context X is not visible in context Y", async () => {
      const pool = makePool(2);
      const KEY = "SELECT 1";

      let cacheA: Store | null = null;
      let cacheB: Store | null = null;

      await withExecutionContext(async () => {
        const conn = await pool.checkout();
        cacheA = (conn as unknown as { _queryCache: Store | null })._queryCache;
        cacheA!.enabled = true;
        await cacheA!.computeIfAbsent(KEY, async () => [{ x: 1 }]);
        pool.checkin(conn);
      });

      await withExecutionContext(async () => {
        const conn = await pool.checkout();
        cacheB = (conn as unknown as { _queryCache: Store | null })._queryCache;
        pool.checkin(conn);
      });

      expect(cacheA).not.toBe(cacheB);
      expect(cacheA!.get(KEY)).toBeDefined();
      expect(cacheB!.get(KEY)).toBeUndefined();
    });
  });

  describe("pin wiring", () => {
    it("pinConnectionBang pins a connection; unpinConnectionBang unpins it", async () => {
      const pool = makeAmbientPool({ pool: 1 });

      const pinnedCount = (): number =>
        (pool as unknown as { _resolvePinnedConnection(): unknown })._resolvePinnedConnection()
          ? 1
          : 0;

      try {
        expect(pinnedCount()).toBe(0);

        await withExecutionContext(async () => {
          await pool.pinConnectionBang();
          expect(pinnedCount()).toBe(1);
          await pool.unpinConnectionBang();
          expect(pinnedCount()).toBe(0);
        });
      } finally {
        await closePoolConnections(pool);
      }
    });

    it("two concurrent contexts each pin a connection independently", async () => {
      const pool = makeAmbientPool({ pool: 2 });
      const pinnedCount = (): number =>
        (pool as unknown as { _resolvePinnedConnection(): unknown })._resolvePinnedConnection()
          ? 1
          : 0;

      try {
        await Promise.all([
          withExecutionContext(async () => {
            await pool.pinConnectionBang();
            expect(pinnedCount()).toBeGreaterThanOrEqual(1);
            await pool.unpinConnectionBang();
          }),
          withExecutionContext(async () => {
            await pool.pinConnectionBang();
            expect(pinnedCount()).toBeGreaterThanOrEqual(1);
            await pool.unpinConnectionBang();
          }),
        ]);

        expect(pinnedCount()).toBe(0);
      } finally {
        await closePoolConnections(pool);
      }
    });

    it("unpins when beginTransaction throws", async () => {
      const pool = makeAmbientPool({ pool: 1 });
      try {
        const seed = await pool.checkout();
        pool.checkin(seed);
        vi.spyOn(seed, "verifyBang").mockResolvedValue(undefined);
        (seed as unknown as { _transactionManager: unknown })._transactionManager = {
          beginTransaction: async () => {
            throw new Error("begin failed");
          },
          get currentTransaction() {
            return { open: false };
          },
          enableLazyTransactionsBang() {},
        };

        const pinnedCount = (): number =>
          (pool as unknown as { _resolvePinnedConnection(): unknown })._resolvePinnedConnection()
            ? 1
            : 0;

        await withExecutionContext(async () => {
          await expect(pool.pinConnectionBang()).rejects.toThrow("begin failed");
          expect(pinnedCount()).toBe(0);
        });
      } finally {
        await closePoolConnections(pool);
      }
    });

    it("propagates a verify failure from pinConnectionBang instead of pinning a dead connection", async () => {
      const pool = makeAmbientPool({ pool: 1 });
      try {
        const seed = await pool.checkout();
        pool.checkin(seed);
        vi.spyOn(seed, "verifyBang").mockRejectedValue(new Error("connection is dead"));

        const pinnedCount = (): number =>
          (pool as unknown as { _resolvePinnedConnection(): unknown })._resolvePinnedConnection()
            ? 1
            : 0;

        await withExecutionContext(async () => {
          await expect(pool.pinConnectionBang()).rejects.toThrow("connection is dead");
          expect(pinnedCount()).toBe(0);
        });
      } finally {
        await closePoolConnections(pool);
      }
    });
  });

  describe("checkout/checkin cache attachment", () => {
    it("checkout attaches a Store; checkin clears it", async () => {
      const pool = makePool(1);
      const conn = await pool.checkout();
      const qc = (conn as unknown as { _queryCache: Store | null })._queryCache;
      expect(qc).toBeInstanceOf(Store);
      pool.checkin(conn);
      expect((conn as unknown as { _queryCache: Store | null })._queryCache).toBeNull();
    });

    it("checkout attaches a Store on the fast (idle) path", async () => {
      const pool = makePool(1);
      const seed = await pool.checkout();
      pool.checkin(seed);

      await withExecutionContext(async () => {
        const conn = await pool.checkout();
        expect((conn as unknown as { _queryCache: Store | null })._queryCache).toBeInstanceOf(
          Store,
        );
        pool.checkin(conn);
      });
    });
  });

  describe("pool-level enable/disable propagation", () => {
    it("enableQueryCacheBang on the pool flips the checked-out connection's Store", async () => {
      const pool = makePool(1);
      pool.enableQueryCacheBang();
      const conn = await pool.checkout();
      const qc = (conn as unknown as { _queryCache: Store | null })._queryCache!;
      expect(qc.enabled).toBe(true);
      pool.disableQueryCacheBang();
      expect(qc.enabled).toBe(false);
      pool.checkin(conn);
    });

    it("enableQueryCache enables for the duration of fn and clears on exit", async () => {
      const pool = makePool(1);
      let observed: Store | null = null;
      await pool.enableQueryCache(async () => {
        const conn = await pool.checkout();
        observed = (conn as unknown as { _queryCache: Store | null })._queryCache;
        expect(observed!.enabled).toBe(true);
        await observed!.computeIfAbsent("SELECT 1", async () => [{ x: 1 }]);
        expect(observed!.size).toBe(1);
        pool.checkin(conn);
      });
      pool.clearQueryCache();
      expect(observed!.enabled).toBe(false);
      expect(observed!.size).toBe(0);
    });
  });

  describe("queryCacheMaxSize wiring", () => {
    it("threads dbConfig.queryCache through to the Store's max size", async () => {
      const dbConfig = makeAmbientDbConfig({ pool: 1, queryCache: 7 });
      const pc = new PoolConfig(
        new ConnectionDescriptor("primary"),
        dbConfig,
        "writing",
        "default",
      );
      const pool = new ConnectionPool(pc);
      const max = (pool.queryCache as unknown as { _maxSize: number })._maxSize;
      expect(max).toBe(7);
    });
  });

  describe("execution-context exit eviction", () => {
    it("evicts the per-context Store from _threadQueryCaches when the context exits", async () => {
      const pool = makePool(1);
      const registry = (
        pool as unknown as {
          _cacheConfig: { _threadQueryCaches: { _caches: Map<string, Store> } };
        }
      )._cacheConfig._threadQueryCaches;

      let seenSize = -1;
      await withExecutionContext(async () => {
        const conn = await pool.checkout();
        pool.checkin(conn);
        seenSize = registry._caches.size;
      });
      expect(seenSize).toBeGreaterThan(0);
      expect(registry._caches.size).toBe(0);
    });
  });
});

describe("checkout/checkin callbacks", () => {
  it("pinned checkout verifies on every handout (reconnect-on-drop) and skips query-cache wiring", async () => {
    const pool = makeAmbientPool({ pool: 5 });
    await pool.pinConnectionBang();
    const pinned = (await pool.checkout()) as LeasedTestAdapter;
    const spy = vi.spyOn(pinned, "verifyBang");
    try {
      const again = await pool.checkout();
      expect(again).toBe(pinned);
      expect(spy).toHaveBeenCalledTimes(1);
      const againAgain = await pool.checkout();
      expect(againAgain).toBe(pinned);
      expect(spy).toHaveBeenCalledTimes(2);
      expect((pinned as unknown as { _queryCache: Store | null })._queryCache).toBeInstanceOf(
        Store,
      );
    } finally {
      await pool.unpinConnectionBang();
      await closePoolConnections(pool);
    }
  });

  it("checkin runs the registered :checkin :after callbacks (unset_query_cache!, enable_lazy_transactions!)", async () => {
    const pool = makeAmbientPool({ pool: 1 });
    try {
      const conn = await pool.checkout();
      expect((conn as unknown as { _queryCache: Store | null })._queryCache).toBeInstanceOf(Store);

      const lazySpy = vi.spyOn(conn, "enableLazyTransactionsBang");
      pool.checkin(conn);

      expect((conn as unknown as { _queryCache: Store | null })._queryCache).toBeNull();
      expect(lazySpy).toHaveBeenCalledTimes(1);
    } finally {
      await closePoolConnections(pool);
    }
  });

  it("setCallback registers a custom :checkout callback that runs on checkout", async () => {
    const calls: string[] = [];
    AbstractAdapter.setCallback("checkout", "after", function () {
      calls.push(this.adapterName);
    });
    const pool = makeAmbientPool({ pool: 1 });
    try {
      const conn = await pool.checkout();
      expect(calls).toEqual([conn.adapterName]);
    } finally {
      await closePoolConnections(pool);
      (
        AbstractAdapter as unknown as {
          _connectionCallbacks: { checkout: unknown[] };
        }
      )._connectionCallbacks.checkout.pop();
    }
  });

  it("setCallback on a subclass clones the registry and does not leak onto AbstractAdapter", async () => {
    class SubAdapter extends AbstractAdapter {}
    const before = (AbstractAdapter as unknown as { _connectionCallbacks: { checkout: unknown[] } })
      ._connectionCallbacks.checkout.length;

    SubAdapter.setCallback("checkout", "after", function () {});

    const sub = (SubAdapter as unknown as { _connectionCallbacks: { checkout: unknown[] } })
      ._connectionCallbacks;
    const base = (AbstractAdapter as unknown as { _connectionCallbacks: { checkout: unknown[] } })
      ._connectionCallbacks;
    expect(sub).not.toBe(base);
    expect(sub.checkout.length).toBe(before + 1);
    expect(base.checkout.length).toBe(before);
  });

  it("subclass without its own callback inherits AbstractAdapter's shared registry", async () => {
    class SharedAdapter extends AbstractAdapter {}
    const sub = (SharedAdapter as unknown as { _connectionCallbacks: unknown })
      ._connectionCallbacks;
    const base = (AbstractAdapter as unknown as { _connectionCallbacks: unknown })
      ._connectionCallbacks;
    expect(sub).toBe(base);
  });
});

describe("NullPool member parity", () => {
  it("defines no role or shard, matching Rails' NullPool", () => {
    const pool = new NullPool();
    expect("role" in pool).toBe(false);
    expect("shard" in pool).toBe(false);
  });

  it("raises NoMethodError on a pool-less adapter's role, shard and inspect", () => {
    const adapter = new AbstractAdapter();
    expect(adapter.pool).toBeInstanceOf(NullPool);
    expect(() => adapter.role).toThrow(/undefined method 'role'/);
    expect(() => adapter.shard).toThrow(/undefined method 'shard'/);
    expect(() => adapter.inspect()).toThrow(/undefined method 'shard'/);
  });

  it("raises NoMethodError for every send it has no method for", () => {
    const pool = new NullPool() as unknown as Record<string, unknown>;
    for (const name of ["clearQueryCache", "withConnection", "connectionClass", "flush"]) {
      expect(() => pool[name]).toThrow(NoMethodError);
    }
    expect(pool.dirtiesQueryCache).toBe(true);
    expect(pool.schemaCache).toBeNull();
    for (const probe of ["then", "toJSON", "asymmetricMatch", "nodeType"]) {
      expect(() => pool[probe]).toThrow(NoMethodError);
    }
    expect((pool.inspect as () => string)()).toBe(
      "#<ActiveRecord::ConnectionAdapters::NullPool @server_version=nil>",
    );
    expect(pool.toString).toBe(Object.prototype.toString);
    expect(pool[Symbol.toStringTag as unknown as string]).toBeUndefined();
  });

  it("lets a failing assertion whose subject holds a NullPool report its own failure", () => {
    const adapter = new AbstractAdapter();
    expect(() =>
      expect({ pool: adapter.pool, n: 1 }).toEqual({ pool: adapter.pool, n: 2 }),
    ).toThrow(/expected/i);
  });
});
