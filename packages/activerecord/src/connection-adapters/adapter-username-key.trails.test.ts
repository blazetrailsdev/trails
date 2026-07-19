/**
 * Rails' `database.yml` spells the credential `username`
 * (`database_configurations/hash_config.rb`), while the Node `mysql2` and `pg`
 * drivers read the driver-native `user` — and both IGNORE unknown keys. Unmapped,
 * a Rails-spelled config hash connects as the OS user instead of failing.
 *
 * For PostgreSQL this mirrors a real Rails translation
 * (`postgresql_adapter.rb:326`):
 *
 *     conn_params[:user] = conn_params.delete(:username) if conn_params[:username]
 *
 * so the precedence asserted here is Rails': a *truthy* `username` overwrites
 * `user` rather than deferring to it, and is always deleted from the hash.
 *
 * For MySQL there is no Rails counterpart — Ruby's mysql2 gem reads `:username`
 * natively, so Rails passes the hash through untouched. The mapping is a
 * deviation forced by the Node driver; it follows the PostgreSQL semantics
 * above so the two adapters agree.
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

const BASE = { host: "127.0.0.1", database: "d" };

describe.each([
  ["Mysql2Adapter", mysqlPoolConfig],
  ["PostgreSQLAdapter", pgClientOptions],
])("%s credential key", (_name, driverConfigFor) => {
  it("maps Rails' username onto the driver's user", () => {
    const driverConfig = driverConfigFor({ ...BASE, username: "rails" });
    expect(driverConfig.user).toBe("rails");
    expect(driverConfig).not.toHaveProperty("username");
  });

  it("passes an explicit user through untouched", () => {
    const driverConfig = driverConfigFor({ ...BASE, user: "driver" });
    expect(driverConfig.user).toBe("driver");
  });

  it("lets username overwrite an explicit user", () => {
    // Rails' `if conn_params[:username]` overwrites unconditionally — it does
    // not defer to a `user` already in the hash.
    const driverConfig = driverConfigFor({ ...BASE, username: "rails", user: "driver" });
    expect(driverConfig.user).toBe("rails");
    expect(driverConfig).not.toHaveProperty("username");
  });

  it("ignores a blank username, mirroring Rails' truthiness guard", () => {
    // `if conn_params[:username]` is falsy for "", so the key is left alone
    // and `user` survives.
    const driverConfig = driverConfigFor({ ...BASE, username: "", user: "driver" });
    expect(driverConfig.user).toBe("driver");
  });

  it("leaves user absent when neither key is given", () => {
    expect(driverConfigFor({ ...BASE })).not.toHaveProperty("user");
  });
});

describe("retained config", () => {
  // Rails maps `username` on the conn_params COPY and leaves `@config` alone
  // (postgresql_adapter.rb:322 `conn_params = @config.compact`), so
  // config-reading callers still see Rails' spelling. MySQLDatabaseTasks and
  // PostgreSQLDatabaseTasks both depend on this — they read `username` off the
  // config, not `user`.
  it.each([
    [
      "Mysql2Adapter",
      (c: Record<string, unknown>) => new Mysql2Adapter({ ...c, _fakeConnection: true } as never),
    ],
    ["PostgreSQLAdapter", (c: Record<string, unknown>) => new PostgreSQLAdapter(c as never)],
  ])("%s keeps username in the config the driver mapping read from", (_name, build) => {
    const adapter = build({ ...BASE, username: "rails" });
    const config = (adapter as unknown as { _config: Record<string, unknown> })._config;
    expect(config.username).toBe("rails");
  });
});
