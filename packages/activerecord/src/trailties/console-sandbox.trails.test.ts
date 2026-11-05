import { describe, expect, it } from "vitest";
import { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { ConnectionDescriptor } from "../connection-adapters/abstract/connection-handler.js";
import { PoolConfig } from "../connection-adapters/pool-config.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { rawTestAdapterConfiguration } from "../test-adapter.js";

function makePool(): ConnectionPool {
  const dbConfig = new HashConfig("test", "primary", {
    ...rawTestAdapterConfiguration(),
    pool: 1,
    reapingFrequency: null,
  });
  return new ConnectionPool(
    new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default"),
  );
}

describe("console_sandbox (trails)", () => {
  it("opens a non-joinable transaction on every checkout, so the console rolls back on exit", async () => {
    await import("./console-sandbox.js");
    const pool = makePool();
    try {
      const conn = await pool.checkout();
      expect(conn.isTransactionOpen()).toBe(true);
      expect(conn.currentTransaction().joinable).toBe(false);
    } finally {
      await pool.disconnectBang();
    }
  });
});
