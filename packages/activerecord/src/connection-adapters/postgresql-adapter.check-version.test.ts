import { describe, expect, it } from "vitest";

describe("PostgreSQLAdapter#checkVersion", () => {
  it("raises when the warmed version is too old", async () => {
    const { PostgreSQLAdapter } = await import("./postgresql-adapter.js");
    const { NullPool } = await import("./abstract/connection-pool.js");
    const adapter = Object.create(PostgreSQLAdapter.prototype) as InstanceType<
      typeof PostgreSQLAdapter
    >;
    adapter.pool = new NullPool();
    (adapter as unknown as { getDatabaseVersion: () => number }).getDatabaseVersion = () => 90_2_00;
    await expect(adapter.checkVersion()).rejects.toThrow(
      "Your version of PostgreSQL (90200) is too old. Active Record supports PostgreSQL >= 9.3.",
    );
  });

  it("does not raise when the warmed version is supported", async () => {
    const { PostgreSQLAdapter } = await import("./postgresql-adapter.js");
    const { NullPool } = await import("./abstract/connection-pool.js");
    const adapter = Object.create(PostgreSQLAdapter.prototype) as InstanceType<
      typeof PostgreSQLAdapter
    >;
    adapter.pool = new NullPool();
    (adapter as unknown as { getDatabaseVersion: () => number }).getDatabaseVersion = () => 9_03_00;
    await expect(adapter.checkVersion()).resolves.toBeUndefined();
  });
});
