import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConnectionHandler } from "./abstract/connection-handler.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { Base } from "../base.js";
import { AdapterNotFound } from "../errors.js";
import { ambientPoolConfiguration } from "../test-adapter.js";
import { assertNotDeprecated } from "@blazetrails/activesupport";
import { deprecator } from "../deprecator.js";
import { restoreWorkerConnection } from "../support/connection.js";
import { DEFAULT_ENV } from "../connection-handling.js";
import { DatabaseTasks } from "../tasks/database-tasks.js";
import { readingRole, setWritingRole, writingRole } from "../active-record.js";

function setupSharedConnectionPool(handlerArg: ConnectionHandler): void {
  const managerMap: Map<string, any> = (handlerArg as any)._connectionNameToPoolManager;
  for (const [, poolManager] of managerMap) {
    for (const shardName of poolManager.shardNames as string[]) {
      const writingPoolConfig = poolManager.getPoolConfig(writingRole(), shardName);
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
  let pool: any;
  const connectionName = "ActiveRecord::Base";

  beforeEach(async () => {
    await restoreWorkerConnection();
    handler = new ConnectionHandler();
    DatabaseTasks.env = "development";
  });

  afterEach(async () => {
    await restoreWorkerConnection();
  });

  const setupPool = async () => {
    pool = await handler.establishConnection(
      new HashConfig("arunit", "primary", ambientPoolConfiguration()),
    );
  };

  it("default env fall back to default env when rails env or rack env is empty string", async () => {
    vi.stubEnv("TRAILS_ENV", "");
    vi.stubEnv("NODE_ENV", "");
    DatabaseTasks.env = "";
    try {
      expect(DEFAULT_ENV()).toEqual("default_env");
    } finally {
      vi.unstubAllEnvs();
    }
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
      await handler.establishConnection("common");
      await handler.establishConnection("primary");
      await handler.establishConnection("readonly");

      const readonlyPool = handler.retrieveConnectionPool("readonly");
      expect(readonlyPool).not.toBeNull();
      expect(readonlyPool!.dbConfig.database).toBe("test/db/readonly.sqlite3");

      const primaryPool = handler.retrieveConnectionPool("primary");
      expect(primaryPool).not.toBeNull();
      expect(primaryPool!.dbConfig.database).toBe("test/db/primary.sqlite3");

      const commonPool = handler.retrieveConnectionPool("common");
      expect(commonPool).not.toBeNull();
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
    await localHandler.establishConnection(config, {
      ownerName: "ActiveRecord::Base",
      role: "also_writing",
      shard: "default",
    });
    await localHandler.establishConnection(config, {
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
    await localHandler.establishConnection(config, {
      ownerName: "ActiveRecord::Base",
      role: "writing",
    });
    await localHandler.establishConnection(config, {
      ownerName: "ActiveRecord::Base",
      role: "reading",
    });
    expect(() => setupSharedConnectionPool(localHandler)).not.toThrow();
    const rwPool = localHandler.retrieveConnectionPool("ActiveRecord::Base", { role: "writing" })!;
    const roPool = localHandler.retrieveConnectionPool("ActiveRecord::Base", { role: "reading" })!;
    expect(roPool).toBe(rwPool);
  });

  it("setting writing role while using another named role does not raise", async () => {
    const oldRole = writingRole();
    setWritingRole("also_writing");
    try {
      const localHandler = new ConnectionHandler();
      const config = new HashConfig("development", "primary", {
        adapter: "sqlite3",
        database: "test/db/primary.sqlite3",
      });
      await localHandler.establishConnection(config, {
        ownerName: "ActiveRecord::Base",
        role: "also_writing",
        shard: "default",
      });
      await localHandler.establishConnection(config, {
        ownerName: "ActiveRecord::Base",
        role: "also_writing",
        shard: "one",
      });
      expect(() => setupSharedConnectionPool(localHandler)).not.toThrow();
    } finally {
      setWritingRole(oldRole);
    }
  });

  it("establish connection with primary works without deprecation", async () => {
    const oldConfig = Base.configurations();
    const config = { primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" } };
    Base.configurations(config);
    try {
      await handler.establishConnection("primary");

      await assertNotDeprecated(deprecator(), async () => {
        await handler.retrieveConnection("primary");
        await handler.removeConnectionPool("primary");
      });
    } finally {
      Base.configurations(oldConfig);
    }
  });

  it("establish connection using 3 level config defaults to default env primary db", async () => {
    const previousEnv = DatabaseTasks.env;
    DatabaseTasks.env = "default_env";
    const config = {
      default_env: {
        primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
        readonly: { adapter: "sqlite3", database: "test/db/readonly.sqlite3" },
      },
      another_env: {
        primary: { adapter: "sqlite3", database: "test/db/another-primary.sqlite3" },
        readonly: { adapter: "sqlite3", database: "test/db/another-readonly.sqlite3" },
      },
    };
    const prevConfigs = Base.configurations();
    Base.configurations(config);
    try {
      await Base.establishConnection();

      expect((await Base.leaseConnection()).pool.dbConfig.database).toMatch(
        "test/db/primary.sqlite3",
      );
    } finally {
      Base.configurations(prevConfigs);
      DatabaseTasks.env = previousEnv;
      await restoreWorkerConnection();
    }
  });

  it("establish connection using 2 level config defaults to default env primary db", async () => {
    const previousEnv = DatabaseTasks.env;
    DatabaseTasks.env = "default_env";
    const config = {
      default_env: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      another_env: { adapter: "sqlite3", database: "test/db/bad-primary.sqlite3" },
    };
    const prevConfigs = Base.configurations();
    Base.configurations(config);
    try {
      await Base.establishConnection();

      expect((await Base.leaseConnection()).pool.dbConfig.database).toMatch(
        "test/db/primary.sqlite3",
      );
    } finally {
      Base.configurations(prevConfigs);
      DatabaseTasks.env = previousEnv;
      await restoreWorkerConnection();
    }
  });

  it("establish connection using two level configurations", async () => {
    const config = {
      development: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
    };
    const prevConfigs = Base.configurations();
    Base.configurations(config);
    try {
      await handler.establishConnection("development");

      const pool = handler.retrieveConnectionPool("development");
      expect(pool).not.toBeNull();
      expect((await pool!.leaseConnection()).isPreventingWrites()).toBeFalsy();
      expect(pool!.dbConfig.database).toEqual("test/db/primary.sqlite3");
    } finally {
      Base.configurations(prevConfigs);
    }
  });

  it("establish connection using top level key in two level config", async () => {
    const config = {
      development: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      development_readonly: { adapter: "sqlite3", database: "test/db/readonly.sqlite3" },
    };
    const prevConfigs = Base.configurations();
    Base.configurations(config);
    try {
      await handler.establishConnection("development_readonly");

      const pool = handler.retrieveConnectionPool("development_readonly");
      expect(pool).not.toBeNull();
      expect((await pool!.leaseConnection()).isPreventingWrites()).toBeFalsy();
      expect(pool!.dbConfig.database).toEqual("test/db/readonly.sqlite3");
    } finally {
      Base.configurations(prevConfigs);
    }
  });

  it("establish connection with string owner name", async () => {
    const config = {
      development: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      development_readonly: { adapter: "sqlite3", database: "test/db/readonly.sqlite3" },
    };
    const prevConfigs = Base.configurations();
    Base.configurations(config);
    try {
      await handler.establishConnection("development_readonly", { ownerName: "custom_connection" });

      const pool = handler.retrieveConnectionPool("custom_connection");
      expect(pool).not.toBeNull();
      expect((await pool!.leaseConnection()).isPreventingWrites()).toBeFalsy();
      expect(pool!.dbConfig.database).toEqual("test/db/readonly.sqlite3");
    } finally {
      Base.configurations(prevConfigs);
    }
  });

  it("symbolized configurations assignment", async () => {
    const prevConfigs = Base.configurations();
    const config = {
      development: {
        primary: { adapter: "sqlite3", database: "test/storage/development.sqlite3" },
      },
      test: {
        primary: { adapter: "sqlite3", database: "test/storage/test.sqlite3" },
      },
    };
    Base.configurations(config);
    try {
      for (const dbConfig of Base.configurations().configsFor()) {
        expect(dbConfig).toBeInstanceOf(HashConfig);
        expect(Object(dbConfig.envName)).toBeInstanceOf(String);
        expect(Object(dbConfig.name)).toBeInstanceOf(String);

        for (const key of Object.keys(dbConfig.configurationHash)) {
          expect(Object(key)).toBeInstanceOf(String);
        }
      }
    } finally {
      Base.configurations(prevConfigs);
    }
  });

  it("retrieve connection", async () => {
    await setupPool();
    expect(await handler.retrieveConnection(connectionName)).toBeTruthy();
  });

  it("active connections?", async () => {
    await setupPool();
    expect(handler.activeConnectionsQ("all")).toBeFalsy();
    expect(await handler.retrieveConnection(connectionName)).toBeTruthy();
    expect(handler.activeConnectionsQ("all")).toBeTruthy();
    handler.clearActiveConnectionsBang("all");
    expect(handler.activeConnectionsQ("all")).toBeFalsy();
  });

  it("retrieve connection pool", async () => {
    await setupPool();
    expect(handler.retrieveConnectionPool(connectionName)).not.toBeNull();
  });

  it("retrieve connection pool with invalid id", async () => {
    const pool = handler.retrieveConnectionPool("nonexistent");
    expect(pool).toBeUndefined();
  });

  it("connection pools", async () => {
    await setupPool();
    expect(handler.connectionPools).toEqual([pool]);
  });

  it("a class using custom pool and switching back to primary", async () => {
    class Klass2 extends Base {}

    expect(await Klass2.leaseConnection()).toBe(await Base.leaseConnection());

    await Klass2.establishConnection(Base.connectionPool().dbConfig.configurationHash);
    const klass2Pool = Klass2.connectionPool();
    expect(await Klass2.leaseConnection()).toBe(await klass2Pool.leaseConnection());
    expect(await Klass2.leaseConnection()).not.toBe(await Base.leaseConnection());

    await Klass2.removeConnection();

    expect(await Klass2.leaseConnection()).toBe(await Base.leaseConnection());
  });

  it("connection specification name should fallback to parent", async () => {
    class ApplicationRecord extends Base {
      static {
        this.abstractClass = true;
      }
    }
    class MyClass extends ApplicationRecord {}

    class KlassA extends Base {}
    class KlassB extends KlassA {}
    class KlassC extends MyClass {}

    try {
      expect(KlassB.connectionSpecificationName).toEqual(KlassA.connectionSpecificationName);
      expect(KlassC.connectionSpecificationName).toEqual(KlassA.connectionSpecificationName);

      expect(KlassA.connectionSpecificationName).toEqual("ActiveRecord::Base");
      expect(KlassC.connectionSpecificationName).toEqual("ActiveRecord::Base");

      KlassA.connectionSpecificationName = "readonly";
      expect(KlassB.connectionSpecificationName).toEqual("readonly");

      Base.connectionSpecificationName = "readonly";
      expect(KlassC.connectionSpecificationName).toEqual("readonly");
    } finally {
      Base.connectionSpecificationName = "ActiveRecord::Base";
    }
  });

  it.skip("remove connection should not remove parent", async () => {
    // BLOCKED: remove-connection-reads-inherited-specification-name
    class Klass2 extends Base {}
    await Klass2.removeConnection();
    expect(await Base.leaseConnection()).not.toBeNull();
    expect(await Klass2.leaseConnection()).toBe(await Base.leaseConnection());
  });

  it("establish connection returns same pool for same config", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const pool1 = await handler.establishConnection(config, {
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
    await handler.establishConnection(writing, {
      ownerName: "primary",
      role: "writing",
    });
    await handler.establishConnection(reading, {
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
    await handler.establishConnection(shard1, {
      ownerName: "primary",
      shard: "one",
    });
    await handler.establishConnection(shard2, {
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
    const oldPool = await handler.establishConnection(config1, {
      ownerName: "primary",
    });
    const disconnectSpy = vi.spyOn(oldPool, "disconnect");
    const newPool = await handler.establishConnection(config2, {
      ownerName: "primary",
    });
    expect(disconnectSpy).toHaveBeenCalled();
    expect(newPool).not.toBe(oldPool);
    expect(newPool.dbConfig.database).toBe("test/db/readonly.sqlite3");
    expect(handler.connectionPools).toHaveLength(1);
  });

  it("default handlers are writing and reading", async () => {
    expect(writingRole()).toBe("writing");
    expect(readingRole()).toBe("reading");
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
    await handler.establishConnection(config, { ownerName: "primary" });
    expect(handler.connectionPoolNames()).toContain("primary");
  });

  it("each connection pool", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    await handler.establishConnection(config, { ownerName: "primary" });
    const pools: unknown[] = [];
    handler.eachConnectionPool(null, (pool) => pools.push(pool));
    expect(pools).toHaveLength(1);
  });

  it("clear active connections bang", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    await handler.establishConnection(config, { ownerName: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    await pool.leaseConnection();
    expect(pool.activeConnection).toBeTruthy();
    handler.clearActiveConnectionsBang();
    expect(pool.activeConnection).toBeNull();
  });

  it("clear all connections bang", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    await handler.establishConnection(config, { ownerName: "primary" });
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
    await handler.establishConnection(config, { ownerName: "primary" });
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
    await handler.establishConnection(config, { ownerName: "primary" });
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
    await handler.establishConnection(config, { ownerName: "primary" });
    expect(handler.retrieveConnectionPool("primary")).toBeTruthy();
    await handler.removeConnectionPool("primary");
    expect(handler.retrieveConnectionPool("primary")).toBeUndefined();
  });

  it("flush idle connections bang", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    await handler.establishConnection(config, { ownerName: "primary" });
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
    await handler.establishConnection(config1, {
      ownerName: "primary",
      role: "writing",
    });
    await handler.establishConnection(config2, {
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
    await handler.establishConnection(config, {
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
    await handler.establishConnection(config, { ownerName: "primary" });
    const pools: unknown[] = [];
    handler.eachConnectionPool(null, (pool) => pools.push(pool));
    expect(pools).toHaveLength(1);
  });

  it("re-establishing with same config object returns existing pool without disconnect", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const pool1 = await handler.establishConnection(config, {
      ownerName: "primary",
    });
    const disconnectSpy = vi.spyOn(pool1, "disconnect");
    const pool2 = await handler.establishConnection(config, {
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
    const pool1 = await handler.establishConnection(config, {
      ownerName: "primary",
    });
    const disconnectSpy = vi.spyOn(pool1, "disconnect");
    const pool2 = await handler.establishConnection(config, {
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
    await handler.establishConnection(config, {
      ownerName: "primary",
      role: "writing",
    });
    expect(() =>
      handler.retrieveConnectionPool("primary", { role: "reading", strict: true }),
    ).toThrow(/No database connection defined.*'reading' role/);
  });
});
