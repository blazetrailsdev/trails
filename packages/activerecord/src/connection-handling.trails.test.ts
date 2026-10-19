import { Thread } from "@blazetrails/ruby-compat";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stripThenable } from "@blazetrails/activesupport";
import { Nodes } from "@blazetrails/arel";
import { Base } from "./base.js";
import { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
import { leaseConnection, withConnection, connection } from "./connection-handling.js";
import { adapterDouble, establishConnectionTo } from "./test-helpers/adapter-double.js";
import { permanentConnectionCheckout, setPermanentConnectionCheckout } from "./active-record.js";
import { Relation } from "./relation.js";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";
import { connectedToStack, currentRole, currentShard, currentPreventingWrites } from "./core.js";
import { adapterType } from "./test-adapter.js";
import { restoreWorkerConnection } from "./support/connection.js";
import { DEFAULT_ENV } from "./connection-handling.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { UrlConfig } from "./database-configurations/url-config.js";
import { AdapterNotSpecified } from "./errors.js";

describe("directly bound adapter", () => {
  fixtures({}, { useTransactionalTests: false });
  it("connection, leaseConnection and withConnection resolve to the same session", async () => {
    class Boundish extends Base {}
    const bound = adapterDouble();
    await establishConnectionTo(Boundish, bound);

    const leased = await leaseConnection.call(Boundish as unknown as typeof Base);
    const direct = await connection.call(Boundish as unknown as typeof Base);
    const scoped = await withConnection.call(Boundish as unknown as typeof Base, (conn) => conn);

    expect(direct).toBe(bound);
    expect(leased).toBe(bound);
    expect(scoped).toBe(bound);
  });
});

describe("connection without a threaded lease", () => {
  it("checks one out, as lease_connection does", async () => {
    const was = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
    try {
      Base.releaseConnection();
      const conn = await Base.connection;
      expect(conn).toBeTruthy();
      expect(Base.connectionPool().activeConnection).toBe(conn);
      expect(Base.connectionPool().isPermanentLease()).toBe(false);
    } finally {
      Base.releaseConnection();
      setPermanentConnectionCheckout(was);
    }
  });

  it("makes a connection threaded by withConnection permanent, as lease_connection does", async () => {
    const was = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
    try {
      Base.releaseConnection();
      const conn = await Base.withConnection(async (connection) => {
        expect(await Base.connection).toBe(connection);
        return connection;
      });
      expect(Base.connectionPool().activeConnection).toBe(conn);
    } finally {
      Base.releaseConnection();
      setPermanentConnectionCheckout(was);
    }
  });
});

describe("Arel toSql through Table.engine", () => {
  fixtures({}, { useTransactionalTests: false });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("borrows a connection for the visit and returns it to the pool", () => {
    Base.releaseConnection();
    const pool = Base.connectionPool();
    expect(pool.activeConnection).toBeNull();

    expect(new Nodes.SqlLiteral("1").eq(1).toSql()).toBe("1 = 1");

    expect(pool.activeConnection).toBeNull();
    expect(pool.isPermanentLease()).toBe(true);
  });

  it("keeps a lease the block made sticky, as connection_pool.rb:421 checks after yielding", () => {
    Base.releaseConnection();
    const pool = Base.connectionPool();
    const leased = pool.withConnectionSync((conn) => {
      void pool.leaseConnection();
      return conn;
    });
    try {
      expect(pool.activeConnection).toBe(leased);
    } finally {
      Base.releaseConnection();
    }
  });

  it("restores the lease when the checkout itself raises", () => {
    Base.releaseConnection();
    const pool = Base.connectionPool();
    vi.spyOn(pool, "acquireConnectionSync").mockImplementation(() => {
      throw new Error("checkout failed");
    });
    expect(() => pool.withConnectionSync((conn) => conn)).toThrow("checkout failed");
    expect(pool.activeConnection).toBeNull();
    expect(pool.isPermanentLease()).toBe(true);
  });
});

describe("withRoleAndShard return value", () => {
  fixtures(["topics"]);

  it("loads a Relation the block returns and settles to that relation", async () => {
    const relation = Topic.all();
    const returned = await Base.connectedTo({ role: "writing" }, () => relation);

    expect(returned).toBeInstanceOf(Relation);
    expect((returned as unknown as Relation<Topic>).isLoaded).toBe(true);
    expect(relation.isLoaded).toBe(true);
  });

  it("does not load a non-Relation that answers load and toArray", async () => {
    const load = vi.fn();
    const duck = { load, toArray: () => [] };
    const returned = Base.connectedTo({ role: "writing" }, () => duck);

    expect(returned).toBe(duck);
    expect(load).not.toHaveBeenCalled();
  });
});

describe("ConnectionHandling", () => {
  fixtures(["posts"], {
    usesTransaction: [
      "establish_connection with a url stores a UrlConfig with discrete fields",
      "remove_connection removes the pool",
      "remove_connection returns undefined when no pool exists",
      "establishConnection raises AdapterNotSpecified for an adapter-less HashConfig",
      "autoConnect honors an in-memory DatabaseConfigurations registry",
      "autoConnect reconnects via mutated configuration.database for UrlConfig",
    ],
  });

  afterEach(() => {
    connectedToStack().length = 0;
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
    expect(Base.isShardSwappingProhibited()).toBeNull();
    Base.prohibitShardSwapping(() => {
      expect(Base.isShardSwappingProhibited()).toBe(true);
      expect(() => {
        Base.connectedTo({ role: "writing", shard: "other" }, () => {});
      }).toThrow(/cannot swap.*shard/);
    });
    expect(Base.isShardSwappingProhibited()).toBeNull();
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
      expect(Object.hasOwn(AppRecord, "_connectionSpecificationName")).toBe(false);
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
    let prohibitedBeforeAwait: boolean | null | undefined;
    let prohibitedAfterAwait: boolean | null | undefined;
    let concurrentProhibited: boolean | null | undefined;

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
    expect(concurrentProhibited).toBeNull();
    expect(Base.isShardSwappingProhibited()).toBeNull();
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

  it("#isPrimaryClass returns true for Base", async () => {
    expect(Base.isPrimaryClass()).toBe(true);
  });

  it("#isPrimaryClass returns false for a normal model subclass", async () => {
    class Post extends Base {}
    expect(Post.isPrimaryClass()).toBeFalsy();
  });

  it.skipIf(adapterType !== "sqlite")(
    "#adapterClass resolves to the SQLite3Adapter constructor",
    async () => {
      expect(Base.adapterClass()).toBe(BetterSQLite3Adapter);
    },
  );

  it("autoConnect honors an in-memory DatabaseConfigurations registry", async () => {
    const priorConfigs = Base.configurations();
    class InMemoryModel extends Base {}
    try {
      const inMemory = new DatabaseConfigurations([
        new HashConfig(DEFAULT_ENV(), "primary", {
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
    const priorConfigs = Base.configurations();
    class WorkerModel extends Base {}
    try {
      const url = new UrlConfig(DEFAULT_ENV(), "primary", "sqlite3:db/foo.sqlite3");
      url._database = "db/foo-2.sqlite3";
      const inMemory = new DatabaseConfigurations([url]);

      Base.configurations(inMemory);

      await WorkerModel.establishConnection();
      const pool = WorkerModel.connectionPool();
      expect(pool.dbConfig.database).toBe("db/foo-2.sqlite3");
      const Klass = WorkerModel.adapterClass();
      expect(Klass).toBe(BetterSQLite3Adapter);
    } finally {
      await WorkerModel.removeConnection();
      Base.configurations(priorConfigs);
    }
  });

  it("establishConnection raises AdapterNotSpecified for an adapter-less HashConfig", async () => {
    const configurationHash = { url: "sqlite3:db/foo.sqlite3" };
    const dbConfig = new HashConfig(DEFAULT_ENV(), "primary", configurationHash);
    expect(dbConfig.adapter).toBeUndefined();

    class BackfillModel extends Base {}
    try {
      await expect(BackfillModel.establishConnection(dbConfig)).rejects.toThrow(
        AdapterNotSpecified,
      );

      expect(dbConfig.configurationHash).toEqual(configurationHash);
      expect(Object.isFrozen(dbConfig.configurationHash)).toBe(true);
    } finally {
      await BackfillModel.removeConnection();
    }

    const resolved = new DatabaseConfigurations({}).resolve(configurationHash)!;
    expect(resolved.adapter).toBe("sqlite3");
  });
});

describe("withRoleAndShard loads Relation return values within scope (Story K gap 5)", () => {
  it("an overlapping async block removes its own entry when it settles first", async () => {
    const { withRoleAndShard } = await import("./connection-handling.js");
    class FakeModel extends Base {}
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const seen: (string | undefined)[] = [];

    const outer = withRoleAndShard.call(FakeModel, "outer", undefined, false, async () => {
      await Promise.resolve();
    });
    const inner = withRoleAndShard.call(FakeModel, "inner", undefined, false, async () => {
      await gate;
      seen.push(connectedToStack().at(-1)?.role);
    });
    await outer;
    release();
    await inner;

    expect(seen).toEqual(["inner"]);
    expect(connectedToStack().some((entry) => entry.role === "outer")).toBe(false);
    expect(connectedToStack().some((entry) => entry.role === "inner")).toBe(false);
  });

  it("connected_to_many raises ArgumentError without a role", () => {
    class AbstractConn extends Base {}
    expect(() => Base.connectedToMany([AbstractConn], {} as never, () => {})).toThrow(
      "missing keyword: :role",
    );
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

    await withRoleAndShard.call(FakeModel, undefined, undefined, false, async () =>
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

  beforeEach(() => {
    prevBaseConfigs = Base.configurations();
  });

  afterEach(async () => {
    Base.configurations(prevBaseConfigs);
    await Base.connectionHandler.clearAllConnectionsBang();
    Reflect.deleteProperty(Base, "_connectionSpecificationName");
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
      const env = DEFAULT_ENV();
      priorConfigs = Base.configurations();
      Base.configurations({
        [env]: { primary: { adapter: "sqlite3", database: "db/primary.sqlite3" } },
      });

      await AppRecord.connectsTo({ database: { writing: ":primary" } });
      expect(Reflect.get(AppRecord, "_connectionSpecificationName")).toBe("ActiveRecord::Base");

      await SecondaryAbstract.connectsTo({ database: { writing: ":primary" } });
      expect(Reflect.get(SecondaryAbstract, "_connectionSpecificationName")).toBe(
        "SecondaryAbstract",
      );
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
