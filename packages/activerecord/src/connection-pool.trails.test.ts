/**
 * trails-specific invariants for ConnectionPool that have no Rails
 * connection_pool_test.rb counterpart. These guard trails-only behavior:
 * the `preventPermanentCheckout`/async `withConnection` paths, the idle
 * reaper timer, `disconnect`/`clearReloadableConnections` adapter wiring,
 * execution-context-scoped connection pinning, the BoundSchemaReflection
 * schema-cache surface, `adapterNameFromConfig` normalization, the
 * context-keyed query-cache registry, and the checkout/checkin callback
 * registry. Relocated verbatim from connection-pool.test.ts (RFC 0043).
 */

import { describe, it, expect, vi } from "vitest";
import { Reaper } from "./connection-adapters/abstract/connection-pool/reaper.js";
import {
  ConnectionPool,
  withExecutionContext,
} from "./connection-adapters/abstract/connection-pool.js";
import { Store } from "./connection-adapters/abstract/query-cache.js";
import { ConnectionDescriptor } from "./connection-adapters/abstract/connection-descriptor.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { SchemaReflection, BoundSchemaReflection } from "./connection-adapters/schema-cache.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { newRawTestAdapter } from "./test-adapter.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { adapterNameFromConfig } from "./adapter.js";
import type { AdapterName, DatabaseAdapter } from "./adapter.js";
import { Result } from "./result.js";

/**
 * Close any SQLite/underlying connections still pinned to the pool
 * before unlinking the DB file. ConnectionPool.disconnect clears pool
 * bookkeeping but doesn't close the adapter's file handle; on Windows
 * that keeps the sqlite file open and rmSync fails.
 */
async function closePoolConnections(pool: ConnectionPool): Promise<void> {
  for (const conn of pool.connections) {
    const close = (conn as { close?: () => void | Promise<void> }).close;
    if (typeof close === "function") await close.call(conn);
  }
  await pool.disconnect();
}

function makePool(size: number = 5): ConnectionPool {
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    pool: size,
    reapingFrequency: null,
  });
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
    adapterFactory: newRawTestAdapter,
  });
  return new ConnectionPool(pc);
}

class TransactionAwareTestAdapter extends AbstractAdapter implements DatabaseAdapter {
  override get adapterName(): AdapterName {
    return "sqlite";
  }
  isNoDatabaseError(_error: unknown): boolean {
    return false;
  }
  // This double has no real raw connection; report active so checkout's
  // verify! is a no-op (mirroring Rails, where the pinned connection is
  // active and verify! returns without reconnecting).
  override get active(): boolean {
    return true;
  }
  readonly inTransaction = false;

  async execute(
    _sql: string,
    _binds?: unknown[],
    _name?: string,
  ): Promise<Record<string, unknown>[]> {
    return [];
  }
  async executeMutation(_sql: string, _binds?: unknown[], _name?: string): Promise<number> {
    return 0;
  }
  async beginTransaction(): Promise<void> {}
  async commit(): Promise<void> {}
  async rollback(): Promise<void> {}
  async createSavepoint(_name: string): Promise<void> {}
  async releaseSavepoint(_name: string): Promise<void> {}
  async rollbackToSavepoint(_name: string): Promise<void> {}
  async selectAll(sql: string, _n?: string | null, b?: unknown[]) {
    return Result.fromRowHashes(await this.execute(sql, b));
  }
  async selectOne(sql: string, _n?: string | null, b?: unknown[]) {
    return (await this.execute(sql, b))[0];
  }
  async selectValue(_s: string) {
    return undefined;
  }
  async selectValues(_s: string) {
    return [];
  }
  async selectRows(_s: string) {
    return [];
  }
  async execQuery(sql: string, _n?: string | null, b?: unknown[]) {
    return Result.fromRowHashes(await this.execute(sql, b));
  }
  async execInsert(sql: string, _n?: string | null, b?: unknown[]) {
    return this.executeMutation(sql, b);
  }
  async execDelete(sql: string, _n?: string | null, b?: unknown[]) {
    return this.executeMutation(sql, b);
  }
  async execUpdate(sql: string, _n?: string | null, b?: unknown[]) {
    return this.executeMutation(sql, b);
  }
  isWriteQuery(_sql: string) {
    return false;
  }
  emptyInsertStatementValue() {
    return "DEFAULT VALUES";
  }
}

function makeTransactionAwarePool(size: number = 5): ConnectionPool {
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    pool: size,
    reapingFrequency: null,
  });
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
    adapterFactory: () => new TransactionAwareTestAdapter(),
  });
  return new ConnectionPool(pc);
}

it("with connection prevent permanent checkout releases connection", async () => {
  const pool = makePool();
  pool.leaseConnection();
  expect(pool.activeConnection).toBeTruthy();
  await pool.withConnection(
    (conn) => {
      expect(conn).toBeTruthy();
    },
    { preventPermanentCheckout: true },
  );
  // sticky was restored so connection is still leased
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
  // No prior sticky lease, so connection should be released
  expect(pool.activeConnection).toBeNull();
});

