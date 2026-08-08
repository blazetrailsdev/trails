import { describe, expect, it } from "vitest";

describe("PostgreSQLAdapter#checkVersion", () => {
  it("raises when the warmed version is too old", async () => {
    const { PostgreSQLAdapter } = await import("./postgresql-adapter.js");
    const adapter = Object.create(PostgreSQLAdapter.prototype) as InstanceType<
      typeof PostgreSQLAdapter
    >;
    (adapter as unknown as { _databaseVersion: number })._databaseVersion = 90_2_00;
    expect(() => adapter.checkVersion()).toThrow(
      "Your version of PostgreSQL (90200) is too old. Active Record supports PostgreSQL >= 9.3.",
    );
  });

  it("does not raise when the warmed version is supported", async () => {
    const { PostgreSQLAdapter } = await import("./postgresql-adapter.js");
    const adapter = Object.create(PostgreSQLAdapter.prototype) as InstanceType<
      typeof PostgreSQLAdapter
    >;
    (adapter as unknown as { _databaseVersion: number })._databaseVersion = 9_03_00;
    expect(() => adapter.checkVersion()).not.toThrow();
  });
});
