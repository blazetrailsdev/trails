import { describe, it, expect } from "vitest";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool/queue.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { createTestAdapter } from "./test-adapter.js";

function makePool(size: number = 5): ConnectionPool {
  const config = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    pool: size,
  });
  return new ConnectionPool(config, { adapterFactory: createTestAdapter });
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
  expect(pool.busyCount).toBe(0);
  expect(pool.idleCount).toBe(1);

  const asyncResult = await pool.withConnection(async (conn) => {
    expect(conn).toBeTruthy();
    return "async-ok";
  });
  expect(asyncResult).toBe("async-ok");
  expect(pool.busyCount).toBe(0);

  await expect(
    pool.withConnection(async () => {
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  expect(pool.busyCount).toBe(0);
});

it.skip("new connection no query", () => {
  /* needs query tracking */
});

it("active connection in use", () => {
  const pool = makePool();
  expect(pool.activeConnection).toBe(false);
  const conn = pool.checkout();
  expect(pool.activeConnection).toBe(true);
  pool.checkin(conn);
  expect(pool.activeConnection).toBe(false);
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

it.skip("flush", () => {
  /* needs flush implementation */
});

it.skip("flush bang", () => {
  /* needs flush implementation */
});

it("remove connection", () => {
  const pool = makePool();
  const conn = pool.checkout();
  expect(pool.connectedCount).toBe(1);
  pool.removeConnection(conn);
  expect(pool.connectedCount).toBe(0);
});

it.skip("remove connection for thread", () => {
  /* needs thread tracking */
});

it("active connection?", () => {
  const pool = makePool();
  expect(pool.activeConnection).toBe(false);
  const conn = pool.checkout();
  expect(pool.activeConnection).toBe(true);
  pool.checkin(conn);
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
  const config = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
  });
  const pool = new ConnectionPool(config, {
    role: "reading",
    shard: "shard_one",
    adapterFactory: createTestAdapter,
  });
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
