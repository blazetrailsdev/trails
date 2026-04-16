import { describe, it, expect, vi } from "vitest";
import {
  ConnectionPool,
  withExecutionContext,
} from "./connection-adapters/abstract/connection-pool.js";
import { ConnectionDescriptor } from "./connection-adapters/abstract/connection-descriptor.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { SchemaReflection, BoundSchemaReflection } from "./connection-adapters/schema-cache.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { createTestAdapter } from "./test-adapter.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
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
    adapterFactory: createTestAdapter,
  });
  return new ConnectionPool(pc);
}

class TransactionAwareTestAdapter extends AbstractAdapter implements DatabaseAdapter {
  override get adapterName() {
    return "TestTransactionAdapter";
  }
  readonly inTransaction = false;

  async execute(_sql: string, _binds?: unknown[]): Promise<Record<string, unknown>[]> {
    return [];
  }
  async executeMutation(_sql: string, _binds?: unknown[]): Promise<number> {
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

describe("ConnectionPoolThreadTest", () => {
  it.skip("lock thread allow fiber reentrency", () => {
    /* needs fiber/thread emulation */
  });
});

it("checkout after close", () => {
  const pool = makePool();
  const conn = pool.leaseConnection();
  expect(conn).toBeTruthy();
  pool.releaseConnection();

  pool.disconnectBang();

  // After disconnect, leaseConnection creates a fresh connection
  const conn2 = pool.leaseConnection();
  expect(conn2).toBeTruthy();
  expect(conn2).not.toBe(conn);
  pool.releaseConnection();
});

it.skip("released connection moves between threads", () => {
  /* needs thread emulation */
});

it("with connection", async () => {
  const pool = makePool();
  const result = pool.withConnection((conn) => {
    expect(conn).toBeTruthy();
    return "ok";
  });
  expect(result).toBe("ok");
  expect(pool.stat().busy).toBe(0);
  expect(pool.stat().idle).toBe(1);

  const asyncResult = await pool.withConnection(async (conn) => {
    expect(conn).toBeTruthy();
    return "async-ok";
  });
  expect(asyncResult).toBe("async-ok");
  expect(pool.stat().busy).toBe(0);

  await expect(
    pool.withConnection(async () => {
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  expect(pool.stat().busy).toBe(0);
});

it("with connection prevent permanent checkout releases connection", () => {
  const pool = makePool();
  pool.leaseConnection();
  expect(pool.activeConnection).toBeTruthy();
  pool.withConnection(
    (conn) => {
      expect(conn).toBeTruthy();
    },
    { preventPermanentCheckout: true },
  );
  // sticky was restored so connection is still leased
  expect(pool.activeConnection).toBeTruthy();
  pool.releaseConnection();
});

it("with connection prevent permanent checkout on fresh lease releases", () => {
  const pool = makePool();
  pool.withConnection(
    (conn) => {
      expect(conn).toBeTruthy();
    },
    { preventPermanentCheckout: true },
  );
  // No prior sticky lease, so connection should be released
  expect(pool.activeConnection).toBeNull();
});

it.skip("new connection no query", () => {
  /* needs query tracking */
});

it("active connection in use", () => {
  const pool = makePool();
  expect(pool.activeConnection).toBeNull();
  const conn = pool.leaseConnection();
  expect(pool.activeConnection).toBe(conn);
  pool.releaseConnection();
  expect(pool.activeConnection).toBeNull();
});

it("full pool exception", () => {
  const pool = makePool(1);
  pool.checkout();
  expect(() => pool.checkout()).toThrow(/Could not obtain a connection/);
});

it("full pool async checkout timeout", async () => {
  const pool = makePool(1);
  pool.checkout();
  await expect(pool.checkoutAsync(0.05)).rejects.toThrow(/could not obtain a connection/);
});

it("full pool blocks", async () => {
  const pool = makePool(1);
  const conn = pool.checkout();
  const promise = pool.checkoutAsync(1);
  pool.checkin(conn);
  const conn2 = await promise;
  expect(conn2).toBe(conn);
  pool.checkin(conn2);
});

it.skip("full pool blocking shares load interlock", () => {
  /* needs thread interlock */
});

it("removing releases latch", async () => {
  const pool = makePool(1);
  const conn = pool.checkout();
  const promise = pool.checkoutAsync(1);
  pool.remove(conn);
  const conn2 = await promise;
  expect(conn2).not.toBe(conn);
  pool.checkin(conn2);
});

it("reap and active", () => {
  const pool = makePool();
  pool.checkout();
  pool.checkout();
  pool.checkout();
  const count = pool.connections.length;
  pool.reap();
  // In single-threaded JS, no connections have dead owners, so reap is a no-op
  expect(pool.connections.length).toBe(count);
  pool.disconnect();
});

it.skip("reap inactive", () => {
  /* needs reaper/idle timeout */
});

it.skip("inactive are returned from dead thread", () => {
  /* needs thread tracking */
});

it("idle timeout configuration", () => {
  // High idleTimeout: flush() with no args keeps connections
  const keepConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    idleTimeout: 9999,
    reapingFrequency: null,
  });
  const keepPc = new PoolConfig(
    new ConnectionDescriptor("primary"),
    keepConfig,
    "writing",
    "default",
    { adapterFactory: createTestAdapter },
  );
  const keepPool = new ConnectionPool(keepPc);
  const keepConn = keepPool.checkout();
  keepPool.checkin(keepConn);
  expect(keepPool.stat().connections).toBe(1);
  keepPool.flush();
  expect(keepPool.stat().connections).toBe(1);

  // Small idleTimeout: flush() with no args removes expired idle connections
  const flushConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    idleTimeout: 1,
    reapingFrequency: null,
  });
  const flushPc = new PoolConfig(
    new ConnectionDescriptor("primary"),
    flushConfig,
    "writing",
    "default",
    { adapterFactory: createTestAdapter },
  );
  const flushPool = new ConnectionPool(flushPc);
  vi.useFakeTimers();
  try {
    const flushConn = flushPool.checkout();
    flushPool.checkin(flushConn);
    expect(flushPool.stat().connections).toBe(1);
    // Not yet expired
    flushPool.flush();
    expect(flushPool.stat().connections).toBe(1);
    // Advance past the 1-second idleTimeout
    vi.advanceTimersByTime(2000);
    flushPool.flush();
    expect(flushPool.stat().connections).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("disable flush", () => {
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    idleTimeout: null,
    reapingFrequency: null,
  });
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
    adapterFactory: createTestAdapter,
  });
  const pool = new ConnectionPool(pc);
  const conn = pool.checkout();
  pool.checkin(conn);
  // flush is a no-op when idleTimeout is null
  pool.flush();
  expect(pool.stat().connections).toBe(1);
});