it("withConnection waits for a released connection when pool is saturated", async () => {
  const pool = makePool(1);
  const held = pool.checkout();

  let connSeen: DatabaseAdapter | undefined;
  const waiter = pool.withConnection(
    (conn) => {
      connSeen = conn;
    },
    { checkoutTimeout: 5 },
  );
  pool.checkin(held);
  await waiter;
  expect(connSeen).toBe(held);
  // withConnection releases the connection after fn returns — pool should be idle
  expect(pool.stat().busy).toBe(0);
  expect(pool.stat().idle).toBe(1);
});

it("withConnection rejects with ConnectionTimeoutError when pool stays saturated past timeout", async () => {
  const { ConnectionTimeoutError } = await import("./errors.js");
  vi.useFakeTimers();
  try {
    const pool = makePool(1);
    pool.checkout();

    const waiter = pool.withConnection(() => {}, { checkoutTimeout: 0.05 });
    // Attach the rejection handler before advancing timers to avoid an
    // unhandled-rejection window during IPC serialization.
    const assertion = expect(waiter).rejects.toThrow(ConnectionTimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});

it("withConnection waits using pool default timeout without explicit checkoutTimeout", async () => {
  // Regression: previously withConnection threw immediately when the pool was
  // saturated unless the caller passed { checkoutTimeout }. Now it always queues
  // a waiter using checkoutAsync (matching Rails behaviour).
  const pool = makePool(1);
  const held = pool.checkout();

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
  pool.checkout();
  await expect(pool.checkoutAsync(0.05)).rejects.toThrow(/could not obtain a connection/);
});

it("reaper flushes idle connections after idle_timeout", () => {
  try {
    vi.useFakeTimers();
    const dbConfig = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: "test.db",
      idleTimeout: 1,
      reapingFrequency: 10,
    });
    const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
      adapterFactory: newRawTestAdapter,
    });
    const pool = new ConnectionPool(pc);
    const conn = pool.checkout();
    pool.checkin(conn);
    expect(pool.stat().connections).toBe(1);

    // Advance past the idleTimeout but not yet past the reaping interval
    vi.advanceTimersByTime(2000);
    expect(pool.stat().connections).toBe(1);

    // Advance past the reaping interval — reaper fires reap() + flush()
    vi.advanceTimersByTime(10_000);
    expect(pool.stat().connections).toBe(0);
  } finally {
    // Clear Reaper static state directly (mirrors reaper.test.ts teardown) so
    // later tests with the same reapingFrequency get a fresh real timer.
    (Reaper as any)._timers.forEach((t: any) => clearInterval(t));
    (Reaper as any)._timers.clear();
    (Reaper as any)._pools.clear();
    vi.useRealTimers();
  }
});

it("disconnect calls disconnectBang on each pooled connection", () => {
  const pool = makePool(3);
  const c1 = pool.checkout();
  const c2 = pool.checkout();
  pool.checkin(c1);
  pool.checkin(c2);
  const spy1 = vi.fn();
  const spy2 = vi.fn();
  (c1 as unknown as { disconnectBang: () => void }).disconnectBang = spy1;
  (c2 as unknown as { disconnectBang: () => void }).disconnectBang = spy2;

  pool.disconnectBang();

  expect(spy1).toHaveBeenCalled();
  expect(spy2).toHaveBeenCalled();
  expect(pool.connections).toEqual([]);
});

it("disconnect under exclusive acquisition checks out idle connections during the block", () => {
  const pool = makePool(2);
  const c1 = pool.checkout();
  pool.checkin(c1);
  const stat = pool.stat();
  expect(stat.busy).toBe(0);
  expect(stat.idle).toBe(1);

  pool.disconnectBang();
  // After disconnect, the pool is fully drained.
  expect(pool.stat().connections).toBe(0);
});

it("clearReloadableConnections only disconnects reloadable adapters", () => {
  const pool = makePool(3);
  const c1 = pool.checkout();
  const c2 = pool.checkout();
  pool.checkin(c1);
  pool.checkin(c2);
  // Mark only c1 as reloadable.
  (c1 as unknown as { requiresReloading: () => boolean }).requiresReloading = () => true;
  (c2 as unknown as { requiresReloading: () => boolean }).requiresReloading = () => false;
  const spy1 = vi.fn();
  const spy2 = vi.fn();
  (c1 as unknown as { disconnectBang: () => void }).disconnectBang = spy1;
  (c2 as unknown as { disconnectBang: () => void }).disconnectBang = spy2;

  pool.clearReloadableConnectionsBang();

  expect(spy1).toHaveBeenCalled();
  expect(spy2).not.toHaveBeenCalled();
  expect(pool.connections).toContain(c2);
  expect(pool.connections).not.toContain(c1);
  // Survivor must not stay stuck in _checkedOut — it should be reusable.
  expect(pool.stat().busy).toBe(0);
  const reused = pool.checkout();
  expect(reused).toBe(c2);
  pool.checkin(reused);
});

