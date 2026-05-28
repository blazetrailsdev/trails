import { describe, it, expect } from "vitest";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { ConnectionDescriptor } from "./connection-adapters/abstract/connection-descriptor.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { newRawTestAdapter } from "./test-adapter.js";
import { ConnectionTimeoutError } from "./errors.js";

function establishConnection(poolSize: number, checkoutTimeout: number): ConnectionPool {
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    pool: poolSize,
    checkoutTimeout,
    reapingFrequency: null,
  });
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
    adapterFactory: newRawTestAdapter,
  });
  return new ConnectionPool(pc);
}

describe("PooledConnectionsTest", () => {
  // Mirrors Rails' checkout_checkin_connections — each thread checks out a
  // connection, then checks it back in. Rails joins each thread before
  // spawning the next, so the checkouts are effectively serialized; the JS
  // port runs the same sequence single-threaded.
  function checkoutCheckinConnections(
    poolSize: number,
    iterations: number,
  ): { pool: ConnectionPool; connectionCount: number; timedOut: number } {
    const pool = establishConnection(poolSize, 0.5);
    let connectionCount = 0;
    let timedOut = 0;
    for (let i = 0; i < iterations; i++) {
      try {
        const conn = pool.checkout();
        pool.checkin(conn);
        connectionCount += 1;
      } catch (err) {
        if (err instanceof ConnectionTimeoutError) timedOut += 1;
        else throw err;
      }
    }
    return { pool, connectionCount, timedOut };
  }

  function checkoutCheckinConnectionsLoop(
    poolSize: number,
    loops: number,
  ): { pool: ConnectionPool; connectionCount: number; timedOut: number } {
    const pool = establishConnection(poolSize, 0.5);
    let connectionCount = 0;
    let timedOut = 0;
    for (let i = 0; i < loops; i++) {
      try {
        const conn = pool.checkout();
        pool.checkin(conn);
        connectionCount += 1;
        // Rails calls `lease_connection.data_sources` here; the leasing side
        // effect — not the query — is what the test depends on: a held lease
        // keeps a second connection out of the pool so `connections` grows to
        // 2. We omit `data_sources` because exercising it would force an async
        // round-trip to a real DB, irrelevant to the pool-size assertion.
        pool.leaseConnection();
      } catch (err) {
        if (err instanceof ConnectionTimeoutError) timedOut += 1;
        else throw err;
      }
    }
    return { pool, connectionCount, timedOut };
  }

  it("pooled connection checkin one", () => {
    const { pool, connectionCount, timedOut } = checkoutCheckinConnections(1, 2);
    expect(connectionCount).toBe(2);
    expect(timedOut).toBe(0);
    expect(pool.connections.length).toBe(1);
  });

  it("pooled connection checkin two", () => {
    const { pool, connectionCount, timedOut } = checkoutCheckinConnectionsLoop(2, 3);
    expect(connectionCount).toBe(3);
    expect(timedOut).toBe(0);
    expect(pool.connections.length).toBe(2);
  });

  it("pooled connection remove", () => {
    const pool = establishConnection(2, 0.5);
    const oldConnection = pool.leaseConnection();
    const extraConnection = pool.checkout();
    pool.remove(extraConnection);
    expect(pool.leaseConnection()).toBe(oldConnection);
  });
});
