import { describe, it, expect, vi } from "vitest";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { ConnectionDescriptor } from "./connection-adapters/abstract/connection-descriptor.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { SchemaReflection } from "./connection-adapters/schema-cache.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { createTestAdapter } from "./test-adapter.js";

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

it.skip("full pool blocks", () => {
  /* needs async waiting/blocking */
});

it.skip("full pool blocking shares load interlock", () => {
  /* needs thread interlock */
});

it.skip("removing releases latch", () => {
  /* needs async waiting */
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

it.skip("pin connection always returns the same connection", () => {
  /* needs pin connection */
});

it.skip("pin connection connected?", () => {
  /* needs pin connection */
});

it.skip("pin connection synchronize the connection", () => {
  /* needs pin connection */
});

it.skip("pin connection opens a transaction", () => {
  /* needs pin connection + transactions */
});

it.skip("unpin connection returns whether transaction has been rolledback", () => {
  /* needs pin connection + transactions */
});

it.skip("pin connection nesting", () => {
  /* needs pin connection */
});

it.skip("pin connection nesting lock", () => {
  /* needs pin connection + locking */
});

it.skip("pin connection nesting lock inverse", () => {
  /* needs pin connection + locking */
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
