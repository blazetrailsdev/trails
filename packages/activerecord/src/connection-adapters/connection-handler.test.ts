import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConnectionHandler } from "./abstract/connection-handler.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { Base } from "../base.js";
import { AdapterNotFound } from "../errors.js";
import { ambientPoolConfiguration } from "../test-adapter.js";
import { assertNotDeprecated, getEnv } from "@blazetrails/activesupport";
import { setEnv } from "@blazetrails/ruby-compat";
import { deprecator } from "../deprecator.js";
import { restoreWorkerConnection } from "../support/connection.js";
import { DEFAULT_ENV } from "../connection-handling.js";
import { readingRole, setWritingRole, writingRole } from "../active-record.js";

function setupSharedConnectionPool(handlerArg: ConnectionHandler): void {
  for (const poolManager of (handlerArg as any)._connectionNameToPoolManager.values()) {
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
    const previousEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "default_env");
    const prevConfigs = Base.configurations();
    Base.configurations(config);

    try {
      await handler.establishConnection(":common");
      await handler.establishConnection(":primary");
      await handler.establishConnection(":readonly");

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
      setEnv("TRAILS_ENV", previousEnv);
    }
  });

  it("validates db configuration and raises on invalid adapter", async () => {
    const config = {
      development: { adapter: "ridiculous" },
    };
    const prevConfigs = Base.configurations();
    Base.configurations(config);

    try {
      await expect(Base.establishConnection(":development")).rejects.toThrow(AdapterNotFound);
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
      await handler.establishConnection(":primary");

      await assertNotDeprecated(deprecator(), async () => {
        await handler.retrieveConnection("primary");
        await handler.removeConnectionPool("primary");
      });
    } finally {
      Base.configurations(oldConfig);
    }
  });

  it("establish connection using 3 level config defaults to default env primary db", async () => {
    const previousEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "default_env");
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
      setEnv("TRAILS_ENV", previousEnv);
      await restoreWorkerConnection();
    }
  });

  it("establish connection using 2 level config defaults to default env primary db", async () => {
    const previousEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "default_env");
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
      setEnv("TRAILS_ENV", previousEnv);
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
      await handler.establishConnection(":development");

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
      await handler.establishConnection(":development_readonly");

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
      await handler.establishConnection(":development_readonly", {
        ownerName: "custom_connection",
      });

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
    expect(handler.hasActiveConnections("all")).toBeFalsy();
    expect(await handler.retrieveConnection(connectionName)).toBeTruthy();
    expect(handler.hasActiveConnections("all")).toBeTruthy();
    handler.clearActiveConnectionsBang("all");
    expect(handler.hasActiveConnections("all")).toBeFalsy();
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

    const pool = await Klass2.establishConnection(Base.connectionPool().dbConfig.configurationHash);
    expect(await Klass2.leaseConnection()).toBe(await pool.leaseConnection());
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

  it("remove connection should not remove parent", async () => {
    class Klass2 extends Base {}
    await Klass2.removeConnection();
    expect(await Base.leaseConnection()).not.toBeNull();
    expect(await Klass2.leaseConnection()).toBe(await Base.leaseConnection());
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
});
