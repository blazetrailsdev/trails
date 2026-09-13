import { describe, it, expect, beforeEach } from "vitest";
import { AbstractAdapter } from "./abstract-adapter.js";
import { ConnectionPool } from "./abstract/connection-pool.js";
import { PoolConfig } from "./pool-config.js";
import { ConnectionDescriptor } from "./abstract/connection-handler.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { ActiveRecordError } from "../errors.js";

function insertConnectionForTest(pool: ConnectionPool, conn: AbstractAdapter): void {
  (pool as unknown as { _connections: AbstractAdapter[] })._connections.push(conn);
  (pool as unknown as { _available: { add: (c: AbstractAdapter) => void } })._available.add(conn);
}

describe("AdapterLeasingTest", () => {
  let adapter: AbstractAdapter;

  beforeEach(() => {
    adapter = new AbstractAdapter({});
  });

  it("in use?", () => {
    expect(adapter.inUse).toBeFalsy();
    adapter.lease();
    expect(adapter.inUse).toBeTruthy();
  });

  it("lease twice", () => {
    adapter.lease();
    expect(() => adapter.lease()).toThrow(ActiveRecordError);
  });

  it("expire mutates in use", () => {
    adapter.lease();
    expect(adapter.inUse).toBeTruthy();
    adapter.expire();
    expect(adapter.inUse).toBeFalsy();
  });

  it("close", async () => {
    const dbConfig = new HashConfig("test", "primary", { adapter: "abstract" });
    const poolConfig = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig);
    const pool = new ConnectionPool(poolConfig);
    insertConnectionForTest(pool, adapter);
    adapter.pool = pool;

    expect(await pool.leaseConnection()).toBe(adapter);
    expect(adapter.inUse).toBeTruthy();

    await adapter.close();
    expect(adapter.inUse).toBeFalsy();

    expect(await pool.leaseConnection()).toBe(adapter);
  });
});
