import { describe, it, expect, beforeEach } from "vitest";
import { AbstractAdapter } from "./abstract-adapter.js";
import { ConnectionPool } from "./abstract/connection-pool.js";
import { PoolConfig } from "./pool-config.js";
import { ConnectionDescriptor } from "./abstract/connection-descriptor.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { ActiveRecordError } from "../errors.js";

// Mirrors Rails' AdapterLeasingTest::Pool, which adds a connection to the pool
// without going through checkout so the leasing API can be exercised directly.
function insertConnectionForTest(pool: ConnectionPool, conn: AbstractAdapter): void {
  (pool as unknown as { _connections: AbstractAdapter[] })._connections.push(conn);
  (pool as unknown as { _available: { add: (c: AbstractAdapter) => void } })._available.add(conn);
}

describe("AdapterLeasingTest", () => {
  let adapter: AbstractAdapter;

  beforeEach(() => {
    adapter = new AbstractAdapter();
  });

  it("in use?", () => {
    expect(adapter.inUse).toBe(false);
    adapter.lease();
    expect(adapter.inUse).toBe(true);
  });

  it("lease twice", () => {
    adapter.lease();
    expect(() => adapter.lease()).toThrow(ActiveRecordError);
  });

  it("expire mutates in use", () => {
    adapter.lease();
    expect(adapter.inUse).toBe(true);
    adapter.expire();
    expect(adapter.inUse).toBe(false);
  });

  it("close", () => {
    const dbConfig = new HashConfig("test", "primary", { adapter: "abstract" });
    const poolConfig = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig);
    const pool = new ConnectionPool(poolConfig);
    insertConnectionForTest(pool, adapter);
    adapter.pool = pool;

    // Make sure the pool marks the connection in use
    expect(pool.leaseConnection()).toBe(adapter);
    expect(adapter.inUse).toBe(true);

    // Close should put the adapter back in the pool
    adapter.close();
    expect(adapter.inUse).toBe(false);

    expect(pool.leaseConnection()).toBe(adapter);
  });
});