it("flush", () => {
  const pool = makePool(5);
  const conn = pool.checkout();
  pool.checkin(conn);
  expect(pool.stat().connections).toBe(1);
  expect(pool.stat().idle).toBe(1);
  // Flush with high idle threshold — nothing removed
  pool.flush(9999);
  expect(pool.stat().connections).toBe(1);
  // Flush with 0 threshold — removes all idle
  pool.flush(0);
  expect(pool.stat().connections).toBe(0);
});

it("flush bang", () => {
  const pool = makePool(5);
  const c1 = pool.checkout();
  const c2 = pool.checkout();
  pool.checkin(c1);
  pool.checkin(c2);
  expect(pool.stat().idle).toBe(2);
  pool.flushBang();
  expect(pool.stat().connections).toBe(0);
  expect(pool.stat().idle).toBe(0);
});

it("remove connection", () => {
  const pool = makePool();
  const conn = pool.checkout();
  expect(pool.stat().connections).toBe(1);
  pool.remove(conn);
  expect(pool.stat().connections).toBe(0);
});

it.skip("remove connection for thread", () => {
  /* needs thread tracking */
});

it("active connection?", () => {
  const pool = makePool();
  expect(pool.activeConnection).toBeNull();
  const conn = pool.leaseConnection();
  expect(pool.activeConnection).toBe(conn);
  pool.releaseConnection();
});

it("checkout behavior", () => {
  const pool = makePool(2);
  const c1 = pool.checkout();
  const c2 = pool.checkout();
  expect(c1).not.toBe(c2);
  pool.checkin(c1);
  pool.checkin(c2);
});

it("checkout order is lifo", () => {
  const pool = makePool(2);
  const c1 = pool.checkout();
  const c2 = pool.checkout();
  pool.checkin(c1);
  pool.checkin(c2);
  const c3 = pool.checkout();
  expect(c3).toBe(c2);
});

