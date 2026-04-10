import { describe, it, expect } from "vitest";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { ConnectionDescriptor } from "./connection-adapters/abstract/connection-descriptor.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { createTestAdapter } from "./test-adapter.js";

function makePool(size: number = 5): ConnectionPool {
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    pool: size,
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

it.skip("checkout after close", () => {
  /* needs pool close/shutdown semantics */
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

it.skip("reap and active", () => {
  /* needs reaper/idle timeout */
});

it.skip("reap inactive", () => {
  /* needs reaper/idle timeout */
});

it.skip("inactive are returned from dead thread", () => {
  /* needs thread tracking */
});

it.skip("idle timeout configuration", () => {
  /* needs reaper */
});

it.skip("disable flush", () => {
  /* needs flush implementation */
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

it.skip("automatic reconnect restores after disconnect", () => {
  /* needs reconnect logic */
});

it.skip("automatic reconnect can be disabled", () => {
  /* needs reconnect logic */
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

it.skip("sets pool schema reflection", () => {
  /* needs schema reflection */
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

it.skip("inspect does not show secrets", () => {
  /* needs custom inspect */
});