it("pin connection reuses leased connection and checks in on unpin", async () => {
  const pool = makeTransactionAwarePool(5);
  const leased = pool.leaseConnection() as TransactionAwareTestAdapter;

  await pool.pinConnectionBang();
  const pinned = pool.checkout() as TransactionAwareTestAdapter;
  expect(pinned).toBe(leased);
  expect(leased.transactionManager.openTransactions).toBe(1);
  expect(leased.transactionManager.currentTransaction.joinable).toBe(false);

  const clean = await pool.unpinConnectionBang();
  expect(clean).toBe(true);
  expect(leased.transactionManager.openTransactions).toBe(0);

  // Pinning takes ownership — connection is checked in on final unpin (matches Rails)
  expect(pool.stat().idle).toBe(1);
});

it("pin connection isolation across execution contexts", async () => {
  const pool = makeTransactionAwarePool(5);
  let ctx1Conn: DatabaseAdapter | null = null;
  let ctx2Conn: DatabaseAdapter | null = null;

  await withExecutionContext(async () => {
    await pool.pinConnectionBang();
    ctx1Conn = pool.checkout();

    // Nested context gets a different pin
    await withExecutionContext(async () => {
      await pool.pinConnectionBang();
      ctx2Conn = pool.checkout();
      expect(ctx2Conn).not.toBe(ctx1Conn);

      // Checkin of ctx2's pinned connection is a no-op (still pinned)
      pool.checkin(ctx2Conn);
      expect(pool.checkout()).toBe(ctx2Conn);

      await pool.unpinConnectionBang();
    });

    // Back in ctx1 — still pinned to ctx1Conn
    expect(pool.checkout()).toBe(ctx1Conn);
    await pool.unpinConnectionBang();
  });

  expect(ctx1Conn).toBeTruthy();
  expect(ctx2Conn).toBeTruthy();
  expect(ctx1Conn).not.toBe(ctx2Conn);
});

it("concurrent checkouts within a pinned context all return the pinned connection", async () => {
  const pool = makeTransactionAwarePool(5);
  await pool.pinConnectionBang();
  const pinned = pool.checkout();

  // Mirrors Promise.all sub-branches inside a `withTransactionalFixtures`
  // test body: AsyncContext propagates the pin's ctx id to every branch,
  // so every concurrent lease must resolve to the pinned connection rather
  // than pulling a free-list connection (which would race the pinned TX).
  const results = await Promise.all(
    Array.from({ length: 11 }, async () => {
      const sync = pool.checkout();
      const async_ = await pool.checkoutAsync();
      return { sync, async_ };
    }),
  );
  for (const { sync, async_ } of results) {
    expect(sync).toBe(pinned);
    expect(async_).toBe(pinned);
  }
  await pool.unpinConnectionBang();
});

it("fixture pin survives across execution contexts (vitest beforeEach/afterEach)", async () => {
  // Vitest can run beforeEach, the `it()` body, and afterEach in different
  // AsyncLocalStorage scopes. The default per-context pin keys on
  // executionContextId(), so a pin set in context A is invisible from context B
  // and `unpinConnectionBang` from B would throw "There isn't a pinned
  // connection". The `{ fixture: true }` slot is pool-scoped and avoids this.
  const pool = makeTransactionAwarePool(5);
  let pinned: DatabaseAdapter | null = null;
  await withExecutionContext(async () => {
    await pool.pinConnectionBang({ fixture: true });
    pinned = pool.checkout();
  });
  // Different context — pin must still be visible.
  await withExecutionContext(async () => {
    expect(pool.checkout()).toBe(pinned);
    const clean = await pool.unpinConnectionBang();
    expect(clean).toBe(true);
  });
});

