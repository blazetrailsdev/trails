import { Thread } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import { ActiveRecordError } from "./errors.js";
import { deprecator } from "./deprecator.js";
import { assertDeprecated, assertNotDeprecated } from "@blazetrails/activesupport";
import { HashConfig } from "./database-configurations/hash-config.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { fixtures } from "./test-fixtures.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";
import { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
import { Post } from "./test-helpers/models/post.js";
import { Relation } from "./relation.js";
import { stripThenable } from "./relation/thenable.js";
import { connectedToStack, currentRole, currentShard, currentPreventingWrites } from "./core.js";
import { adapterType } from "./test-adapter.js";
import { restoreWorkerConnection } from "./support/connection.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
import { permanentConnectionCheckout, setPermanentConnectionCheckout } from "./active-record.js";

describe("ConnectionHandlingTest", () => {
  fixtures(["posts"], {
    usesTransaction: [
      "common APIs don't permanently hold a connection when permanent checkout is deprecated or disallowed",
      "establish_connection with a url stores a UrlConfig with discrete fields",
      "remove_connection removes the pool",
      "remove_connection returns undefined when no pool exists",
      "establishConnection raises AdapterNotSpecified for an adapter-less HashConfig",
      "autoConnect honors an in-memory DatabaseConfigurations registry",
      "autoConnect reconnects via mutated configuration.database for UrlConfig",
    ],
  });

  let permanentConnectionCheckoutWas: true | "deprecated" | "disallowed";

  beforeEach(() => {
    permanentConnectionCheckoutWas = permanentConnectionCheckout();
  });

  afterEach(async () => {
    setPermanentConnectionCheckout(permanentConnectionCheckoutWas);
    connectedToStack().length = 0;
    await Post.where({ title: "foo" }).deleteAll();
  });

  it("#with_connection lease the connection for the duration of the block", async () => {
    Base.releaseConnection();
    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();

    await Base.withConnection(() => {
      expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
    });

    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();
  });

  it("#lease_connection makes the lease permanent even inside #with_connection", async () => {
    Base.releaseConnection();
    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();

    let conn: unknown = null;
    await Base.withConnection(async (connection) => {
      conn = connection;
      expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
      for (let i = 0; i < 2; i++) {
        expect(await Base.leaseConnection()).toBe(connection);
      }
    });

    expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
    expect(await Base.leaseConnection()).toBe(conn);
  });

  it("#lease_connection makes the lease permanent even inside #with_connection(prevent_permanent_checkout: true)", async () => {
    Base.releaseConnection();
    await Base.withConnection(
      async (connection) => {
        expect(await Base.leaseConnection()).toBe(connection);
      },
      { preventPermanentCheckout: true },
    );
    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();
  });

  it("#with_connection use the already leased connection if available", async () => {
    const leasedConnection = await Base.leaseConnection();
    expect(Base.connectionPool().isActiveConnection()).toBeTruthy();

    await Base.withConnection(async (connection) => {
      expect(connection).toBe(leasedConnection);
      expect(await Base.leaseConnection()).toBe(connection);
    });

    expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
    expect(await Base.leaseConnection()).toBe(leasedConnection);
  });

  it("#with_connection is reentrant", async () => {
    const leasedConnection = await Base.leaseConnection();
    expect(Base.connectionPool().isActiveConnection()).toBeTruthy();

    await Base.withConnection(async (connection) => {
      expect(connection).toBe(leasedConnection);
      expect(await Base.leaseConnection()).toBe(connection);

      await Base.withConnection(async (connection2) => {
        expect(connection2).toBe(leasedConnection);
        expect(await Base.leaseConnection()).toBe(connection2);
      });
    });

    expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
    expect(await Base.leaseConnection()).toBe(leasedConnection);
  });

  it("#connection is a soft-deprecated alias to #lease_connection", async () => {
    setPermanentConnectionCheckout(true);

    Base.releaseConnection();
    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();

    let conn: unknown = null;
    await Base.withConnection(async (connection) => {
      conn = connection;
      expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
      for (let i = 0; i < 2; i++) {
        expect(await Base.connection).toBe(connection);
      }
    });

    expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
    expect(await Base.connection).toBe(conn);

    Base.releaseConnection();
  });

  it("#connection emits a deprecation warning if ActiveRecord.permanent_connection_checkout == :deprecated", async () => {
    setPermanentConnectionCheckout("deprecated");

    Base.releaseConnection();

    await assertDeprecated(deprecator(), async () => {
      await Base.connection;
    });

    await assertNotDeprecated(deprecator(), async () => {
      await Base.connection;
    });

    Base.releaseConnection();

    await assertDeprecated(deprecator(), async () => {
      await Base.connection;
    });

    Base.releaseConnection();

    await Base.withConnection(async () => {
      await assertDeprecated(deprecator(), async () => {
        await Base.connection;
      });
    });
  });

  it("#connection raises an error if ActiveRecord.permanent_connection_checkout == :disallowed", async () => {
    setPermanentConnectionCheckout("disallowed");
    Base.releaseConnection();

    await expect(Base.connection).rejects.toThrow(ActiveRecordError);

    await Base.withConnection(async () => {
      await expect(Base.connection).rejects.toThrow(ActiveRecordError);
    });

    await Base.leaseConnection();
    await expect(Base.connection).resolves.not.toThrow();
    Base.releaseConnection();
  });

  it("#connection doesn't make the lease permanent if inside #with_connection(prevent_permanent_checkout: true)", async () => {
    setPermanentConnectionCheckout("disallowed");
    Base.releaseConnection();

    await Base.withConnection(
      async (connection) => {
        expect(await Base.connection).toBe(connection);
      },
      { preventPermanentCheckout: true },
    );

    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();
  });

  it("common APIs don't permanently hold a connection when permanent checkout is deprecated or disallowed", async () => {
    setPermanentConnectionCheckout("deprecated");
    Base.releaseConnection();
    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();

    await Post.createBang({ title: "foo", body: "bar" });
    expect(Post.connectionPool().isActiveConnection()).toBeFalsy();

    await Post.first();
    expect(Post.connectionPool().isActiveConnection()).toBeFalsy();

    await Post.count();
    expect(Post.connectionPool().isActiveConnection()).toBeFalsy();
  });

  it("connected_to switches role for block", async () => {
    expect(currentRole.call(Base)).toBe("writing");
    Base.connectedTo({ role: "reading" }, () => {
      expect(currentRole.call(Base)).toBe("reading");
    });
    expect(currentRole.call(Base)).toBe("writing");
  });

  it("connected_to with reading role automatically prevents writes", async () => {
    expect(currentPreventingWrites.call(Base)).toBe(false);
    Base.connectedTo({ role: "reading" }, () => {
      expect(currentPreventingWrites.call(Base)).toBe(true);
    });
    expect(currentPreventingWrites.call(Base)).toBe(false);
  });

  it("connected_to switches shard for block", async () => {
    expect(currentShard.call(Base)).toBe("default");
    Base.connectedTo({ role: "writing", shard: "shard_one" }, () => {
      expect(currentShard.call(Base)).toBe("shard_one");
    });
    expect(currentShard.call(Base)).toBe("default");
  });

  it("connected_to? checks role and shard", async () => {
    expect(Base.isConnectedTo({ role: "writing" })).toBe(true);
    expect(Base.isConnectedTo({ role: "reading" })).toBe(false);
    Base.connectedTo({ role: "reading" }, () => {
      expect(Base.isConnectedTo({ role: "reading" })).toBe(true);
    });
  });

  it("while_preventing_writes", async () => {
    expect(currentPreventingWrites.call(Base)).toBe(false);
    Base.whilePreventingWrites(() => {
      expect(currentPreventingWrites.call(Base)).toBe(true);
    });
    expect(currentPreventingWrites.call(Base)).toBe(false);
  });

  it("prohibit_shard_swapping", async () => {
    expect(Base.isShardSwappingProhibited()).toBe(false);
    Base.prohibitShardSwapping(() => {
      expect(Base.isShardSwappingProhibited()).toBe(true);
      expect(() => {
        Base.connectedTo({ role: "writing", shard: "other" }, () => {});
      }).toThrow(/cannot swap.*shard/);
    });
    expect(Base.isShardSwappingProhibited()).toBe(false);
  });

  it("connection_specification_name defaults to Base", async () => {
    expect(Base.connectionSpecificationName).toBe("ActiveRecord::Base");
  });

  it("connection_specification_name returns 'Base' for a primary class even before connectsTo plants it", async () => {
    const { __resetPrimaryAbstractClass, primaryAbstractClass } = await import("./inheritance.js");
    class AppRecord extends Base {}
    try {
      __resetPrimaryAbstractClass();
      primaryAbstractClass(AppRecord);
      expect(Object.prototype.hasOwnProperty.call(AppRecord, "_connectionSpecificationName")).toBe(
        false,
      );
      expect(AppRecord.connectionSpecificationName).toBe("ActiveRecord::Base");
    } finally {
      __resetPrimaryAbstractClass();
    }
  });

  it("shard_keys and sharded?", async () => {
    expect(Base.shardKeys()).toEqual([]);
    expect(Base.isSharded()).toBe(false);
  });

  it("lease_connection and release_connection", async () => {
    const conn = await Base.leaseConnection();
    expect(conn).toBeTruthy();
    expect(Base.connectionPool().activeConnection).toBe(conn);
    Base.releaseConnection();
    expect(Base.connectionPool().isActiveConnection()).toBeNull();
  });

  it("connection_pool returns pool", async () => {
    const pool = Base.connectionPool();
    expect(pool).toBeTruthy();
    expect(pool.role).toBe("writing");
  });

  it("connection_db_config", async () => {
    expect(Base.connectionDbConfig()).toBe(Base.connectionPool().dbConfig);
    expect(Base.connectionDbConfig().adapter).toBeTruthy();
  });

  it("establish_connection with a url stores a UrlConfig with discrete fields", async () => {
    await Base.establishConnection({ adapter: "sqlite3", url: "sqlite3:db/discrete.sqlite3" });
    const config = Base.connectionDbConfig();
    expect(config.adapter).toBe("sqlite3");
    expect(config.database).toBe("db/discrete.sqlite3");
    expect(config.configurationHash).not.toHaveProperty("url");
    await restoreWorkerConnection();
  });

  it("is_connected?", async () => {
    const pool = Base.connectionPool();
    await (await pool.leaseConnection()).verifyBang();
    expect(Base.isConnected()).toBe(true);
    pool.releaseConnection();
  });

  it("connectsTo rejects both database and shards", async () => {
    await expect(
      Base.connectsTo({
        database: { writing: ":primary" },
        shards: { default: { writing: ":primary" } },
      }),
    ).rejects.toThrow(
      "`connects_to` can only accept a `database` or `shards` argument, but not both arguments.",
    );
  });

  it("connectedTo requires role or shard", async () => {
    expect(() => Base.connectedTo({}, () => {})).toThrow(/must provide/);
  });

  it("connectingTo pushes onto stack", async () => {
    Base.connectingTo({ role: "reading" });
    expect(currentRole.call(Base)).toBe("reading");
    connectedToStack().pop();
    expect(currentRole.call(Base)).toBe("writing");
  });

  it("connectedToMany switches for classes", async () => {
    class AbstractConn extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    Base.connectedToMany([AbstractConn], { role: "reading" }, () => {
      expect(currentRole.call(AbstractConn)).toBe("reading");
    });
    expect(currentRole.call(AbstractConn)).toBe("writing");
  });

  it("clear_query_caches_for_current_thread does not throw", async () => {
    expect(() => Base.clearQueryCachesForCurrentThread()).not.toThrow();
  });

  it("schema_cache and clear_cache_bang do not throw", async () => {
    expect(() => Base.schemaCache()).not.toThrow();
    expect(() => Base.clearCacheBang()).not.toThrow();
  });

  it("remove_connection removes the pool", async () => {
    const ambientDbConfig = Base.connectionDbConfig();
    expect(Base.connectionPool()).toBeTruthy();
    const removed = await Base.removeConnection();
    expect(removed).toBe(ambientDbConfig);
    expect(() => Base.connectionPool()).toThrow(/No database connection/);
    await restoreWorkerConnection();
  });

  it("remove_connection returns undefined when no pool exists", async () => {
    await Base.removeConnection();
    expect(await Base.removeConnection()).toBeUndefined();
    await restoreWorkerConnection();
  });

  it("connected_to stack is isolated per async context", async () => {
    let innerRoleBeforeAwait: string | undefined;
    let innerRoleAfterAwait: string | undefined;

    await new Thread(async () => {
      await Base.connectedTo({ role: "reading" }, async () => {
        innerRoleBeforeAwait = currentRole.call(Base);
        await Promise.resolve();
        innerRoleAfterAwait = currentRole.call(Base);
      });
    }).value();

    const outerRole = currentRole.call(Base);

    expect(innerRoleBeforeAwait).toBe("reading");
    expect(innerRoleAfterAwait).toBe("reading");
    expect(outerRole).toBe("writing");
    expect(connectedToStack()).toHaveLength(0);
  });

  it("prohibit_shard_swapping is isolated per async context", async () => {
    let resolveOverlap!: () => void;
    const overlap = new Promise<void>((resolve) => {
      resolveOverlap = resolve;
    });
    let prohibitedBeforeAwait: boolean | undefined;
    let prohibitedAfterAwait: boolean | undefined;
    let concurrentProhibited: boolean | undefined;

    const prohibitedTask = new Thread(async () => {
      await Base.prohibitShardSwapping(async () => {
        prohibitedBeforeAwait = Base.isShardSwappingProhibited();
        await Promise.resolve();
        prohibitedAfterAwait = Base.isShardSwappingProhibited();
        await overlap;
      });
    }).value();

    const concurrentTask = new Thread(async () => {
      await Promise.resolve();
      concurrentProhibited = Base.isShardSwappingProhibited();
      resolveOverlap();
    }).value();

    await Promise.all([prohibitedTask, concurrentTask]);

    expect(prohibitedBeforeAwait).toBe(true);
    expect(prohibitedAfterAwait).toBe(true);
    expect(concurrentProhibited).toBe(false);
    expect(Base.isShardSwappingProhibited()).toBe(false);
  });

  it("concurrent async contexts do not interfere", async () => {
    let resolveTask1!: () => void;
    const task1Gate = new Promise<void>((r) => {
      resolveTask1 = r;
    });
    let resolveTask2!: () => void;
    const task2Gate = new Promise<void>((r) => {
      resolveTask2 = r;
    });
    const results: string[] = [];

    const task1 = new Thread(async () => {
      await Base.connectedTo({ role: "reading" }, async () => {
        await Promise.resolve();
        results.push(`task1: ${currentRole.call(Base)}`);
        resolveTask2();
        await task1Gate;
      });
    }).value();

    const task2 = new Thread(async () => {
      await task2Gate;
      await Base.connectedTo({ role: "writing", shard: "shard_one" }, async () => {
        await Promise.resolve();
        results.push(`task2: ${currentRole.call(Base)}`);
        resolveTask1();
      });
    }).value();

    await Promise.all([task1, task2]);

    expect(results).toContain("task1: reading");
    expect(results).toContain("task2: writing");
    expect(currentRole.call(Base)).toBe("writing");
    expect(connectedToStack()).toHaveLength(0);
  });

  it("#connection returns the active connection inside withConnection", async () => {
    await Base.withConnection(async (leased) => {
      const conn = await Base.connection;
      expect(conn).toBe(leased);
    });
  });

  it("#isPrimaryClass returns true for Base", async () => {
    expect(Base.isPrimaryClass()).toBe(true);
  });

  it("#isPrimaryClass returns false for a normal model subclass", async () => {
    class Post extends Base {}
    expect(Post.isPrimaryClass()).toBe(false);
  });

  it.skipIf(adapterType !== "sqlite")(
    "#adapterClass resolves to the SQLite3Adapter constructor",
    async () => {
      expect(Base.adapterClass()).toBe(BetterSQLite3Adapter);
    },
  );

  it("autoConnect honors an in-memory DatabaseConfigurations registry", async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    const { HashConfig } = await import("./database-configurations/hash-config.js");
    const env = process.env.NODE_ENV || DatabaseTasks.env;

    const priorConfigs = Base.configurations();
    class InMemoryModel extends Base {}
    try {
      const inMemory = new DatabaseConfigurations([
        new HashConfig(env, "primary", {
          ...Base.connectionDbConfig().configurationHash,
          database: "db/common.sqlite3",
        }),
      ]);

      Base.configurations(inMemory);

      await InMemoryModel.establishConnection();
      expect(InMemoryModel.connectionPool().dbConfig.database).toBe("db/common.sqlite3");
      expect(InMemoryModel.adapterClass()).toBe(Base.adapterClass());
    } finally {
      await InMemoryModel.removeConnection();
      Base.configurations(priorConfigs);
    }
  });

  it("autoConnect reconnects via mutated configuration.database for UrlConfig", async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    const { UrlConfig } = await import("./database-configurations/url-config.js");
    const env = process.env.NODE_ENV || DatabaseTasks.env;

    const priorConfigs = Base.configurations();
    class WorkerModel extends Base {}
    try {
      const url = new UrlConfig(env, "primary", "sqlite3:db/foo.sqlite3");
      url._database = "db/foo-2.sqlite3";
      const inMemory = new DatabaseConfigurations([url]);

      Base.configurations(inMemory);

      await WorkerModel.establishConnection();
      const pool = WorkerModel.connectionPool();
      expect(pool.dbConfig.database).toBe("db/foo-2.sqlite3");
      const Klass = WorkerModel.adapterClass();
      const { BetterSQLite3Adapter } =
        await import("./connection-adapters/better-sqlite3-adapter.js");
      expect(Klass).toBe(BetterSQLite3Adapter);
    } finally {
      await WorkerModel.removeConnection();
      Base.configurations(priorConfigs);
    }
  });

  it("establishConnection raises AdapterNotSpecified for an adapter-less HashConfig", async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    const { HashConfig } = await import("./database-configurations/hash-config.js");
    const env = DatabaseTasks.env;

    const { AdapterNotSpecified } = await import("./errors.js");
    const configurationHash = { url: "sqlite3:db/foo.sqlite3" };
    const dbConfig = new HashConfig(env, "primary", configurationHash);
    expect(dbConfig.adapter).toBeUndefined();

    class BackfillModel extends Base {}
    try {
      await expect(BackfillModel.establishConnection(dbConfig as any)).rejects.toThrow(
        AdapterNotSpecified,
      );

      expect(dbConfig.configurationHash).toEqual(configurationHash);
      expect(Object.isFrozen(dbConfig.configurationHash)).toBe(true);
    } finally {
      await BackfillModel.removeConnection();
    }

    const resolved = new DatabaseConfigurations({}).resolve(configurationHash as any);
    expect(resolved.adapter).toBe("sqlite3");
  });
});

