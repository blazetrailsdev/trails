/**
 * Rails' `database.yml` spells the credential `username`
 * (`database_configurations/hash_config.rb`), but the `mysql2` and `pg` drivers
 * both read the driver-native `user` — and both IGNORE unknown keys. Before the
 * adapters mapped the key, a Rails-spelled config hash connected as the OS user
 * instead of failing, silently.
 *
 * These are trails-only guards: Rails has no such translation because the Ruby
 * drivers take `username` directly.
 */
import { describe, expect, it } from "vitest";

import { Mysql2Adapter } from "./mysql2-adapter.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

function mysqlPoolConfig(config: Record<string, unknown>): Record<string, unknown> {
  const adapter = new Mysql2Adapter({ ...config, _fakeConnection: true } as never);
  return (adapter as unknown as { _poolConfig: Record<string, unknown> })._poolConfig;
}

function pgClientOptions(config: Record<string, unknown>): Record<string, unknown> {
  const adapter = new PostgreSQLAdapter(config as never);
  return (adapter as unknown as { _pgClientOptions: Record<string, unknown> })._pgClientOptions;
}

describe("Mysql2Adapter credential key", () => {
  it("maps Rails' username onto the driver's user", () => {
    const poolConfig = mysqlPoolConfig({ host: "127.0.0.1", database: "d", username: "rails" });
    expect(poolConfig.user).toBe("rails");
    expect(poolConfig).not.toHaveProperty("username");
  });

  it("prefers an explicit user over username", () => {
    const poolConfig = mysqlPoolConfig({
      host: "127.0.0.1",
      database: "d",
      username: "rails",
      user: "driver",
    });
    expect(poolConfig.user).toBe("driver");
    expect(poolConfig).not.toHaveProperty("username");
  });

  it("leaves user absent when neither key is given", () => {
    const poolConfig = mysqlPoolConfig({ host: "127.0.0.1", database: "d" });
    expect(poolConfig).not.toHaveProperty("user");
  });
});

describe("PostgreSQLAdapter credential key", () => {
  it("maps Rails' username onto the driver's user", () => {
    const clientOptions = pgClientOptions({ host: "127.0.0.1", database: "d", username: "rails" });
    expect(clientOptions.user).toBe("rails");
    expect(clientOptions).not.toHaveProperty("username");
  });

  it("prefers an explicit user over username", () => {
    const clientOptions = pgClientOptions({
      host: "127.0.0.1",
      database: "d",
      username: "rails",
      user: "driver",
    });
    expect(clientOptions.user).toBe("driver");
    expect(clientOptions).not.toHaveProperty("username");
  });

  it("leaves user absent when neither key is given", () => {
    const clientOptions = pgClientOptions({ host: "127.0.0.1", database: "d" });
    expect(clientOptions).not.toHaveProperty("user");
  });
});
