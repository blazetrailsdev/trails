import { describe, it, expect, beforeEach } from "vitest";
import { AbstractAdapter } from "../../../lib/connection-adapters/abstract-adapter.js";
import { ConnectionPool } from "../../../lib/connection-adapters/abstract/connection-pool.js";
import { PoolConfig } from "../../../lib/connection-adapters/pool-config.js";
import { ConnectionDescriptor } from "../../../lib/connection-adapters/abstract/connection-handler.js";
import { HashConfig } from "../../../lib/database-configurations/hash-config.js";
import { ActiveRecordError } from "../../../lib/errors.js";

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
    expect(adapter.isInUse()).toBeFalsy();
    adapter.lease();
    expect(adapter.isInUse()).toBeTruthy();
  });

  it("lease twice", () => {
    adapter.lease();
    expect(() => adapter.lease()).toThrow(ActiveRecordError);
  });

  it("expire mutates in use", () => {
    adapter.lease();
    expect(adapter.isInUse()).toBeTruthy();
    adapter.expire();
    expect(adapter.isInUse()).toBeFalsy();
  });

  it("close", async () => {
    const dbConfig = new HashConfig("test", "primary", { adapter: "abstract" });
    const poolConfig = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig);
    const pool = new ConnectionPool(poolConfig);
    insertConnectionForTest(pool, adapter);
    adapter.pool = pool;

    expect(await pool.leaseConnection()).toBe(adapter);
    expect(adapter.isInUse()).toBeTruthy();

    await adapter.close();
    expect(adapter.isInUse()).toBeFalsy();

    expect(await pool.leaseConnection()).toBe(adapter);
  });
});