it("context pin takes priority over fixture pin in unpin", async () => {
  // If both pins are active, an unpinConnectionBang call from a context that
  // owns the per-context pin must unpin *its* pin, not the fixture-wide one.
  // Otherwise the context pin lingers and the next unpin double-rollbacks.
  const pool = makeTransactionAwarePool(5);
  await pool.pinConnectionBang({ fixture: true });
  await withExecutionContext(async () => {
    await pool.pinConnectionBang(); // per-context pin in this scope
    const before = pool.checkout();
    await pool.unpinConnectionBang(); // should clear the context pin
    // Fixture pin still alive — checkout in this nested context now sees
    // the fixture pin's connection.
    expect(pool.checkout()).toBe(before);
  });
  await pool.unpinConnectionBang(); // clears the fixture pin
  await expect(pool.unpinConnectionBang()).rejects.toThrow(/isn't a pinned connection/);
});

describe("ConnectionPool schema cache", () => {
  it("exposes a BoundSchemaReflection via pool.schemaCache", () => {
    // Mirrors Rails ConnectionPool#schema_cache: returns a
    // BoundSchemaReflection wrapping the pool's SchemaReflection +
    // the pool itself. Previously pool.schemaCache was undefined on
    // the real ConnectionPool class, so DatabaseTasks.dumpSchemaCache
    // never hit the Rails reflection-delegation path.
    const pool = makePool();
    expect(pool.schemaCache).toBeInstanceOf(BoundSchemaReflection);
  });

  it("memoizes the bound reflection across calls", () => {
    const pool = makePool();
    expect(pool.schemaCache).toBe(pool.schemaCache);
  });

  it("adapter.schemaCache reads the raw SchemaCache from poolConfig, not the bound reflection", async () => {
    // Regression: Phase 11 made pool.schemaCache return a
    // BoundSchemaReflection. AbstractAdapter#schemaCache previously
    // reached into pool.schemaCache to store/share a raw SchemaCache
    // instance — with the new getter that would (a) return a
    // BoundSchemaReflection where .clear()/.setColumns() aren't
    // defined and (b) throw on assignment (read-only getter). The
    // fix routes the raw cache through pool.poolConfig.schemaCache,
    // and this test locks that in.
    //
    // Uses a dedicated fresh adapter to get AbstractAdapter's schemaCache getter.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { SchemaCache } = await import("./connection-adapters/schema-cache.js");
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-raw-cache-"));
    const dbFile = path.join(tmp, "raw.sqlite3");
    const dbConfig = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: dbFile,
      reapingFrequency: null,
    });
    const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
      adapterFactory: () => new BetterSQLite3Adapter(dbFile),
    });
    const pool = new ConnectionPool(pc);
    try {
      const cache = await pool.withConnection(
        (conn) => (conn as unknown as { schemaCache: unknown }).schemaCache,
      );
      // The key regression: adapter.schemaCache must be a plain
      // SchemaCache, NOT the BoundSchemaReflection pool.schemaCache
      // returns. Before the fix it would have picked up the bound
      // reflection and failed on .clear()/.setColumns() etc.
      expect(cache).toBeInstanceOf(SchemaCache);
      expect(cache).not.toBe(pool.schemaCache);
      // Verify the raw cache is actually shared through PoolConfig —
      // ConnectionPool.newConnection now sets conn.pool = this so
      // AbstractAdapter.schemaCache can write into
      // pool.poolConfig.schemaCache and every connection sees the
      // same instance.
      expect(pool.poolConfig.schemaCache).toBe(cache);
    } finally {
      await closePoolConnections(pool);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("swapping schemaReflection invalidates the cached BoundSchemaReflection", () => {
    // Matches Rails' `ConnectionPool#schema_reflection=` which sets
    // @schema_cache = nil after swapping so subsequent pool.schema_cache
    // calls rebuild against the new reflection. Without this the
    // bound wrapper would still point at the old reflection after a
    // swap — subtle, rare in practice, but a real parity gap.
    const pool = makePool();
    const before = pool.schemaCache;
    pool.schemaReflection = new SchemaReflection("db/other_cache.json");
    const after = pool.schemaCache;
    expect(after).not.toBe(before);
  });

  // Realistic Column.toJSON shape for cache fixture files.
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
    const fsSync = await import("node:fs");
    fsSync.writeFileSync(
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
    // Rails: ConnectionPool#adopt_connection calls schema_cache.load!
    // on first adoption when ActiveRecord.lazily_load_schema_cache is
    // true. Use version=0 so the version-check (enabled by default)
    // passes against AbstractAdapter's schemaVersion() which returns 0.
    // Await pool._lazyLoadPromise so we're not timing-dependent.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-lazy-load-"));
    const dbFile = path.join(tmp, "lazy.sqlite3");
    const cacheFile = path.join(tmp, "schema_cache.json");
    await writeCacheFixture(cacheFile, "gadgets", 0);

    const prevLazy = SchemaReflection.lazilyLoadSchemaCache;
    SchemaReflection.lazilyLoadSchemaCache = true;

    const dbConfig = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: dbFile,
      reapingFrequency: null,
      schemaCachePath: cacheFile,
    });
    const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
      adapterFactory: () => new BetterSQLite3Adapter(dbFile),
    });
    const pool = new ConnectionPool(pc);
    try {
      pool.leaseConnection();
      pool.releaseConnection();
      await pool._lazyLoadPromise;
      // BoundSchemaReflection side:
      expect(pool.schemaCache.isCached("gadgets")).toBe(true);
      // Adapter-visible raw cache (poolConfig.schemaCache) — after
      // lazy load the reflection's internal cache is propagated so
      // adapter.schemaCache consumers see preloaded data without DB.
      expect(pool.poolConfig.schemaCache).not.toBeNull();
      expect(pool.poolConfig.schemaCache!.isCached("gadgets")).toBe(true);
    } finally {
      SchemaReflection.lazilyLoadSchemaCache = prevLazy;
      await closePoolConnections(pool);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects a stale schema cache when checkSchemaCacheDumpVersion is enabled", async () => {
    // Cache claims version 42; schemaVersion() returns 0 → mismatch.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-stale-cache-"));
    const dbFile = path.join(tmp, "stale.sqlite3");
    const cacheFile = path.join(tmp, "schema_cache.json");
    await writeCacheFixture(cacheFile, "stale_thing", 42);

    const prevLazy = SchemaReflection.lazilyLoadSchemaCache;
    SchemaReflection.lazilyLoadSchemaCache = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const dbConfig = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: dbFile,
      reapingFrequency: null,
      schemaCachePath: cacheFile,
    });
    const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
      adapterFactory: () => new BetterSQLite3Adapter(dbFile),
    });
    const pool = new ConnectionPool(pc);
    try {
      pool.leaseConnection();
      pool.releaseConnection();
      // Verify lazy-load actually triggered so we're testing the
      // version-mismatch rejection — not just the absence of a load.
      expect(pool._lazyLoadPromise).not.toBeNull();
      await pool._lazyLoadPromise;
      expect(pool.schemaCache.isCached("stale_thing")).toBe(false);
    } finally {
      SchemaReflection.lazilyLoadSchemaCache = prevLazy;
      vi.restoreAllMocks();
      await closePoolConnections(pool);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does not lazy-load when the flag is off (default)", async () => {
    // Default: no file I/O at first-connection time.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-no-lazy-"));
    const dbFile = path.join(tmp, "no_lazy.sqlite3");
    const cacheFile = path.join(tmp, "schema_cache.json");
    await writeCacheFixture(cacheFile, "widgets", 0);
    expect(SchemaReflection.lazilyLoadSchemaCache).toBe(false);

    const dbConfig = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: dbFile,
      reapingFrequency: null,
      schemaCachePath: cacheFile,
    });
    const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
      adapterFactory: () => new BetterSQLite3Adapter(dbFile),
    });
    const pool = new ConnectionPool(pc);
    try {
      pool.leaseConnection();
      pool.releaseConnection();
      // _lazyLoadPromise is null when the flag is off.
      expect(pool._lazyLoadPromise).toBeNull();
      expect(pool.schemaCache.isCached("widgets")).toBe(false);
    } finally {
      await closePoolConnections(pool);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("eagerly warms the schema cache by introspection on first connection when enabled", async () => {
    // Production analogue of Rails' schema_cache.addAll(pool) at boot: with
    // no schema_cache.json on disk, eager warming introspects the live DB so
    // a synchronous read sees real columns. Await pool._eagerWarmPromise so
    // we're not timing-dependent.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-eager-warm-"));
    const dbFile = path.join(tmp, "eager.sqlite3");
    const seeded = new BetterSQLite3Adapter(dbFile);
    try {
      await seeded.executeMutation(
        "CREATE TABLE sprockets (id INTEGER PRIMARY KEY, label TEXT NOT NULL)",
      );
    } finally {
      await seeded.close();
    }

    const prevEager = SchemaReflection.eagerLoadSchemaCache;
    SchemaReflection.eagerLoadSchemaCache = true;

    // No schemaCachePath: there is no dump file, so only DB introspection
    // can populate the cache.
    const dbConfig = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: dbFile,
      reapingFrequency: null,
      schemaCachePath: "",
    });
    const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
      adapterFactory: () => new BetterSQLite3Adapter(dbFile),
    });
    const pool = new ConnectionPool(pc);
    try {
      pool.leaseConnection();
      pool.releaseConnection();
      expect(pool._eagerWarmPromise).not.toBeNull();
      await pool._eagerWarmPromise;
      expect(pool.schemaCache.isCached("sprockets")).toBe(true);
      // Adapter-visible raw cache is propagated so synchronous consumers
      // (Model.columnNames) see the introspected columns without a DB hit.
      expect(pool.poolConfig.schemaCache).not.toBeNull();
      expect(pool.poolConfig.schemaCache!.isColumnsHashCached(null, "sprockets")).toBe(true);
    } finally {
      SchemaReflection.eagerLoadSchemaCache = prevEager;
      await closePoolConnections(pool);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("lets eager warming win when both lazy and eager flags are on", async () => {
    // Eager subsumes lazy (loadAllBang consults the dump first, then
    // introspects). With both flags on and NO dump file, the lazy path must
    // not suppress the eager introspection — otherwise the cache stays empty.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-both-warm-"));
    const dbFile = path.join(tmp, "both.sqlite3");
    const seeded = new BetterSQLite3Adapter(dbFile);
    try {
      await seeded.executeMutation("CREATE TABLE sprockets (id INTEGER PRIMARY KEY, label TEXT)");
    } finally {
      await seeded.close();
    }

    const prevLazy = SchemaReflection.lazilyLoadSchemaCache;
    const prevEager = SchemaReflection.eagerLoadSchemaCache;
    SchemaReflection.lazilyLoadSchemaCache = true;
    SchemaReflection.eagerLoadSchemaCache = true;

    const dbConfig = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: dbFile,
      reapingFrequency: null,
      schemaCachePath: "",
    });
    const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
      adapterFactory: () => new BetterSQLite3Adapter(dbFile),
    });
    const pool = new ConnectionPool(pc);
    try {
      pool.leaseConnection();
      pool.releaseConnection();
      // Lazy path suppressed; eager path drove the warm.
      expect(pool._lazyLoadPromise).toBeNull();
      expect(pool._eagerWarmPromise).not.toBeNull();
      await pool._eagerWarmPromise;
      expect(pool.schemaCache.isCached("sprockets")).toBe(true);
    } finally {
      SchemaReflection.lazilyLoadSchemaCache = prevLazy;
      SchemaReflection.eagerLoadSchemaCache = prevEager;
      await closePoolConnections(pool);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does not eagerly warm when the flag is off (default)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-no-eager-"));
    const dbFile = path.join(tmp, "no_eager.sqlite3");
    const seeded = new BetterSQLite3Adapter(dbFile);
    try {
      await seeded.executeMutation("CREATE TABLE sprockets (id INTEGER PRIMARY KEY)");
    } finally {
      await seeded.close();
    }
    expect(SchemaReflection.eagerLoadSchemaCache).toBe(false);

    const dbConfig = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: dbFile,
      reapingFrequency: null,
      schemaCachePath: "",
    });
    const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
      adapterFactory: () => new BetterSQLite3Adapter(dbFile),
    });
    const pool = new ConnectionPool(pc);
    try {
      pool.leaseConnection();
      pool.releaseConnection();
      expect(pool._eagerWarmPromise).toBeNull();
      expect(pool.schemaCache.isCached("sprockets")).toBe(false);
    } finally {
      await closePoolConnections(pool);
      // Explicit teardown for the raw-created `sprockets` table (also removed
      // with tmp below) to balance require-table-teardown.
      const cleanup = new BetterSQLite3Adapter(dbFile);
      await cleanup.executeMutation("DROP TABLE IF EXISTS sprockets");
      await cleanup.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("BoundSchemaReflection.dumpTo(filename) round-trips through the pool", async () => {
    // End-to-end Rails path: pool.schema_cache.dump_to(filename)
    // allocates a fresh SchemaCache, addAll(pool) populates it via
    // the pool's withConnection, dumpTo writes the JSON. Covers the
    // full chain Rails uses for db:schema:cache:dump.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-pool-schema-"));
    const dbFile = path.join(tmp, "pool.sqlite3");
    const seeded = new BetterSQLite3Adapter(dbFile);
    try {
      await seeded.executeMutation(
        "CREATE TABLE gizmos (id INTEGER PRIMARY KEY, label TEXT NOT NULL)",
      );
    } finally {
      await seeded.close();
    }

    const dbConfig = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: dbFile,
      reapingFrequency: null,
    });
    const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
      adapterFactory: () => new BetterSQLite3Adapter(dbFile),
    });
    const pool = new ConnectionPool(pc);
    try {
      const filename = path.join(tmp, "schema_cache.json");
      await pool.schemaCache.dumpTo(filename);
      const parsed = JSON.parse(fs.readFileSync(filename, "utf8")) as {
        columns: Record<string, unknown[]>;
      };
      expect(Object.keys(parsed.columns)).toContain("gizmos");
    } finally {
      await closePoolConnections(pool);
      // Explicit teardown for the raw-created `gizmos` table (also removed with
      // tmp below) to balance require-table-teardown.
      const cleanup = new BetterSQLite3Adapter(dbFile);
      await cleanup.executeMutation("DROP TABLE IF EXISTS gizmos");
      await cleanup.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("PoolConfig treats blank/empty schemaCachePath as presence-based 'no cache'", () => {
    // User explicitly setting schemaCachePath — even to '' or '   ' —
    // is a deliberate 'no cache' signal. Presence check ('in' +
    // != null) catches it before the defaultSchemaCachePath
    // fallback, trim + empty-check normalizes to null. Otherwise
    // '' would silently fall through to db/schema_cache.json,
    // defeating the user's intent.
    for (const blank of ["", "   "]) {
      const dbConfig = new HashConfig("test", "primary", {
        adapter: "sqlite3",
        database: "test.db",
        reapingFrequency: null,
        schemaCachePath: blank,
      });
      const pc = new PoolConfig(
        new ConnectionDescriptor("primary"),
        dbConfig,
        "writing",
        "default",
        { adapterFactory: newRawTestAdapter },
      );
      expect(
        (pc.schemaReflection as unknown as { _cachePath: string | null })._cachePath,
      ).toBeNull();
    }
  });

  it("PoolConfig aligns SchemaReflection path with DatabaseTasks.dbDir", async () => {
    // When DatabaseTasks.dbDir is customized, the default cache path
    // should follow — otherwise 'trails db schema:cache:dump' writes
    // to <dbDir>/schema_cache.json while the reflection loads from
    // db/schema_cache.json.
    const { DatabaseTasks } = await import("./tasks/database-tasks.js");
    const originalDbDir = DatabaseTasks.dbDir;
    DatabaseTasks.dbDir = "custom_db_dir";
    try {
      const dbConfig = new HashConfig("test", "primary", {
        adapter: "sqlite3",
        database: "test.db",
        reapingFrequency: null,
      });
      const pc = new PoolConfig(
        new ConnectionDescriptor("primary"),
        dbConfig,
        "writing",
        "default",
        { adapterFactory: newRawTestAdapter },
      );
      const cachePath = (pc.schemaReflection as unknown as { _cachePath: string | null })
        ._cachePath;
      expect(cachePath).toBe("custom_db_dir/schema_cache.json");
    } finally {
      DatabaseTasks.dbDir = originalDbDir;
    }
  });

  it("PoolConfig primes SchemaReflection with the config's schemaCachePath", () => {
    // Rails: `SchemaReflection.new(db_config.lazy_schema_cache_path)`.
    // HashConfig's lazySchemaCachePath returns the configured path
    // (or defaultSchemaCachePath fallback), which the reflection
    // remembers for its first on-disk load.
    const dbConfig = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: "test.db",
      reapingFrequency: null,
      schemaCachePath: "db/custom_cache.json",
    });
    const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
      adapterFactory: newRawTestAdapter,
    });
    const reflection = pc.schemaReflection;
    expect(reflection).toBeInstanceOf(SchemaReflection);
    // Internal state check: the cache path reached the reflection.
    // Reach in via a minimal cast — the field is private but the
    // Rails-parity contract is 'reflection remembers its cache path',
    // and this is the only way to assert it without exposing internals.
    expect((reflection as unknown as { _cachePath: string | null })._cachePath).toBe(
      "db/custom_cache.json",
    );
  });
});

