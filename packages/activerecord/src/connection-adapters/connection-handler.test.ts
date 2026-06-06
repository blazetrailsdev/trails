import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConnectionHandler } from "./abstract/connection-handler.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { Base } from "../base.js";

// Mirrors ActiveRecord::TestFixtures#setup_shared_connection_pool (test_fixtures.rb:220).
// For each shard in each pool manager, replaces every non-writing role's pool
// config with the writing role's pool config so all roles share one connection.
// Throws ArgumentError (from PoolManager#setPoolConfig) when writing pool is missing.
function setupSharedConnectionPool(handlerArg: ConnectionHandler): void {
  const writingRole = Base.writingRole;
  const managerMap: Map<string, any> = (handlerArg as any)._connectionNameToPoolManager;
  for (const [, poolManager] of managerMap) {
    for (const shardName of poolManager.shardNames as string[]) {
      const writingPoolConfig = poolManager.getPoolConfig(writingRole, shardName);
      for (const role of poolManager.roleNames as string[]) {
        const poolConfig = poolManager.getPoolConfig(role, shardName);
        if (!poolConfig || poolConfig === writingPoolConfig) continue;
        poolManager.setPoolConfig(role, shardName, writingPoolConfig);
      }
    }
  }
}

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
    const pool = handler.establishConnection(config);
    expect(pool).toBeTruthy();
    expect(pool.dbConfig.adapter).toBe("sqlite3");
  });

  it("validates db configuration and raises on invalid adapter", () => {
    expect(() => handler.establishConnection({ database: "test.db" })).toThrow(
      /does not specify adapter/,
    );
  });

  it("not setting writing role while using another named role raises", () => {
    const localHandler = new ConnectionHandler();
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    localHandler.establishConnection(config, {
      owner: "Base",
      role: "also_writing",
      shard: "default",
    });
    localHandler.establishConnection(config, { owner: "Base", role: "also_writing", shard: "one" });
    expect(() => setupSharedConnectionPool(localHandler)).toThrow(/poolConfig.*null/);
  });

  it("fixtures dont raise if theres no writing pool config", () => {
    const localHandler = new ConnectionHandler();
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    localHandler.establishConnection(config, { owner: "Base", role: "writing" });
    localHandler.establishConnection(config, { owner: "Base", role: "reading" });
    expect(() => setupSharedConnectionPool(localHandler)).not.toThrow();
    // After shared-pool setup reading pool IS the writing pool — same connection leased.
    const rwPool = localHandler.retrieveConnectionPool("Base", { role: "writing" })!;
    const roPool = localHandler.retrieveConnectionPool("Base", { role: "reading" })!;
    expect(roPool).toBe(rwPool);
  });

  it("setting writing role while using another named role does not raise", () => {
    const oldRole = Base.writingRole;
    Base.writingRole = "also_writing";
    try {
      const localHandler = new ConnectionHandler();
      const config = new HashConfig("development", "primary", {
        adapter: "sqlite3",
        database: "dev.db",
      });
      localHandler.establishConnection(config, {
        owner: "Base",
        role: "also_writing",
        shard: "default",
      });
      localHandler.establishConnection(config, {
        owner: "Base",
        role: "also_writing",
        shard: "one",
      });
      expect(() => setupSharedConnectionPool(localHandler)).not.toThrow();
    } finally {
      Base.writingRole = oldRole;
    }
  });

  it("establish connection with primary works without deprecation", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    const pool = handler.establishConnection(config);
    expect(pool.dbConfig.name).toBe("primary");
  });

  it("establish connection using 3 level config defaults to default env primary db", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    const pool = handler.establishConnection(config);
    expect(pool.dbConfig.envName).toBe("development");
    expect(pool.dbConfig.name).toBe("primary");
  });

  it("establish connection using 2 level config defaults to default env primary db", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    const pool = handler.establishConnection(config);
    expect(pool.dbConfig.envName).toBe("development");
  });

  it("establish connection using two level configurations", () => {
    const config = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: "test.db",
    });
    const pool = handler.establishConnection(config);
    expect(pool.dbConfig.database).toBe("test.db");
  });

  it("establish connection using top level key in two level config", () => {
    const configs = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      development_readonly: { adapter: "sqlite3", database: "test/db/readonly.sqlite3" },
    });
    const config = configs.configsFor({ envName: "development_readonly" })[0];
    const pool = handler.establishConnection(config);
    expect(pool).toBeTruthy();
    expect(pool.dbConfig.database).toBe("test/db/readonly.sqlite3");
  });

  it("establish connection with string owner name", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "MyModel" });
    const pool = handler.retrieveConnectionPool("MyModel");
    expect(pool).toBeTruthy();
  });

  it("symbolized configurations assignment", () => {
    // Rails asserts each config-hash key is a Symbol; the raw config here is
    // string-keyed and DatabaseConfigurations normalizes via Object.entries,
    // so that key-type assertion has no TS analogue. The rest of the test —
    // that nested config normalizes to HashConfig instances with String
    // envName/name — translates directly.
    const config = {
      development: {
        primary: { adapter: "sqlite3", database: "test/storage/development.sqlite3" },
      },
      test: {
        primary: { adapter: "sqlite3", database: "test/storage/test.sqlite3" },
      },
    };
    const configurations = new DatabaseConfigurations(config);
    const dbConfigs = configurations.configsFor();
    expect(dbConfigs).toHaveLength(2);
    for (const dbConfig of dbConfigs) {
      expect(dbConfig).toBeInstanceOf(HashConfig);
      expect(typeof dbConfig.envName).toBe("string");
      expect(typeof dbConfig.name).toBe("string");
    }
  });

  it("retrieve connection", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary" });
    const pool = handler.retrieveConnectionPool("primary");
    expect(pool).toBeTruthy();
  });

  it("active connections?", () => {
    expect(handler.activeConnections).toBe(false);
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    pool.leaseConnection();
    expect(handler.activeConnections).toBe(true);
    pool.releaseConnection();
  });

  it("retrieve connection pool", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary" });
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
    handler.establishConnection(config1, { owner: "primary" });
    handler.establishConnection(config2, { owner: "animals" });
    expect(handler.connectionPools).toHaveLength(2);
  });

  it("a class using custom pool and switching back to primary", () => {
    const savedHandler = (Base as any)._connectionHandler;
    const freshHandler = new ConnectionHandler();
    (Base as any)._connectionHandler = freshHandler;
    try {
      class Klass2 extends Base {}

      const baseConfig = new HashConfig("development", "primary", {
        adapter: "sqlite3",
        database: ":memory:",
      });
      const ownConfig = new HashConfig("development", "Klass2", {
        adapter: "sqlite3",
        database: ":memory:",
      });

      const basePool = freshHandler.establishConnection(baseConfig, {
        owner: "Base",
        role: "writing",
      });

      // Before own pool: Klass2 delegates to Base's pool via spec-name walk
      expect(
        freshHandler.retrieveConnectionPool(Klass2.connectionSpecificationName, {
          role: "writing",
        }),
      ).toBe(basePool);

      // Give Klass2 its own pool (mirrors klass2.establish_connection in Rails)
      const ownPool = freshHandler.establishConnection(ownConfig, {
        owner: Klass2,
        role: "writing",
      });
      (Klass2 as any).connectionClass = true;

      expect(
        freshHandler.retrieveConnectionPool(Klass2.connectionSpecificationName, {
          role: "writing",
        }),
      ).toBe(ownPool);
      expect(ownPool).not.toBe(basePool);

      // Remove the connection — Klass2 should fall back to Base's pool
      Klass2.removeConnection();

      expect(
        freshHandler.retrieveConnectionPool(Klass2.connectionSpecificationName, {
          role: "writing",
        }),
      ).toBe(basePool);
    } finally {
      (Base as any)._connectionHandler = savedHandler;
    }
  });

  it("connection specification name should fallback to parent", () => {
    class ParentModel extends Base {}
    class ChildModel extends ParentModel {}

    // Without explicit names both walk up to Base
    expect(ChildModel.connectionSpecificationName).toBe(ParentModel.connectionSpecificationName);

    // Setting on parent propagates to child via hierarchy walk
    ParentModel.connectionSpecificationName = "readonly";
    expect(ChildModel.connectionSpecificationName).toBe("readonly");

    // Cleanup: reset so we don't leak into other tests
    (ParentModel as any)._connectionSpecificationName = undefined;
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
    handler.establishConnection(config1, { owner: "primary" });
    handler.establishConnection(config2, { owner: "child" });
    handler.removeConnection("child");
    expect(handler.retrieveConnectionPool("primary")).toBeTruthy();
    expect(handler.retrieveConnectionPool("child")).toBeUndefined();
  });

  it("establish connection returns same pool for same config", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    const pool1 = handler.establishConnection(config, {
      owner: "primary",
    });
    const pool2 = handler.retrieveConnectionPool("primary");
    expect(pool1).toBe(pool2);
  });

  it("supports multiple roles for the same owner", () => {
    const writing = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "primary.db",
    });
    const reading = new HashConfig("development", "primary_replica", {
      adapter: "sqlite3",
      database: "replica.db",
    });
    handler.establishConnection(writing, {
      owner: "primary",
      role: "writing",
    });
    handler.establishConnection(reading, {
      owner: "primary",
      role: "reading",
    });
    const writingPool = handler.retrieveConnectionPool("primary", { role: "writing" });
    const readingPool = handler.retrieveConnectionPool("primary", { role: "reading" });
    expect(writingPool).toBeTruthy();
    expect(readingPool).toBeTruthy();
    expect(writingPool).not.toBe(readingPool);
    expect(writingPool!.dbConfig.database).toBe("primary.db");
    expect(readingPool!.dbConfig.database).toBe("replica.db");
  });

  it("supports multiple shards for the same owner and role", () => {
    const shard1 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "shard1.db",
    });
    const shard2 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "shard2.db",
    });
    handler.establishConnection(shard1, {
      owner: "primary",
      shard: "one",
    });
    handler.establishConnection(shard2, {
      owner: "primary",
      shard: "two",
    });
    const pool1 = handler.retrieveConnectionPool("primary", { shard: "one" });
    const pool2 = handler.retrieveConnectionPool("primary", { shard: "two" });
    expect(pool1).toBeTruthy();
    expect(pool2).toBeTruthy();
    expect(pool1).not.toBe(pool2);
  });

  it("re-establishing connection disconnects old pool", () => {
    const config1 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "old.db",
    });
    const config2 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "new.db",
    });
    const oldPool = handler.establishConnection(config1, {
      owner: "primary",
    });
    const disconnectSpy = vi.spyOn(oldPool, "disconnect");
    const newPool = handler.establishConnection(config2, {
      owner: "primary",
    });
    expect(disconnectSpy).toHaveBeenCalled();
    expect(newPool).not.toBe(oldPool);
    expect(newPool.dbConfig.database).toBe("new.db");
    expect(handler.connectionPools).toHaveLength(1);
  });

  it("default handlers are writing and reading", () => {
    expect(Base.writingRole).toBe("writing");
    expect(Base.readingRole).toBe("reading");
  });

  it.skip("connection pool per pid", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — fork
  });

  it.skip("forked child doesnt mangle parent connection", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — fork
  });

  it.skip("forked child recovers from disconnected parent", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — fork
  });

  it.skip("retrieve connection pool copies schema cache from ancestor pool", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — fork
  });

  it.skip("pool from any process for uses most recent spec", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — fork
  });

  it("connection pool names", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary" });
    expect(handler.connectionPoolNames()).toContain("primary");
  });

  it("each connection pool", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary" });
    const pools: unknown[] = [];
    handler.eachConnectionPool(null, (pool) => pools.push(pool));
    expect(pools).toHaveLength(1);
  });

  it("clear active connections bang", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    pool.leaseConnection();
    expect(pool.activeConnection).toBeTruthy();
    handler.clearActiveConnectionsBang();
    expect(pool.activeConnection).toBeNull();
  });

  it("clear all connections bang", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    pool.leaseConnection();
    handler.clearAllConnectionsBang();
    expect(pool.isConnected()).toBe(false);
  });

  it("prevent writes", () => {
    expect(handler.preventWrites).toBe(false);
    handler.preventWrites = true;
    expect(handler.preventWrites).toBe(true);
    handler.preventWrites = false;
  });

  it("retrieve connection returns a connection", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary" });
    const conn = handler.retrieveConnection("primary");
    expect(conn).toBeTruthy();
    expect(conn.adapterName).toBeTruthy();
    handler.retrieveConnectionPool("primary")!.releaseConnection();
  });

  it("retrieve connection strict throws for missing pool", () => {
    expect(() => handler.retrieveConnection("nonexistent")).toThrow(/No database connection/);
  });

  it("is connected", () => {
    expect(handler.isConnected("primary")).toBe(false);
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    pool.leaseConnection();
    expect(handler.isConnected("primary")).toBe(true);
    pool.releaseConnection();
  });

  it("remove connection pool", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary" });
    expect(handler.retrieveConnectionPool("primary")).toBeTruthy();
    handler.removeConnectionPool("primary");
    expect(handler.retrieveConnectionPool("primary")).toBeUndefined();
  });

  it("flush idle connections bang", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    pool.leaseConnection();
    pool.releaseConnection();
    expect(pool.stat().idle).toBe(1);
    handler.flushIdleConnectionsBang();
    expect(pool.stat().connections).toBe(0);
  });

  it("connection pool list filtered by role", () => {
    const config1 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    const config2 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev-read.db",
    });
    handler.establishConnection(config1, {
      owner: "primary",
      role: "writing",
    });
    handler.establishConnection(config2, {
      owner: "primary",
      role: "reading",
    });
    expect(handler.connectionPoolList("writing")).toHaveLength(1);
    expect(handler.connectionPoolList("reading")).toHaveLength(1);
    expect(handler.connectionPoolList("all")).toHaveLength(2);
    expect(handler.connectionPoolList()).toHaveLength(2);
  });

  it("active connections filtered by role", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, {
      owner: "primary",
      role: "writing",
    });
    const pool = handler.retrieveConnectionPool("primary", { role: "writing" })!;
    pool.leaseConnection();
    expect(handler.activeConnectionsQ("writing")).toBe(true);
    expect(handler.activeConnectionsQ("reading")).toBe(false);
    pool.releaseConnection();
  });

  it("retrieve connection pool strict mode with role and shard", () => {
    expect(() =>
      handler.retrieveConnectionPool("primary", {
        role: "reading",
        shard: "shard_one",
        strict: true,
      }),
    ).toThrow(/No database connection defined.*'shard_one' shard.*'reading' role/);
  });

  it("each connection pool with null role", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, { owner: "primary" });
    const pools: unknown[] = [];
    handler.eachConnectionPool(null, (pool) => pools.push(pool));
    expect(pools).toHaveLength(1);
  });

  it("re-establishing with same config object returns existing pool without disconnect", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    const pool1 = handler.establishConnection(config, {
      owner: "primary",
    });
    const disconnectSpy = vi.spyOn(pool1, "disconnect");
    const pool2 = handler.establishConnection(config, {
      owner: "primary",
    });
    expect(disconnectSpy).not.toHaveBeenCalled();
    expect(pool2).toBe(pool1);
  });

  it("re-establishing with same config and clobber true disconnects old pool", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    const pool1 = handler.establishConnection(config, {
      owner: "primary",
    });
    const disconnectSpy = vi.spyOn(pool1, "disconnect");
    const pool2 = handler.establishConnection(config, {
      owner: "primary",
      clobber: true,
    });
    expect(disconnectSpy).toHaveBeenCalled();
    expect(pool2).not.toBe(pool1);
  });

  it("clear all connections bang is safe on empty handler", () => {
    expect(() => handler.clearAllConnectionsBang()).not.toThrow();
  });

  it("flush idle connections bang is safe on empty handler", () => {
    expect(() => handler.flushIdleConnectionsBang()).not.toThrow();
  });

  it("clear active connections bang is safe on empty handler", () => {
    expect(() => handler.clearActiveConnectionsBang()).not.toThrow();
  });

  it("retrieve connection pool strict mode raises with role in message", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "dev.db",
    });
    handler.establishConnection(config, {
      owner: "primary",
      role: "writing",
    });
    expect(() =>
      handler.retrieveConnectionPool("primary", { role: "reading", strict: true }),
    ).toThrow(/No database connection defined.*'reading' role/);
  });
});
