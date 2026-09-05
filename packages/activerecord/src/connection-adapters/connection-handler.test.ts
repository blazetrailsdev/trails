import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConnectionHandler } from "./abstract/connection-handler.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { Base } from "../base.js";
import { AdapterNotFound } from "../errors.js";
import { ambientPoolConfiguration } from "../test-adapter.js";
import { DatabaseTasks } from "../tasks/database-tasks.js";

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

  beforeEach(async () => {
    handler = new ConnectionHandler();
    DatabaseTasks.env = "development";
  });

  it("default env fall back to default env when rails env or rack env is empty string", async () => {
    DatabaseTasks.env = "";
    expect(DatabaseTasks.env).toBe("default_env");
    DatabaseTasks.env = "development";
    expect(DatabaseTasks.env).toBe("development");
  });

  it("establish connection using 3 levels config", async () => {
    const config = {
      default_env: {
        readonly: { adapter: "sqlite3", database: "test/db/readonly.sqlite3" },
        primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      },
      another_env: {
        readonly: { adapter: "sqlite3", database: "test/db/bad-readonly.sqlite3" },
        primary: { adapter: "sqlite3", database: "test/db/bad-primary.sqlite3" },
      },
      common: { adapter: "sqlite3", database: "test/db/common.sqlite3" },
    };
    const prevEnv = DatabaseTasks.env;
    DatabaseTasks.env = "default_env";
    const prevConfigs = Base.configurations();
    Base.configurations(config);

    try {
      handler.establishConnection("common");
      handler.establishConnection("primary");
      handler.establishConnection("readonly");

      const readonlyPool = handler.retrieveConnectionPool("readonly");
      expect(readonlyPool).toBeTruthy();
      expect(readonlyPool!.dbConfig.database).toBe("test/db/readonly.sqlite3");

      const primaryPool = handler.retrieveConnectionPool("primary");
      expect(primaryPool).toBeTruthy();
      expect(primaryPool!.dbConfig.database).toBe("test/db/primary.sqlite3");

      const commonPool = handler.retrieveConnectionPool("common");
      expect(commonPool).toBeTruthy();
      expect(commonPool!.dbConfig.database).toBe("test/db/common.sqlite3");
    } finally {
      Base.configurations(prevConfigs);
      DatabaseTasks.env = prevEnv;
    }
  });

  it("validates db configuration and raises on invalid adapter", async () => {
    const config = {
      development: { adapter: "ridiculous" },
    };
    const prevConfigs = Base.configurations();
    Base.configurations(config);

    try {
      await expect(Base.establishConnection("development")).rejects.toThrow(AdapterNotFound);
    } finally {
      Base.configurations(prevConfigs);
    }
  });

  it("not setting writing role while using another named role raises", async () => {
    const localHandler = new ConnectionHandler();
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    localHandler.establishConnection(config, {
      ownerName: "ActiveRecord::Base",
      role: "also_writing",
      shard: "default",
    });
    localHandler.establishConnection(config, {
      ownerName: "ActiveRecord::Base",
      role: "also_writing",
      shard: "one",
    });
    expect(() => setupSharedConnectionPool(localHandler)).toThrow(/poolConfig.*null/);
  });

  it("fixtures dont raise if theres no writing pool config", async () => {
    const localHandler = new ConnectionHandler();
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    localHandler.establishConnection(config, { ownerName: "ActiveRecord::Base", role: "writing" });
    localHandler.establishConnection(config, { ownerName: "ActiveRecord::Base", role: "reading" });
    expect(() => setupSharedConnectionPool(localHandler)).not.toThrow();
    const rwPool = localHandler.retrieveConnectionPool("ActiveRecord::Base", { role: "writing" })!;
    const roPool = localHandler.retrieveConnectionPool("ActiveRecord::Base", { role: "reading" })!;
    expect(roPool).toBe(rwPool);
  });

  it("setting writing role while using another named role does not raise", async () => {
    const oldRole = Base.writingRole;
    Base.writingRole = "also_writing";
    try {
      const localHandler = new ConnectionHandler();
      const config = new HashConfig("development", "primary", {
        adapter: "sqlite3",
        database: "test/db/primary.sqlite3",
      });
      localHandler.establishConnection(config, {
        ownerName: "ActiveRecord::Base",
        role: "also_writing",
        shard: "default",
      });
      localHandler.establishConnection(config, {
        ownerName: "ActiveRecord::Base",
        role: "also_writing",
        shard: "one",
      });
      expect(() => setupSharedConnectionPool(localHandler)).not.toThrow();
    } finally {
      Base.writingRole = oldRole;
    }
  });

  it("establish connection with primary works without deprecation", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const pool = handler.establishConnection(config);
    expect(pool.dbConfig.name).toBe("primary");
  });

  it("establish connection using 3 level config defaults to default env primary db", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const pool = handler.establishConnection(config);
    expect(pool.dbConfig.envName).toBe("development");
    expect(pool.dbConfig.name).toBe("primary");
  });

  it("establish connection using 2 level config defaults to default env primary db", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const pool = handler.establishConnection(config);
    expect(pool.dbConfig.envName).toBe("development");
  });

  it("establish connection using two level configurations", async () => {
    const config = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const pool = handler.establishConnection(config);
    expect(pool.dbConfig.database).toBe("test/db/primary.sqlite3");
  });

  it("establish connection using top level key in two level config", async () => {
    const configs = new DatabaseConfigurations({
      development: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      development_readonly: { adapter: "sqlite3", database: "test/db/readonly.sqlite3" },
    });
    const config = configs.configsFor({ envName: "development_readonly" })[0];
    const pool = handler.establishConnection(config);
    expect(pool).toBeTruthy();
    expect(pool.dbConfig.database).toBe("test/db/readonly.sqlite3");
  });

  it("establish connection with string owner name", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    handler.establishConnection(config, { ownerName: "MyModel" });
    const pool = handler.retrieveConnectionPool("MyModel");
    expect(pool).toBeTruthy();
  });

  it("symbolized configurations assignment", async () => {
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

  it("retrieve connection", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    handler.establishConnection(config, { ownerName: "primary" });
    const pool = handler.retrieveConnectionPool("primary");
    expect(pool).toBeTruthy();
  });

  it("active connections?", async () => {
    expect(handler.activeConnectionsQ()).toBe(false);
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    handler.establishConnection(config, { ownerName: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    await pool.leaseConnection();
    expect(handler.activeConnectionsQ()).toBe(true);
    pool.releaseConnection();
  });

  it("retrieve connection pool", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    handler.establishConnection(config, { ownerName: "primary" });
    const pool = handler.retrieveConnectionPool("primary");
    expect(pool).toBeTruthy();
    expect(pool!.dbConfig.database).toBe("test/db/primary.sqlite3");
  });

  it("retrieve connection pool with invalid id", async () => {
    const pool = handler.retrieveConnectionPool("nonexistent");
    expect(pool).toBeUndefined();
  });

  it("connection pools", async () => {
    const config1 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const config2 = new HashConfig("development", "animals", {
      adapter: "sqlite3",
      database: "test/db/common.sqlite3",
    });
    handler.establishConnection(config1, { ownerName: "primary" });
    handler.establishConnection(config2, { ownerName: "animals" });
    expect(handler.connectionPools).toHaveLength(2);
  });

  it("a class using custom pool and switching back to primary", async () => {
    const savedHandler = (Base as any)._connectionHandler;
    const freshHandler = new ConnectionHandler();
    (Base as any)._connectionHandler = freshHandler;
    try {
      class Klass2 extends Base {}

      const baseConfig = new HashConfig("development", "primary", ambientPoolConfiguration());
      const ownConfig = new HashConfig("development", "Klass2", ambientPoolConfiguration());

      const basePool = freshHandler.establishConnection(baseConfig, {
        ownerName: "ActiveRecord::Base",
        role: "writing",
      });

      expect(
        freshHandler.retrieveConnectionPool(Klass2.connectionSpecificationName, {
          role: "writing",
        }),
      ).toBe(basePool);

      const ownPool = freshHandler.establishConnection(ownConfig, {
        ownerName: Klass2,
        role: "writing",
      });
      (Klass2 as any).connectionClass = true;

      expect(
        freshHandler.retrieveConnectionPool(Klass2.connectionSpecificationName, {
          role: "writing",
        }),
      ).toBe(ownPool);
      expect(ownPool).not.toBe(basePool);

      Klass2.removeConnection();

      expect(
        freshHandler.retrieveConnectionPool(Klass2.connectionSpecificationName, {
          role: "writing",
        }),
      ).toBe(basePool);
      expect((Klass2 as any).connectionClass).toBe(true);
    } finally {
      (Base as any)._connectionHandler = savedHandler;
    }
  });

  it("connection specification name should fallback to parent", async () => {
    class ParentModel extends Base {}
    class ChildModel extends ParentModel {}

    expect(ChildModel.connectionSpecificationName).toBe(ParentModel.connectionSpecificationName);

    ParentModel.connectionSpecificationName = "readonly";
    expect(ChildModel.connectionSpecificationName).toBe("readonly");

    (ParentModel as any)._connectionSpecificationName = undefined;
  });

  it("remove connection should not remove parent", async () => {
    const config1 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const config2 = new HashConfig("development", "child", {
      adapter: "sqlite3",
      database: "test/db/readonly.sqlite3",
    });
    handler.establishConnection(config1, { ownerName: "primary" });
    handler.establishConnection(config2, { ownerName: "child" });
    handler.removeConnection("child");
    expect(handler.retrieveConnectionPool("primary")).toBeTruthy();
    expect(handler.retrieveConnectionPool("child")).toBeUndefined();
  });

  it("establish connection returns same pool for same config", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const pool1 = handler.establishConnection(config, {
      ownerName: "primary",
    });
    const pool2 = handler.retrieveConnectionPool("primary");
    expect(pool1).toBe(pool2);
  });

  it("supports multiple roles for the same owner", async () => {
    const writing = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const reading = new HashConfig("development", "primary_replica", {
      adapter: "sqlite3",
      database: "test/db/readonly.sqlite3",
    });
    handler.establishConnection(writing, {
      ownerName: "primary",
      role: "writing",
    });
    handler.establishConnection(reading, {
      ownerName: "primary",
      role: "reading",
    });
    const writingPool = handler.retrieveConnectionPool("primary", { role: "writing" });
    const readingPool = handler.retrieveConnectionPool("primary", { role: "reading" });
    expect(writingPool).toBeTruthy();
    expect(readingPool).toBeTruthy();
    expect(writingPool).not.toBe(readingPool);
    expect(writingPool!.dbConfig.database).toBe("test/db/primary.sqlite3");
    expect(readingPool!.dbConfig.database).toBe("test/db/readonly.sqlite3");
  });

  it("supports multiple shards for the same owner and role", async () => {
    const shard1 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const shard2 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/readonly.sqlite3",
    });
    handler.establishConnection(shard1, {
      ownerName: "primary",
      shard: "one",
    });
    handler.establishConnection(shard2, {
      ownerName: "primary",
      shard: "two",
    });
    const pool1 = handler.retrieveConnectionPool("primary", { shard: "one" });
    const pool2 = handler.retrieveConnectionPool("primary", { shard: "two" });
    expect(pool1).toBeTruthy();
    expect(pool2).toBeTruthy();
    expect(pool1).not.toBe(pool2);
  });

  it("re-establishing connection disconnects old pool", async () => {
    const config1 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const config2 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/readonly.sqlite3",
    });
    const oldPool = handler.establishConnection(config1, {
      ownerName: "primary",
    });
    const disconnectSpy = vi.spyOn(oldPool, "disconnect");
    const newPool = handler.establishConnection(config2, {
      ownerName: "primary",
    });
    expect(disconnectSpy).toHaveBeenCalled();
    expect(newPool).not.toBe(oldPool);
    expect(newPool.dbConfig.database).toBe("test/db/readonly.sqlite3");
    expect(handler.connectionPools).toHaveLength(1);
  });

  it("default handlers are writing and reading", async () => {
    expect(Base.writingRole).toBe("writing");
    expect(Base.readingRole).toBe("reading");
  });

  it.skip("connection pool per pid", () => {});

  it.skip("forked child doesnt mangle parent connection", () => {});

  it.skip("forked child recovers from disconnected parent", () => {});

  it.skip("retrieve connection pool copies schema cache from ancestor pool", () => {});

  it.skip("pool from any process for uses most recent spec", () => {});

  it("connection pool names", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    handler.establishConnection(config, { ownerName: "primary" });
    expect(handler.connectionPoolNames()).toContain("primary");
  });

  it("each connection pool", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    handler.establishConnection(config, { ownerName: "primary" });
    const pools: unknown[] = [];
    handler.eachConnectionPool(null, (pool) => pools.push(pool));
    expect(pools).toHaveLength(1);
  });

  it("clear active connections bang", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    handler.establishConnection(config, { ownerName: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    await pool.leaseConnection();
    expect(pool.activeConnection).toBeTruthy();
    handler.clearActiveConnectionsBang();
    expect(pool.activeConnection).toBeNull();
  });

  it("clear all connections bang", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    handler.establishConnection(config, { ownerName: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    await pool.leaseConnection();
    await handler.clearAllConnectionsBang();
    expect(pool.isConnected()).toBe(false);
  });

  it("prevent writes", async () => {
    expect(handler.preventWrites).toBe(false);
    handler.preventWrites = true;
    expect(handler.preventWrites).toBe(true);
    handler.preventWrites = false;
  });

  it("retrieve connection returns a connection", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    handler.establishConnection(config, { ownerName: "primary" });
    const conn = await handler.retrieveConnection("primary");
    expect(conn).toBeTruthy();
    expect(conn.adapterName).toBeTruthy();
    handler.retrieveConnectionPool("primary")!.releaseConnection();
  });

  it("retrieve connection strict throws for missing pool", async () => {
    expect(() => handler.retrieveConnection("nonexistent")).toThrow(/No database connection/);
  });

  it("is connected", async () => {
    expect(handler.isConnected("primary")).toBe(false);
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    handler.establishConnection(config, { ownerName: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    await (await pool.leaseConnection()).verifyBang();
    expect(handler.isConnected("primary")).toBe(true);
    pool.releaseConnection();
  });

  it("remove connection pool", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    handler.establishConnection(config, { ownerName: "primary" });
    expect(handler.retrieveConnectionPool("primary")).toBeTruthy();
    handler.removeConnectionPool("primary");
    expect(handler.retrieveConnectionPool("primary")).toBeUndefined();
  });

  it("flush idle connections bang", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    handler.establishConnection(config, { ownerName: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    await pool.leaseConnection();
    pool.releaseConnection();
    expect(pool.stat().idle).toBe(1);
    await handler.flushIdleConnectionsBang();
    expect(pool.stat().connections).toBe(0);
  });

  it("connection pool list filtered by role", async () => {
    const config1 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const config2 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/readonly.sqlite3",
    });
    handler.establishConnection(config1, {
      ownerName: "primary",
      role: "writing",
    });
    handler.establishConnection(config2, {
      ownerName: "primary",
      role: "reading",
    });
    expect(handler.connectionPoolList("writing")).toHaveLength(1);
    expect(handler.connectionPoolList("reading")).toHaveLength(1);
    expect(handler.connectionPoolList("all")).toHaveLength(2);
    expect(handler.connectionPoolList()).toHaveLength(2);
  });

  it("active connections filtered by role", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    handler.establishConnection(config, {
      ownerName: "primary",
      role: "writing",
    });
    const pool = handler.retrieveConnectionPool("primary", { role: "writing" })!;
    await pool.leaseConnection();
    expect(handler.activeConnectionsQ("writing")).toBe(true);
    expect(handler.activeConnectionsQ("reading")).toBe(false);
    pool.releaseConnection();
  });

  it("retrieve connection pool strict mode with role and shard", async () => {
    expect(() =>
      handler.retrieveConnectionPool("primary", {
        role: "reading",
        shard: "shard_one",
        strict: true,
      }),
    ).toThrow(/No database connection defined.*'shard_one' shard.*'reading' role/);
  });

  it("each connection pool with null role", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    handler.establishConnection(config, { ownerName: "primary" });
    const pools: unknown[] = [];
    handler.eachConnectionPool(null, (pool) => pools.push(pool));
    expect(pools).toHaveLength(1);
  });

  it("re-establishing with same config object returns existing pool without disconnect", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const pool1 = handler.establishConnection(config, {
      ownerName: "primary",
    });
    const disconnectSpy = vi.spyOn(pool1, "disconnect");
    const pool2 = handler.establishConnection(config, {
      ownerName: "primary",
    });
    expect(disconnectSpy).not.toHaveBeenCalled();
    expect(pool2).toBe(pool1);
  });

  it("re-establishing with same config and clobber true disconnects old pool", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const pool1 = handler.establishConnection(config, {
      ownerName: "primary",
    });
    const disconnectSpy = vi.spyOn(pool1, "disconnect");
    const pool2 = handler.establishConnection(config, {
      ownerName: "primary",
      clobber: true,
    });
    expect(disconnectSpy).toHaveBeenCalled();
    expect(pool2).not.toBe(pool1);
  });

  it("clear all connections bang is safe on empty handler", async () => {
    await expect(handler.clearAllConnectionsBang()).resolves.toBeUndefined();
  });

  it("flush idle connections bang is safe on empty handler", async () => {
    await expect(handler.flushIdleConnectionsBang()).resolves.toBeUndefined();
  });

  it("clear active connections bang is safe on empty handler", async () => {
    expect(() => handler.clearActiveConnectionsBang()).not.toThrow();
  });

  it("retrieve connection pool strict mode raises with role in message", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    handler.establishConnection(config, {
      ownerName: "primary",
      role: "writing",
    });
    expect(() =>
      handler.retrieveConnectionPool("primary", { role: "reading", strict: true }),
    ).toThrow(/No database connection defined.*'reading' role/);
  });
});
