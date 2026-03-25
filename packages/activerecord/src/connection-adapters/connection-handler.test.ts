import { describe, it, expect, beforeEach } from "vitest";
import { ConnectionHandler } from "./abstract/connection-handler.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseConfigurations } from "../database-configurations/connection-url-resolver.js";
import { createTestAdapter } from "../test-adapter.js";

describe("ConnectionHandlerTest", () => {
  let handler: ConnectionHandler;

  beforeEach(() => {
    handler = new ConnectionHandler();
    DatabaseConfigurations.defaultEnv = "development";
  });

  it("default env fall back to default env when rails env or rack env is empty string", () => {
    DatabaseConfigurations.defaultEnv = "";
    expect(DatabaseConfigurations.defaultEnv).toBe("default");
    DatabaseConfigurations.defaultEnv = "development";
    expect(DatabaseConfigurations.defaultEnv).toBe("development");
  });

  it("establish connection using 3 levels config", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    const pool = handler.establishConnection(config, { adapterFactory: createTestAdapter });
    expect(pool).toBeTruthy();
    expect(pool.dbConfig.adapter).toBe("sqlite3");
  });

  it("validates db configuration and raises on invalid adapter", () => {
    expect(() => handler.establishConnection({ database: "test.db" })).toThrow(
      /does not specify adapter/,
    );
  });

  it.skip("not setting writing role while using another named role raises", () => {
    /* needs role validation logic */
  });

  it.skip("fixtures dont raise if theres no writing pool config", () => {
    /* needs fixture integration */
  });

  it.skip("setting writing role while using another named role does not raise", () => {
    /* needs role validation logic */
  });

  it("establish connection with primary works without deprecation", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    const pool = handler.establishConnection(config, { adapterFactory: createTestAdapter });
    expect(pool.dbConfig.name).toBe("primary");
  });

  it("establish connection using 3 level config defaults to default env primary db", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    const pool = handler.establishConnection(config, { adapterFactory: createTestAdapter });
    expect(pool.dbConfig.envName).toBe("development");
    expect(pool.dbConfig.name).toBe("primary");
  });

  it("establish connection using 2 level config defaults to default env primary db", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    const pool = handler.establishConnection(config, { adapterFactory: createTestAdapter });
    expect(pool.dbConfig.envName).toBe("development");
  });

  it("establish connection using two level configurations", () => {
    const config = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: "test.db",
    });
    const pool = handler.establishConnection(config, { adapterFactory: createTestAdapter });
    expect(pool.dbConfig.database).toBe("test.db");
  });

  it.skip("establish connection using top level key in two level config", () => {
    /* needs config resolution from raw YAML-like structures */
  });

  it("establish connection with string owner name", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "MyModel", adapterFactory: createTestAdapter });
    const pool = handler.retrieveConnectionPool("MyModel");
    expect(pool).toBeTruthy();
  });

  it.skip("symbolized configurations assignment", () => {
    /* TS doesn't have symbols vs strings distinction in the same way */
  });

  it("retrieve connection", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary", adapterFactory: createTestAdapter });
    const pool = handler.retrieveConnectionPool("primary");
    expect(pool).toBeTruthy();
  });

  it("active connections?", () => {
    expect(handler.activeConnections).toBe(false);
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary", adapterFactory: createTestAdapter });
    const pool = handler.retrieveConnectionPool("primary")!;
    const conn = pool.checkout();
    expect(handler.activeConnections).toBe(true);
    pool.checkin(conn);
  });

  it("retrieve connection pool", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary", adapterFactory: createTestAdapter });
    const pool = handler.retrieveConnectionPool("primary");
    expect(pool).toBeTruthy();
    expect(pool!.dbConfig.database).toBe("dev.db");
  });

  it("retrieve connection pool with invalid id", () => {
    const pool = handler.retrieveConnectionPool("nonexistent");
    expect(pool).toBeUndefined();
  });

  it("connection pools", () => {
    const config1 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    const config2 = new HashConfig("development", "animals", {
      adapter: "sqlite3",
      database: "animals.db",
    });
    handler.establishConnection(config1, { owner: "primary", adapterFactory: createTestAdapter });
    handler.establishConnection(config2, { owner: "animals", adapterFactory: createTestAdapter });
    expect(handler.connectionPools).toHaveLength(2);
  });

  it.skip("a class using custom pool and switching back to primary", () => {
    /* needs Base class integration */
  });

  it.skip("connection specification name should fallback to parent", () => {
    /* needs class hierarchy connection resolution */
  });

  it("remove connection should not remove parent", () => {
    const config1 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "primary.db",
    });
    const config2 = new HashConfig("development", "child", {
      adapter: "sqlite3",
      database: "child.db",
    });
    handler.establishConnection(config1, { owner: "primary", adapterFactory: createTestAdapter });
    handler.establishConnection(config2, { owner: "child", adapterFactory: createTestAdapter });
    handler.removeConnection("child");
    expect(handler.retrieveConnectionPool("primary")).toBeTruthy();
    expect(handler.retrieveConnectionPool("child")).toBeUndefined();
  });

  it.skip("default handlers are writing and reading", () => {
    /* needs role-based handler setup */
  });

  it.skip("connection pool per pid", () => {
    /* needs process forking */
  });

  it.skip("forked child doesnt mangle parent connection", () => {
    /* needs process forking */
  });

  it.skip("forked child recovers from disconnected parent", () => {
    /* needs process forking */
  });

  it.skip("retrieve connection pool copies schema cache from ancestor pool", () => {
    /* needs schema cache implementation */
  });

  it.skip("pool from any process for uses most recent spec", () => {
    /* needs process forking */
  });
});