describe("withRoleAndShard loads Relation return values within scope (Story K gap 5)", () => {
  fixtures({}, { useTransactionalTests: false });

  it("calls .load() on a Relation returned from the block", async () => {
    const { withRoleAndShard } = await import("./connection-handling.js");
    let loadCalled = false;
    const fakeRelation = Object.assign(Object.create(Relation.prototype), {
      load() {
        loadCalled = true;
        return Promise.resolve(stripThenable(this));
      },
    });

    class FakeModel extends Base {}

    await withRoleAndShard.call(FakeModel as any, undefined, undefined, false, () => fakeRelation);

    expect(loadCalled).toBe(true);
  });

  it("does not call .load() on non-Relation return values", async () => {
    const { withRoleAndShard } = await import("./connection-handling.js");
    class FakeModel extends Base {}

    const result = await withRoleAndShard.call(
      FakeModel as any,
      undefined,
      undefined,
      false,
      () => 42,
    );

    expect(result).toBe(42);
  });

  it("calls .load() on a Relation returned from an async block", async () => {
    const { withRoleAndShard } = await import("./connection-handling.js");
    let loadCalled = false;
    const fakeRelation = Object.assign(Object.create(Relation.prototype), {
      load() {
        loadCalled = true;
        return Promise.resolve(stripThenable(this));
      },
    });

    class FakeModel extends Base {}

    await withRoleAndShard.call(FakeModel as any, undefined, undefined, false, async () =>
      stripThenable(fakeRelation),
    );

    expect(loadCalled).toBe(true);
  });
});

