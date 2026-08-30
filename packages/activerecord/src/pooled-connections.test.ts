import { describe, it, expect } from "vitest";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { ConnectionDescriptor } from "./connection-adapters/abstract/connection-handler.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { rawTestAdapterConfiguration } from "./test-adapter.js";
import { ConnectionTimeoutError } from "./errors.js";

function establishConnection(poolSize: number, checkoutTimeout: number): ConnectionPool {
  const dbConfig = new HashConfig("test", "primary", {
    ...rawTestAdapterConfiguration(),
    pool: poolSize,
    checkoutTimeout,
    reapingFrequency: null,
  });
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default");
  return new ConnectionPool(pc);
}

describe("PooledConnectionsTest", () => {
  async function checkoutCheckinConnections(
    poolSize: number,
    iterations: number,
  ): Promise<{ pool: ConnectionPool; connectionCount: number; timedOut: number }> {
    const pool = establishConnection(poolSize, 0.5);
    let connectionCount = 0;
    let timedOut = 0;
    for (let i = 0; i < iterations; i++) {
      try {
        const conn = await pool.checkout();
        pool.checkin(conn);
        connectionCount += 1;
      } catch (err) {
        if (err instanceof ConnectionTimeoutError) timedOut += 1;
        else throw err;
      }
    }
    return { pool, connectionCount, timedOut };
  }

  async function checkoutCheckinConnectionsLoop(
    poolSize: number,
    loops: number,
  ): Promise<{ pool: ConnectionPool; connectionCount: number; timedOut: number }> {
    const pool = establishConnection(poolSize, 0.5);
    let connectionCount = 0;
    let timedOut = 0;
    for (let i = 0; i < loops; i++) {
      try {
        const conn = await pool.checkout();
        pool.checkin(conn);
        connectionCount += 1;
        await pool.leaseConnection();
      } catch (err) {
        if (err instanceof ConnectionTimeoutError) timedOut += 1;
        else throw err;
      }
    }
    return { pool, connectionCount, timedOut };
  }

  it("pooled connection checkin one", async () => {
    const { pool, connectionCount, timedOut } = await checkoutCheckinConnections(1, 2);
    expect(connectionCount).toBe(2);
    expect(timedOut).toBe(0);
    expect(pool.connections.length).toBe(1);
  });

  it("pooled connection checkin two", async () => {
    const { pool, connectionCount, timedOut } = await checkoutCheckinConnectionsLoop(2, 3);
    expect(connectionCount).toBe(3);
    expect(timedOut).toBe(0);
    expect(pool.connections.length).toBe(2);
  });

  it("pooled connection remove", async () => {
    const pool = establishConnection(2, 0.5);
    const oldConnection = await pool.leaseConnection();
    const extraConnection = await pool.checkout();
    pool.remove(extraConnection);
    expect(await pool.leaseConnection()).toBe(oldConnection);
  });
});