it.skip("checkout fairness", () => {
  /* needs thread fairness */
});

it.skip("checkout fairness by group", () => {
  /* needs thread fairness */
});

it("automatic reconnect restores after disconnect", () => {
  const pool = makePool();
  expect(pool.automaticReconnect).toBe(true);
  expect(pool.leaseConnection()).toBeTruthy();
  pool.releaseConnection();

  pool.disconnectBang();
  // With automaticReconnect=true (default), new connections are created
  expect(pool.leaseConnection()).toBeTruthy();
  pool.releaseConnection();
});

it("automatic reconnect can be disabled", () => {
  const pool = makePool();
  pool.disconnectBang();
  pool.automaticReconnect = false;

  expect(() => pool.leaseConnection()).toThrow(/automatic_reconnect is disabled/);
  expect(() => pool.withConnection(() => {})).toThrow(/automatic_reconnect is disabled/);
});

it.skip("pool sets connection visitor", () => {
  /* needs visitor pattern */
});

it.skip("anonymous class exception", () => {
  /* needs class-based pool resolution */
});

it.skip("connection notification is called", () => {
  /* needs instrumentation/notifications */
});

it.skip("connection notification is called for shard", () => {
  /* needs instrumentation/notifications */
});

it("sets pool schema reflection", () => {
  const pool = makePool();
  const original = pool.schemaReflection;
  expect(original).toBeTruthy();

  const newReflection = new SchemaReflection(null);
  pool.schemaReflection = newReflection;
  expect(pool.schemaReflection).toBe(newReflection);
  expect(pool.schemaReflection).not.toBe(original);
});

it.skip("pool sets connection schema cache", () => {
  /* needs schema cache */
});

it.skip("concurrent connection establishment", () => {
  /* needs concurrency */
});

it.skip("non bang disconnect and clear reloadable connections throw exception if threads dont return their conns", () => {
  /* needs thread tracking */
});

it.skip("disconnect and clear reloadable connections attempt to wait for threads to return their conns", () => {
  /* needs thread tracking */
});

it.skip("bang versions of disconnect and clear reloadable connections if unable to acquire all connections proceed anyway", () => {
  /* needs thread tracking */
});

it.skip("disconnect and clear reloadable connections are able to preempt other waiting threads", () => {
  /* needs thread tracking */
});

it.skip("clear reloadable connections creates new connections for waiting threads if necessary", () => {
  /* needs thread tracking */
});

it("connection pool stat", () => {
  const pool = makePool(5);
  const conn = pool.checkout();
  const stat = pool.stat();
  expect(stat.size).toBe(5);
  expect(stat.connections).toBe(1);
  expect(stat.busy).toBe(1);
  expect(stat.idle).toBe(0);
  pool.checkin(conn);
});

it.skip("public connections access threadsafe", () => {
  /* needs thread safety */
});

it("role and shard is returned", () => {
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    reapingFrequency: null,
  });
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "reading", "shard_one", {
    adapterFactory: createTestAdapter,
  });
  const pool = new ConnectionPool(pc);
  expect(pool.role).toBe("reading");
  expect(pool.shard).toBe("shard_one");
});

it("pin connection always returns the same connection", async () => {
  const pool = makeTransactionAwarePool(5);
  await pool.pinConnectionBang();
  const conn1 = pool.checkout();
  const conn2 = pool.checkout();
  expect(conn1).toBe(conn2);
  await pool.unpinConnectionBang();
});

it("pin connection connected?", async () => {
  const pool = makeTransactionAwarePool(5);
  await pool.pinConnectionBang();
  expect(pool.isConnected()).toBe(true);
  await pool.unpinConnectionBang();
});

it.skip("pin connection synchronize the connection", () => {
  /* needs thread synchronization */
});

it("pin connection opens a transaction", async () => {
  const pool = makeTransactionAwarePool(5);
  await pool.pinConnectionBang();
  const conn = pool.checkout() as TransactionAwareTestAdapter;
  expect(conn.transactionManager.openTransactions).toBe(1);
  expect(conn.transactionManager.currentTransaction.open).toBe(true);
  expect(conn.transactionManager.currentTransaction.joinable).toBe(false);
  await pool.unpinConnectionBang();
});