describe("AbstractAdapter#isPreventingWrites stack matching", () => {
  afterEach(async () => {
    connectedToStack().length = 0;
    for (const name of ["UnrelatedAbstract", "AnimalsRecord", "MealsRecord"]) {
      await Base.connectionHandler.removeConnectionPool(name);
    }
  });

  it("Base.connectedTo preventing writes applies globally to unrelated pools", async () => {
    class UnrelatedAbstract extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    await Base.connectionHandler.establishConnection(
      new HashConfig("test", "UnrelatedAbstract", { adapter: "sqlite3", database: ":memory:" }),
      { ownerName: "UnrelatedAbstract", role: "writing" },
    );
    const conn = await UnrelatedAbstract.leaseConnection();
    expect(conn.isPreventingWrites()).toBe(false);
    Base.connectedTo({ role: "writing", preventWrites: true }, () => {
      expect(conn.isPreventingWrites()).toBe(true);
    });
    expect(conn.isPreventingWrites()).toBe(false);
  });

  it("abstract-class connectedTo does not leak to unrelated pools", async () => {
    class AnimalsRecord extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
        this.connectionSpecificationName = "AnimalsRecord";
      }
    }
    class MealsRecord extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
        this.connectionSpecificationName = "MealsRecord";
      }
    }
    await Base.connectionHandler.establishConnection(
      new HashConfig("test", "AnimalsRecord", { adapter: "sqlite3", database: ":memory:" }),
      { ownerName: "AnimalsRecord", role: "writing" },
    );
    await Base.connectionHandler.establishConnection(
      new HashConfig("test", "MealsRecord", { adapter: "sqlite3", database: ":memory:" }),
      { ownerName: "MealsRecord", role: "writing" },
    );
    const animals = await AnimalsRecord.leaseConnection();
    const meals = await MealsRecord.leaseConnection();
    AnimalsRecord.connectedTo({ role: "writing", preventWrites: true }, () => {
      expect(animals.isPreventingWrites()).toBe(true);
      expect(meals.isPreventingWrites()).toBe(false);
    });
  });

  it("primary class connectedTo (after connectsTo) targets the Base-normalized pool", async () => {
    class ApplicationRecord extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
      static override isPrimaryClass(): boolean {
        return true;
      }
    }
    const handler = new ConnectionHandler();
    const appPool = await handler.establishConnection(
      new HashConfig("test", "ApplicationRecord", { adapter: "sqlite3", database: ":memory:" }),
      { ownerName: ApplicationRecord, role: "writing" },
    );
    const otherPool = await handler.establishConnection(
      new HashConfig("test", "OtherAbstract", { adapter: "sqlite3", database: ":memory:" }),
      { ownerName: "OtherAbstract", role: "writing" },
    );
    try {
      const appConn = await appPool.leaseConnection();
      const otherConn = await otherPool.leaseConnection();
      ApplicationRecord.connectedTo({ role: "writing", preventWrites: true }, () => {
        expect(appConn.isPreventingWrites()).toBe(true);
        expect(otherConn.isPreventingWrites()).toBe(false);
      });
    } finally {
      await handler.clearAllConnectionsBang();
    }
  });
});