describe("adapterNameFromConfig", () => {
  it("maps postgresql variants to postgres", () => {
    expect(adapterNameFromConfig("postgresql")).toBe("postgres");
    expect(adapterNameFromConfig("postgres")).toBe("postgres");
    expect(adapterNameFromConfig("pg")).toBe("postgres");
  });

  it("maps mysql variants to mysql", () => {
    expect(adapterNameFromConfig("mysql2")).toBe("mysql");
    expect(adapterNameFromConfig("mysql")).toBe("mysql");
    expect(adapterNameFromConfig("mariadb")).toBe("mysql");
  });

  it("maps sqlite variants to sqlite", () => {
    expect(adapterNameFromConfig("sqlite3")).toBe("sqlite");
    expect(adapterNameFromConfig("sqlite")).toBe("sqlite");
  });

  it("defaults unknown to sqlite", () => {
    expect(adapterNameFromConfig(undefined)).toBe("sqlite");
    expect(adapterNameFromConfig("unknown")).toBe("sqlite");
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
          const conn = pool.checkout();
          cacheA = (conn as unknown as { _queryCache: Store | null })._queryCache;
          pool.checkin(conn);
        }),
        withExecutionContext(async () => {
          const conn = pool.checkout();
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
        const conn = pool.checkout();
        cacheA = (conn as unknown as { _queryCache: Store | null })._queryCache;
        cacheA!.enabled = true;
        await cacheA!.computeIfAbsent(KEY, async () => [{ x: 1 }]);
        pool.checkin(conn);
      });

      await withExecutionContext(async () => {
        const conn = pool.checkout();
        cacheB = (conn as unknown as { _queryCache: Store | null })._queryCache;
        pool.checkin(conn);
      });

      expect(cacheA).not.toBe(cacheB);
      expect(cacheA!.get(KEY)).toBeDefined();
      expect(cacheB!.get(KEY)).toBeUndefined();
    });
  });

  describe("pin wiring", () => {
    it("pinConnectionBang increments _pinnedCount; unpinConnectionBang decrements it", async () => {
      const pool = makeTransactionAwarePool(1);

      const pinnedCount = () =>
        (pool as unknown as { _cacheConfig: { _pinnedCount: number } })._cacheConfig._pinnedCount;

      expect(pinnedCount()).toBe(0);

      await withExecutionContext(async () => {
        await pool.pinConnectionBang();
        expect(pinnedCount()).toBe(1);
        await pool.unpinConnectionBang();
        expect(pinnedCount()).toBe(0);
      });
    });

    it("two concurrent contexts each contribute to _pinnedCount independently", async () => {
      const pool = makeTransactionAwarePool(2);
      const pinnedCount = () =>
        (pool as unknown as { _cacheConfig: { _pinnedCount: number } })._cacheConfig._pinnedCount;

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
    });

    it("decrements _pinnedCount when beginTransaction throws", async () => {
      const pool = makeTransactionAwarePool(1);
      // Prime the pool with one idle connection so pinConnectionBang acquires it.
      const seed = pool.checkout();
      pool.checkin(seed);
      // Swap its transactionManager with one that throws on beginTransaction.
      (seed as unknown as { _transactionManager: unknown })._transactionManager = {
        beginTransaction: async () => {
          throw new Error("begin failed");
        },
        get currentTransaction() {
          return { open: false };
        },
        // The error-path checkin runs Rails' `:checkin :after enable_lazy_transactions!`
        // callback, which delegates here — a real transaction manager always has it.
        enableLazyTransactionsBang() {},
      };

      const pinnedCount = () =>
        (pool as unknown as { _cacheConfig: { _pinnedCount: number } })._cacheConfig._pinnedCount;

      await withExecutionContext(async () => {
        await expect(pool.pinConnectionBang()).rejects.toThrow("begin failed");
        expect(pinnedCount()).toBe(0);
      });
    });
  });

  describe("checkout/checkin cache attachment", () => {
    it("checkout attaches a Store; checkin clears it", () => {
      const pool = makePool(1);
      const conn = pool.checkout();
      const qc = (conn as unknown as { _queryCache: Store | null })._queryCache;
      expect(qc).toBeInstanceOf(Store);
      pool.checkin(conn);
      expect((conn as unknown as { _queryCache: Store | null })._queryCache).toBeNull();
    });

    it("checkoutAsync attaches a Store on the fast (idle) path", async () => {
      const pool = makePool(1);
      // Seed one idle connection so _tryAcquire fires.
      const seed = pool.checkout();
      pool.checkin(seed);

      await withExecutionContext(async () => {
        const conn = await pool.checkoutAsync();
        expect((conn as unknown as { _queryCache: Store | null })._queryCache).toBeInstanceOf(
          Store,
        );
        pool.checkin(conn);
      });
    });
  });

  describe("pool-level enable/disable propagation", () => {
    it("enableQueryCacheBang on the pool flips the checked-out connection's Store", () => {
      const pool = makePool(1);
      pool.enableQueryCacheBang();
      const conn = pool.checkout();
      const qc = (conn as unknown as { _queryCache: Store | null })._queryCache!;
      expect(qc.enabled).toBe(true);
      pool.disableQueryCacheBang();
      expect(qc.enabled).toBe(false);
      pool.checkin(conn);
    });

    it("withQueryCache enables for the duration of fn and clears on exit", async () => {
      const pool = makePool(1);
      let observed: Store | null = null;
      await pool.withQueryCache(async () => {
        const conn = pool.checkout();
        observed = (conn as unknown as { _queryCache: Store | null })._queryCache;
        expect(observed!.enabled).toBe(true);
        await observed!.computeIfAbsent("SELECT 1", async () => [{ x: 1 }]);
        expect(observed!.size).toBe(1);
        pool.checkin(conn);
      });
      expect(observed!.enabled).toBe(false);
      expect(observed!.size).toBe(0);
    });
  });

  describe("queryCacheMaxSize wiring", () => {
    it("threads dbConfig.queryCache through to the Store's max size", () => {
      const dbConfig = new HashConfig("test", "primary", {
        adapter: "sqlite3",
        database: "test.db",
        pool: 1,
        reapingFrequency: null,
        queryCache: 7,
      });
      const pc = new PoolConfig(
        new ConnectionDescriptor("primary"),
        dbConfig,
        "writing",
        "default",
        { adapterFactory: newRawTestAdapter },
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
        const conn = pool.checkout();
        pool.checkin(conn);
        seenSize = registry._caches.size;
      });
      expect(seenSize).toBeGreaterThan(0);
      expect(registry._caches.size).toBe(0);
    });
  });
});

