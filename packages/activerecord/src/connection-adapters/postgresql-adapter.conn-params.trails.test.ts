import { describe, expect, it } from "vitest";

import { PostgreSQLAdapter } from "./postgresql-adapter.js";

function clientOptions(config: Record<string, unknown>): Record<string, unknown> {
  const adapter = new PostgreSQLAdapter(config as never);
  return (adapter as unknown as { _connectionParameters: Record<string, unknown> })
    ._connectionParameters;
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

    expect(options.dbname).toBe("trails_test");
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
      dbname: "trails_test",
      host: "localhost",
      port: 5432,
      applicationName: "trails",
      connectionTimeoutMillis: 100,
      ssl: false,
    });

    expect(options).toMatchObject({
      user: "alice",
      password: "s3cret",
      dbname: "trails_test",
      host: "localhost",
      port: 5432,
      applicationName: "trails",
      connectionTimeoutMillis: 100,
      ssl: false,
    });
  });

  it("drops nil-valued params, as conn_params is @config.compact", () => {
    const options = clientOptions({
      database: "trails_test",
      password: undefined,
      host: null,
    });

    expect(options.dbname).toBe("trails_test");
    expect(options).not.toHaveProperty("password");
    expect(options).not.toHaveProperty("host");
  });

  it("maps username onto user before slicing", () => {
    const options = clientOptions({ username: "alice", database: "trails_test" });

    expect(options.user).toBe("alice");
    expect(options).not.toHaveProperty("username");
  });

  it("lets a truthy username overwrite an explicit user", () => {
    expect(clientOptions({ username: "alice", user: "bob" }).user).toBe("alice");
    expect(clientOptions({ username: "", user: "bob" }).user).toBe("");
    expect(clientOptions({ username: false, user: "bob" }).user).toBe("bob");
  });

  it("forwards driver params that @types/pg omits", () => {
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

  it("renames database to dbname, as Rails maps its param names to PG's", () => {
    const options = clientOptions({ database: "trails_test" });

    expect(options.dbname).toBe("trails_test");
    expect(options).not.toHaveProperty("database");
  });

  describe("through buildAdapterArg (the connection-handling path)", () => {
    it("slices the residual database.yml hash the arg builder forwards", () => {
      const options = clientOptions({
        adapter: "postgresql",
        database: "trails_test",
        username: "alice",
        pool: 5,
        checkoutTimeout: 5,
        migrationsPaths: "db/migrate",
      });

      expect(options.user).toBe("alice");
      expect(options.dbname).toBe("trails_test");
      expect(options).not.toHaveProperty("adapter");
      expect(options).not.toHaveProperty("username");
      expect(options).not.toHaveProperty("pool");
      expect(options).not.toHaveProperty("checkoutTimeout");
      expect(options).not.toHaveProperty("migrationsPaths");
    });
  });
});