describe("resolveConfigForConnection / connectsTo with unset configurations", () => {
  let prevBaseConfigs: DatabaseConfigurations;

  beforeEach(async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    prevBaseConfigs = Base.configurations();
  });

  afterEach(async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    Base.configurations(prevBaseConfigs);
    await Base.connectionHandler.clearAllConnectionsBang();
    delete (Base as any)._connectionSpecificationName;
    await restoreWorkerConnection();
  });

  it("unknown string config name raises AdapterNotSpecified with available-configs hint", async () => {
    const { resolveConfigForConnection } = await import("./connection-handling.js");
    const { AdapterNotSpecified } = await import("./errors.js");
    class Untouched extends Base {
      static {
        this.abstractClass = true;
      }
    }
    expect(() => resolveConfigForConnection.call(Untouched, ":missing_env")).toThrow(
      AdapterNotSpecified,
    );
    expect(() => resolveConfigForConnection.call(Untouched, ":missing_env")).toThrow(
      /`missing_env` database is not configured/,
    );
    expect(() => resolveConfigForConnection.call(Untouched, ":missing_env")).toThrow(
      /Available database configurations are:/,
    );
  });

  it("connectsTo plants _connectionSpecificationName (primary class normalizes to 'Base')", async () => {
    const { __resetPrimaryAbstractClass, primaryAbstractClass } = await import("./inheritance.js");
    let priorConfigs: ReturnType<typeof Base.configurations> | undefined;
    class AppRecord extends Base {}
    class SecondaryAbstract extends Base {
      static {
        this.abstractClass = true;
      }
    }
    try {
      __resetPrimaryAbstractClass();
      primaryAbstractClass(AppRecord);
      const env = DatabaseTasks.env;
      priorConfigs = Base.configurations();
      Base.configurations({
        [env]: { primary: { adapter: "sqlite3", database: "db/primary.sqlite3" } },
      });

      await AppRecord.connectsTo({ database: { writing: ":primary" } });
      expect((AppRecord as any)._connectionSpecificationName).toBe("ActiveRecord::Base");

      await SecondaryAbstract.connectsTo({ database: { writing: ":primary" } });
      expect((SecondaryAbstract as any)._connectionSpecificationName).toBe("SecondaryAbstract");
    } finally {
      await SecondaryAbstract.removeConnection();
      __resetPrimaryAbstractClass();
      if (priorConfigs) Base.configurations(priorConfigs);
      await restoreWorkerConnection();
    }
  });
});

describe("establish_connection accepts a DatabaseConfig", () => {
  class CapturedConfigModel extends Base {}

  afterEach(async () => {
    await CapturedConfigModel.removeConnection();
  });

  it("re-establishes the connection from the captured DatabaseConfig object", async () => {
    const config = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: "db/primary.sqlite3",
      pool: 5,
      reapingFrequency: null,
    });
    await Base.connectionHandler.establishConnection(config, { ownerName: "CapturedConfigModel" });
    CapturedConfigModel.connectionSpecificationName = "CapturedConfigModel";

    const captured = (await CapturedConfigModel.removeConnection())!;
    expect(captured).toBeInstanceOf(HashConfig);

    await CapturedConfigModel.establishConnection(captured);

    const restored = CapturedConfigModel.connectionDbConfig();
    expect(restored).toBe(captured);
    expect(restored.adapter).toBe("sqlite3");
    expect(restored.configurationHash.database).toBe("db/primary.sqlite3");
  });
});
