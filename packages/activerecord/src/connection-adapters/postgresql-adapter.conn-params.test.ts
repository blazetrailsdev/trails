/**
 * Mirrors Rails' PostgreSQLAdapter#initialize conn_params handling
 * (postgresql_adapter.rb:322-331): `@config.compact` followed by
 * `conn_params.slice!(*valid_conn_param_keys)`. The node-pg equivalent of
 * libpq's `PG::Connection.conndefaults_hash.keys` is the `pg.ClientConfig`
 * interface — see PostgreSQLAdapter.VALID_CONN_PARAM_KEYS.
 */
import { describe, expect, it } from "vitest";

import { PostgreSQLAdapter } from "./postgresql-adapter.js";

function clientOptions(config: Record<string, unknown>): Record<string, unknown> {
  const adapter = new PostgreSQLAdapter(config as never);
  return (adapter as unknown as { _pgClientOptions: Record<string, unknown> })._pgClientOptions;
}

describe("PostgreSQLAdapter conn_params", () => {
  it("forwards only valid pg connection params", () => {
    const options = clientOptions({
      adapter: "postgresql",
      database: "trails_test",
      host: "localhost",
      pool: 5,
      checkoutTimeout: 5,
      migrationsPaths: "db/migrate",
      hsot: "typo",
    });

    expect(options.database).toBe("trails_test");
    expect(options.host).toBe("localhost");
    expect(options).not.toHaveProperty("adapter");
    expect(options).not.toHaveProperty("pool");
    expect(options).not.toHaveProperty("checkoutTimeout");
    expect(options).not.toHaveProperty("migrationsPaths");
    expect(options).not.toHaveProperty("hsot");
  });

  it("forwards every driver-native param it is given", () => {
    const options = clientOptions({
      user: "alice",
      password: "s3cret",
      database: "trails_test",
      host: "localhost",
      port: 5432,
      application_name: "trails",
      connectionTimeoutMillis: 100,
      ssl: false,
    });

    expect(options).toMatchObject({
      user: "alice",
      password: "s3cret",
      database: "trails_test",
      host: "localhost",
      port: 5432,
      application_name: "trails",
      connectionTimeoutMillis: 100,
      ssl: false,
    });
  });

  it("drops undefined-valued params so pg applies its own defaults", () => {
    const options = clientOptions({
      database: "trails_test",
      password: undefined,
      host: null,
    });

    expect(options.database).toBe("trails_test");
    expect(options).not.toHaveProperty("password");
    expect(options).not.toHaveProperty("host");
  });

  it("maps username onto user before slicing", () => {
    const options = clientOptions({ username: "alice", database: "trails_test" });

    expect(options.user).toBe("alice");
    expect(options).not.toHaveProperty("username");
  });

  it("lets a truthy username overwrite an explicit user", () => {
    // Ruby truthiness: "" is truthy, so a blank username still overwrites.
    expect(clientOptions({ username: "alice", user: "bob" }).user).toBe("alice");
    expect(clientOptions({ username: "", user: "bob" }).user).toBe("");
    expect(clientOptions({ username: false, user: "bob" }).user).toBe("bob");
  });

  it("forwards driver params that @types/pg omits", () => {
    // pg/lib/connection-parameters.js:82,103 and pg/lib/client.js:75,86 read
    // these even though the published ClientConfig interface lacks them.
    const options = clientOptions({
      binary: true,
      replication: "database",
      enableChannelBinding: true,
    });

    expect(options).toMatchObject({
      binary: true,
      replication: "database",
      enableChannelBinding: true,
    });
  });

  it("keeps database rather than renaming it to dbname", () => {
    const options = clientOptions({ database: "trails_test" });

    expect(options.database).toBe("trails_test");
    expect(options).not.toHaveProperty("dbname");
  });
});