describe("checkout/checkin callbacks", () => {
  it("pinned checkout calls verifyBang unconditionally and skips query-cache wiring", async () => {
    const pool = makeTransactionAwarePool(5);
    await pool.pinConnectionBang();
    const pinned = pool.checkout() as TransactionAwareTestAdapter;
    const spy = vi.spyOn(pinned, "verifyBang");
    try {
      const again = pool.checkout();
      expect(again).toBe(pinned);
      expect(spy).toHaveBeenCalledTimes(1);
      // Rails' pinned branch (connection_pool.rb:553-559) does not run
      // checkout_and_verify, so no Store is attached on the pinned path.
      expect((pinned as unknown as { _queryCache: Store | null })._queryCache).toBeNull();
    } finally {
      // Always unpin so an early assertion failure can't leak the pinned
      // connection into the rest of this file's run.
      await pool.unpinConnectionBang();
    }
  });

  it("checkin runs the registered :checkin :after callbacks (unset_query_cache!, enable_lazy_transactions!)", () => {
    const pool = makeTransactionAwarePool(1);
    const conn = pool.checkout() as TransactionAwareTestAdapter;
    expect((conn as unknown as { _queryCache: Store | null })._queryCache).toBeInstanceOf(Store);

    const lazySpy = vi.spyOn(conn, "enableLazyTransactionsBang");
    pool.checkin(conn);

    expect((conn as unknown as { _queryCache: Store | null })._queryCache).toBeNull();
    expect(lazySpy).toHaveBeenCalledTimes(1);
  });

  it("setCallback registers a custom :checkout callback that runs on checkout", () => {
    const calls: string[] = [];
    AbstractAdapter.setCallback("checkout", "after", function () {
      calls.push(this.adapterName);
    });
    try {
      const pool = makeTransactionAwarePool(1);
      pool.checkout();
      expect(calls).toEqual(["sqlite"]);
    } finally {
      // Drop the test-registered callback so it can't leak into sibling tests.
      (
        AbstractAdapter as unknown as {
          _connectionCallbacks: { checkout: unknown[] };
        }
      )._connectionCallbacks.checkout.pop();
    }
  });

  it("setCallback on a subclass clones the registry and does not leak onto AbstractAdapter", () => {
    class SubAdapter extends AbstractAdapter {}
    const before = (AbstractAdapter as unknown as { _connectionCallbacks: { checkout: unknown[] } })
      ._connectionCallbacks.checkout.length;

    SubAdapter.setCallback("checkout", "after", function () {});

    const sub = (SubAdapter as unknown as { _connectionCallbacks: { checkout: unknown[] } })
      ._connectionCallbacks;
    const base = (AbstractAdapter as unknown as { _connectionCallbacks: { checkout: unknown[] } })
      ._connectionCallbacks;
    // The subclass got its own copy; the base registry is untouched.
    expect(sub).not.toBe(base);
    expect(sub.checkout.length).toBe(before + 1);
    expect(base.checkout.length).toBe(before);
  });

  it("subclass without its own callback inherits AbstractAdapter's shared registry", () => {
    class SharedAdapter extends AbstractAdapter {}
    const sub = (SharedAdapter as unknown as { _connectionCallbacks: unknown })
      ._connectionCallbacks;
    const base = (AbstractAdapter as unknown as { _connectionCallbacks: unknown })
      ._connectionCallbacks;
    expect(sub).toBe(base);
  });
});