it("unpin connection returns whether transaction has been rolledback", async () => {
  const pool = makeTransactionAwarePool(5);

  // Clean unpin — transaction is still open, rollback happens → clean = true
  await pool.pinConnectionBang();
  const clean = await pool.unpinConnectionBang();
  expect(clean).toBe(true);

  // Dirty unpin — manually commit the transaction before unpin
  await pool.pinConnectionBang();
  const conn = pool.checkout() as TransactionAwareTestAdapter;
  await conn.transactionManager.commitTransaction();
  const dirty = await pool.unpinConnectionBang();
  expect(dirty).toBe(false);
});

it("pin connection nesting", async () => {
  const pool = makeTransactionAwarePool(5);
  await pool.pinConnectionBang();
  const conn1 = pool.checkout() as TransactionAwareTestAdapter;
  expect(conn1.transactionManager.openTransactions).toBe(1);
  expect(conn1.transactionManager.currentTransaction.joinable).toBe(false);

  // Nested pin opens a second transaction (savepoint-level in Rails)
  await pool.pinConnectionBang();
  const conn2 = pool.checkout();
  expect(conn1).toBe(conn2);
  expect(conn1.transactionManager.openTransactions).toBe(2);

  // First unpin rolls back the inner transaction but keeps connection pinned
  await pool.unpinConnectionBang();
  expect(conn1.transactionManager.openTransactions).toBe(1);
  expect(conn1.transactionManager.currentTransaction.open).toBe(true);
  const conn3 = pool.checkout();
  expect(conn3).toBe(conn1);

  // Second unpin rolls back the outer transaction and checks in
  await pool.unpinConnectionBang();
  expect(conn1.transactionManager.openTransactions).toBe(0);
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
      pool.checkin(ctx2Conn!);
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

it.skip("pin connection nesting lock", () => {
  /* needs thread locking */
});

it.skip("pin connection nesting lock inverse", () => {
  /* needs thread locking */
});

it("inspect does not show secrets", () => {
  const pool = makePool();
  const str = pool.inspect();
  expect(str).toMatch(/ConnectionPool/);
  expect(str).toMatch(/env_name="test"/);
  expect(str).toMatch(/role="writing"/);
  expect(str).not.toMatch(/password/);
  expect(str).not.toMatch(/sqlite3/);

  // With non-default shard
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    reapingFrequency: null,
    database: "test.db",
  });
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "reading", "shard_one", {
    adapterFactory: createTestAdapter,
  });
  const pool2 = new ConnectionPool(pc);
  expect(pool2.inspect()).toMatch(/shard="shard_one"/);
  expect(pool2.inspect()).toMatch(/role="reading"/);
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
    // Uses SQLite3Adapter (not createTestAdapter) because the latter
    // is a DatabaseStatementsMixin stub without the AbstractAdapter
    // schemaCache getter.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { SchemaCache } = await import("./connection-adapters/schema-cache.js");
    const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-raw-cache-"));
    const dbFile = path.join(tmp, "raw.sqlite3");
    const dbConfig = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: dbFile,
      reapingFrequency: null,
    });
    const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
      adapterFactory: () => new SQLite3Adapter(dbFile),
    });
    const pool = new ConnectionPool(pc);
    try {
      const cache = pool.withConnection(
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
    const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");

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
      adapterFactory: () => new SQLite3Adapter(dbFile),
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
    const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");

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
      adapterFactory: () => new SQLite3Adapter(dbFile),
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
    const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");

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
      adapterFactory: () => new SQLite3Adapter(dbFile),
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

  it("BoundSchemaReflection.dumpTo(filename) round-trips through the pool", async () => {
    // End-to-end Rails path: pool.schema_cache.dump_to(filename)
    // allocates a fresh SchemaCache, addAll(pool) populates it via
    // the pool's withConnection, dumpTo writes the JSON. Covers the
    // full chain Rails uses for db:schema:cache:dump.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-pool-schema-"));
    const dbFile = path.join(tmp, "pool.sqlite3");
    const seeded = new SQLite3Adapter(dbFile);
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
      adapterFactory: () => new SQLite3Adapter(dbFile),
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
        { adapterFactory: createTestAdapter },
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
        { adapterFactory: createTestAdapter },
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
      adapterFactory: createTestAdapter,
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
