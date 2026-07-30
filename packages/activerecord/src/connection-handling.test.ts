import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base } from "./base.js";
import { withQueryConnection, threadedConnectionFor } from "./connection-handling.js";
import { ActiveRecord } from "./ar-config.js";
import { ActiveRecordError } from "./errors.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { fixtures } from "./test-fixtures.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";
import { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
import { Post } from "./test-helpers/models/post.js";
import {
  connectedToStack,
  currentRole,
  currentShard,
  currentPreventingWrites,
  withIsolatedConnectionState,
} from "./core.js";
import { setTrailsRoot } from "@blazetrails/activesupport";
import { adapterType } from "./test-adapter.js";
import { inMemoryDb } from "./support/adapter-helper.js";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";

async function restoreWorkerConnection(): Promise<void> {
  await Base.establishConnection("arunit");
}

describe("ConnectionHandlingTest", () => {
  // The opted-out cases assert the pool releases its connection, which
  // transactional fixtures defeat by pinning one for the wrapping transaction.
  fixtures(["posts"], {
    usesTransaction: [
      "common APIs don't permanently hold a connection when permanent checkout is deprecated or disallowed",
      "establish_connection with a url stores a UrlConfig with discrete fields",
      "remove_connection removes the pool",
      "remove_connection returns undefined when no pool exists",
    ],
  });

  let permanentConnectionCheckoutWas: true | "deprecated" | "disallowed";

  beforeEach(() => {
    permanentConnectionCheckoutWas = ActiveRecord.permanentConnectionCheckout;
  });

  afterEach(async () => {
    ActiveRecord.permanentConnectionCheckout = permanentConnectionCheckoutWas;
    connectedToStack().length = 0;
    // `common APIs ...` opts out of transactional fixtures, so its insert is
    // committed and would otherwise perturb the shared worker DB.
    await Post.where({ title: "foo" }).deleteAll();
  });

  it.skipIf(inMemoryDb())(
    "#with_connection lease the connection for the duration of the block",
    async () => {
      Base.releaseConnection();
      const pool = Base.connectionPool();
      expect(pool.activeConnection).toBeNull();
      await Base.withConnection((conn) => {
        expect(conn).toBeTruthy();
        expect(pool.activeConnection).toBeTruthy();
      });
    },
  );

  it.skipIf(inMemoryDb())(
    "#lease_connection makes the lease permanent even inside #with_connection",
    async () => {
      await Base.withConnection(async () => {
        const leased = await Base.leaseConnection();
        expect(leased).toBeTruthy();
      });
      // leaseConnection makes sticky=true, so connection persists
      expect(Base.connectionPool().activeConnection).toBeTruthy();
      Base.releaseConnection();
    },
  );

  it.skipIf(inMemoryDb())(
    "#lease_connection makes the lease permanent even inside #with_connection(prevent_permanent_checkout: true)",
    async () => {
      Base.releaseConnection();
      await Base.withConnection(
        async (connection) => {
          expect(await Base.leaseConnection()).toBe(connection);
        },
        { preventPermanentCheckout: true },
      );
      expect(Base.connectionPool().activeConnection).toBeNull();
    },
  );

  it.skipIf(inMemoryDb())(
    "#with_connection use the already leased connection if available",
    async () => {
      const leased = await Base.leaseConnection();
      await Base.withConnection((conn) => {
        expect(conn).toBe(leased);
      });
      Base.releaseConnection();
    },
  );

  it.skipIf(inMemoryDb())("#with_connection is reentrant", async () => {
    await Base.withConnection(async (outer) => {
      await Base.withConnection((inner) => {
        expect(inner).toBe(outer);
      });
    });
  });

  it.skipIf(inMemoryDb())(
    "#connection is a soft-deprecated alias to #lease_connection",
    async () => {
      ActiveRecord.permanentConnectionCheckout = true;
      Base.releaseConnection();
      expect(Base.connectionPool().activeConnection).toBeNull();

      let conn: unknown;
      await Base.withConnection(async (connection) => {
        conn = connection;
        expect(Base.connectionPool().activeConnection).toBeTruthy();
        expect(Base.connection).toBe(connection);
        expect(Base.connection).toBe(connection);
      });

      expect(Base.connectionPool().activeConnection).toBeTruthy();
      expect(Base.connection).toBe(conn);
      Base.releaseConnection();
    },
  );

  it.skipIf(inMemoryDb())(
    "#connection emits a deprecation warning if ActiveRecord.permanent_connection_checkout == :deprecated",
    async () => {
      ActiveRecord.permanentConnectionCheckout = "deprecated";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        Base.releaseConnection();

        void Base.connection;
        expect(warnSpy).toHaveBeenCalledTimes(1);
        warnSpy.mockClear();

        void Base.connection;
        expect(warnSpy).not.toHaveBeenCalled();

        Base.releaseConnection();

        void Base.connection;
        expect(warnSpy).toHaveBeenCalledTimes(1);
        warnSpy.mockClear();
        Base.releaseConnection();

        await Base.withConnection(async () => {
          void Base.connection;
          expect(warnSpy).toHaveBeenCalledTimes(1);
        });
      } finally {
        warnSpy.mockRestore();
      }
    },
  );

  it.skipIf(inMemoryDb())(
    "#connection raises an error if ActiveRecord.permanent_connection_checkout == :disallowed",
    async () => {
      ActiveRecord.permanentConnectionCheckout = "disallowed";
      Base.releaseConnection();

      expect(() => Base.connection).toThrow(ActiveRecordError);

      await Base.withConnection(async () => {
        expect(() => Base.connection).toThrow(ActiveRecordError);
      });

      await Base.leaseConnection();
      expect(() => Base.connection).not.toThrow();
      Base.releaseConnection();
    },
  );

  it.skipIf(inMemoryDb())(
    "#connection doesn't make the lease permanent if inside #with_connection(prevent_permanent_checkout: true)",
    async () => {
      ActiveRecord.permanentConnectionCheckout = "disallowed";
      Base.releaseConnection();

      await Base.withConnection(
        async (connection) => {
          expect(Base.connection).toBe(connection);
        },
        { preventPermanentCheckout: true },
      );

      expect(Base.connectionPool().activeConnection).toBeNull();
    },
  );

  it.skipIf(inMemoryDb())(
    "common APIs don't permanently hold a connection when permanent checkout is deprecated or disallowed",
    async () => {
      ActiveRecord.permanentConnectionCheckout = "deprecated";
      Base.releaseConnection();
      expect(Base.connectionPool().activeConnection).toBeNull();

      await Post.createBang({ title: "foo", body: "bar" });
      expect(Post.connectionPool().activeConnection).toBeNull();

      await Post.first();
      expect(Post.connectionPool().activeConnection).toBeNull();

      await Post.count();
      expect(Post.connectionPool().activeConnection).toBeNull();
    },
  );

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
    expect(Base.connectedToQ({ role: "writing" })).toBe(true);
    expect(Base.connectedToQ({ role: "reading" })).toBe(false);
    Base.connectedTo({ role: "reading" }, () => {
      expect(Base.connectedToQ({ role: "reading" })).toBe(true);
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
    expect(Base.connectionSpecificationName).toBe("Base");
  });

  it("connection_specification_name returns 'Base' for a primary class even before connectsTo plants it", async () => {
    const { __resetPrimaryAbstractClass, primaryAbstractClass } = await import("./inheritance.js");
    class AppRecord extends Base {}
    try {
      __resetPrimaryAbstractClass();
      primaryAbstractClass(AppRecord);
      // primaryClassQ() is true but _connectionSpecificationName has not been
      // planted yet (connectsTo not called) — the reader's primary-class
      // branch should still normalize to "Base".
      expect(Object.prototype.hasOwnProperty.call(AppRecord, "_connectionSpecificationName")).toBe(
        false,
      );
      expect(AppRecord.connectionSpecificationName).toBe("Base");
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
    expect(Base.connectionPool().activeConnection).toBeNull();
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

  // Rails' build_db_config_from_hash deletes :url before constructing the
  // UrlConfig, so configuration_hash carries the parsed discrete fields and
  // never the verbatim URL string. establish_connection({ adapter, url })
  // must mirror that shape, matching the resolver's "url removed from hash".
  // Only the primary pool exercises this path, so `Base`'s is swapped and
  // restored; under ARCONN=sqlite3_mem the restore would hand the worker a
  // fresh, EMPTY database, hence the skip.
  it.skipIf(inMemoryDb())(
    "establish_connection with a url stores a UrlConfig with discrete fields",
    async () => {
      await Base.establishConnection({ adapter: "sqlite3", url: "sqlite3:db/discrete.sqlite3" });
      const config = Base.connectionDbConfig();
      expect(config.adapter).toBe("sqlite3");
      expect(config.database).toBe("db/discrete.sqlite3");
      expect(config.configurationHash).not.toHaveProperty("url");
      await restoreWorkerConnection();
    },
  );

  it("is_connected?", async () => {
    const pool = Base.connectionPool();
    await (await pool.leaseConnection()).verifyBang();
    expect(Base.isConnectedQ()).toBe(true);
    pool.releaseConnection();
  });

  it("connectsTo rejects both database and shards", async () => {
    expect(() =>
      Base.connectsTo({
        database: { writing: "primary" },
        shards: { default: { writing: "primary" } },
      }),
    ).toThrow(
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

  // Both cases below remove `Base`'s pool: only the primary pool can be
  // observed going away (a subclass falls back to `Base`'s). Same restore and
  // in-memory skip as above.
  it.skipIf(inMemoryDb())("remove_connection removes the pool", async () => {
    const ambientDbConfig = Base.connectionDbConfig();
    expect(Base.connectionPool()).toBeTruthy();
    // Mirrors Rails `remove_connection`: returns the removed pool's db_config.
    const removed = Base.removeConnection();
    expect(removed).toBe(ambientDbConfig);
    expect(() => Base.connectionPool()).toThrow(/No database connection/);
    await restoreWorkerConnection();
  });

  it.skipIf(inMemoryDb())("remove_connection returns undefined when no pool exists", async () => {
    Base.removeConnection();
    expect(Base.removeConnection()).toBeUndefined();
    await restoreWorkerConnection();
  });

  it("connected_to stack is isolated per async context", async () => {
    let innerRoleBeforeAwait: string | undefined;
    let innerRoleAfterAwait: string | undefined;

    await withIsolatedConnectionState(async () => {
      await Base.connectedTo({ role: "reading" }, async () => {
        innerRoleBeforeAwait = currentRole.call(Base);
        await Promise.resolve();
        innerRoleAfterAwait = currentRole.call(Base);
      });
    });

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

    const prohibitedTask = withIsolatedConnectionState(async () => {
      await Base.prohibitShardSwapping(async () => {
        prohibitedBeforeAwait = Base.isShardSwappingProhibited();
        await Promise.resolve();
        prohibitedAfterAwait = Base.isShardSwappingProhibited();
        await overlap;
      });
    });

    const concurrentTask = withIsolatedConnectionState(async () => {
      await Promise.resolve();
      concurrentProhibited = Base.isShardSwappingProhibited();
      resolveOverlap();
    });

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

    const task1 = withIsolatedConnectionState(async () => {
      await Base.connectedTo({ role: "reading" }, async () => {
        await Promise.resolve();
        results.push(`task1: ${currentRole.call(Base)}`);
        resolveTask2();
        await task1Gate;
      });
    });

    const task2 = withIsolatedConnectionState(async () => {
      await task2Gate;
      await Base.connectedTo({ role: "writing", shard: "shard_one" }, async () => {
        await Promise.resolve();
        results.push(`task2: ${currentRole.call(Base)}`);
        resolveTask1();
      });
    });

    await Promise.all([task1, task2]);

    expect(results).toContain("task1: reading");
    expect(results).toContain("task2: writing");
    expect(currentRole.call(Base)).toBe("writing");
    expect(connectedToStack()).toHaveLength(0);
  });

  it("#isConnected delegates to isConnectedQ", async () => {
    expect(Base.isConnected()).toBe(Base.isConnectedQ());
  });

  it("#connection leases a connection when none is active", async () => {
    const pool = Base.connectionPool();
    Base.releaseConnection();
    expect(pool.activeConnection).toBeNull();
    const conn = Base.connection;
    expect(conn).toBeTruthy();
    expect(pool.activeConnection).toBeTruthy();
    Base.releaseConnection();
  });

  it("#connection returns the active connection inside withConnection", async () => {
    await Base.withConnection((leased) => {
      const conn = Base.connection;
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
      expect(await Base.adapterClass()).toBe(BetterSQLite3Adapter);
    },
  );

  // Mirrors Rails: `ActiveRecord::Base.establish_connection` with no args
  // reads from `Base.configurations` (the in-memory registry), not from
  // disk. Required so callers that mutate `configurations` in place (e.g.
  // `TestDatabases.create_and_load_schema`) actually reconnect to the
  // mutated config rather than picking up the original from
  // config/database.*.
  it("autoConnect honors an in-memory DatabaseConfigurations registry", async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    const { HashConfig } = await import("./database-configurations/hash-config.js");
    const env = process.env.NODE_ENV || DatabaseConfigurations.defaultEnv;

    // _currentConfigurations is a module-level singleton that the
    // DatabaseConfigurations constructor mutates as a side effect.
    // Snapshot it so test ordering can't pin the wrong registry.
    const priorCurrent = (DatabaseConfigurations as any).current;
    const priorConfigs = Base.configurations();
    try {
      const inMemory = new DatabaseConfigurations([
        new HashConfig(env, "primary", {
          ...Base.connectionDbConfig().configurationHash,
          database: "db/common.sqlite3",
        }),
      ]);

      // Rails' registry is one class variable, so the config goes on Base
      // even though the connection is established on the subclass.
      Base.configurations(inMemory);
      class InMemoryModel extends Base {}

      await InMemoryModel.establishConnection();
      expect(InMemoryModel.connectionPool().dbConfig.database).toBe("db/common.sqlite3");
      expect(await InMemoryModel.adapterClass()).toBe(await Base.adapterClass());
    } finally {
      Base.configurations(priorConfigs);
      (DatabaseConfigurations as any).current = priorCurrent;
    }
  });

  // Regression: a UrlConfig whose `_database` has been mutated in place
  // (TestDatabases.create_and_load_schema's parallel-worker pattern)
  // must reconnect to the mutated database, not the original URL. Rails
  // resolves from configuration_hash, not the raw URL.
  it("autoConnect reconnects via mutated configuration.database for UrlConfig", async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    const { UrlConfig } = await import("./database-configurations/url-config.js");
    const env = process.env.NODE_ENV || DatabaseConfigurations.defaultEnv;

    const priorCurrent = (DatabaseConfigurations as any).current;
    const priorConfigs = Base.configurations();
    try {
      const url = new UrlConfig(env, "primary", "sqlite3:db/foo.sqlite3");
      url._database = "db/foo-2.sqlite3"; // mimic worker-suffix mutation
      const inMemory = new DatabaseConfigurations([url]);

      Base.configurations(inMemory);
      class WorkerModel extends Base {}

      await WorkerModel.establishConnection();
      // The connection pool's resolved dbConfig must point at the
      // mutated database, not the original URL path. This is the
      // actual reconnect-target observation Copilot review #3 asked
      // for — without the URL-skip in autoConnect, this would surface
      // the original "db/foo.sqlite3" instead.
      const pool = WorkerModel.connectionPool();
      expect(pool.dbConfig.database).toBe("db/foo-2.sqlite3");
      const Klass = await WorkerModel.adapterClass();
      const { BetterSQLite3Adapter } =
        await import("./connection-adapters/better-sqlite3-adapter.js");
      expect(Klass).toBe(BetterSQLite3Adapter);
    } finally {
      Base.configurations(priorConfigs);
      (DatabaseConfigurations as any).current = priorCurrent;
    }
  });

  // The adapter backfill in establishWithDbConfig is only reached by an
  // adapter-less config carrying a derivable URL — a UrlConfig pre-infers the
  // adapter in buildUrlHash, so only a HashConfig gets here. Configuration
  // hashes are frozen, so the backfill has to replace the hash rather than
  // write into it.
  it("establishConnection backfills the adapter on an adapter-less HashConfig", async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    const { HashConfig } = await import("./database-configurations/hash-config.js");
    const env = DatabaseConfigurations.currentEnv();

    const dbConfig = new HashConfig(env, "primary", { url: "sqlite3:db/foo.sqlite3" });
    expect(dbConfig.adapter).toBeUndefined();

    class BackfillModel extends Base {}
    try {
      await BackfillModel.establishConnection(dbConfig as any);

      expect(dbConfig.adapter).toBe("sqlite");
      expect(Object.isFrozen(dbConfig.configurationHash)).toBe(true);
      const pool = BackfillModel.connectionPool();
      expect(pool.dbConfig).toBe(dbConfig);
      // Never checked out — db/foo.sqlite3 must not be created by this test.
      expect(pool.activeConnection).toBeNull();
    } finally {
      BackfillModel.removeConnection();
    }
  });
});

describe("withRoleAndShard loads Relation return values within scope (Story K gap 5)", () => {
  fixtures({}, { useTransactionalTests: false });

  it("calls .load() on a Relation returned from the block", async () => {
    const { withRoleAndShard } = await import("./connection-handling.js");
    let loadCalled = false;
    const fakeRelation = {
      load() {
        loadCalled = true;
        return Promise.resolve(this);
      },
      toArray() {
        return Promise.resolve([]);
      },
    };

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
    const fakeRelation = {
      load() {
        loadCalled = true;
        return Promise.resolve(this);
      },
      toArray() {
        return Promise.resolve([]);
      },
    };

    class FakeModel extends Base {}

    await withRoleAndShard.call(
      FakeModel as any,
      undefined,
      undefined,
      false,
      async () => fakeRelation,
    );

    expect(loadCalled).toBe(true);
  });
});

describe("AbstractAdapter#isPreventingWrites stack matching", () => {
  // Each case establishes its own abstract-class pools; tear down exactly those
  // rather than clearing every pool, which would take `Base`'s ambient worker
  // connection with it.
  afterEach(async () => {
    connectedToStack().length = 0;
    for (const name of ["UnrelatedAbstract", "AnimalsRecord", "MealsRecord"]) {
      Base.connectionHandler.removeConnectionPool(name);
    }
  });

  it("Base.connectedTo preventing writes applies globally to unrelated pools", async () => {
    class UnrelatedAbstract extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    const pool = Base.connectionHandler.establishConnection(
      new HashConfig("test", "UnrelatedAbstract", { adapter: "sqlite3", database: ":memory:" }),
      { owner: "UnrelatedAbstract", role: "writing" },
    );
    await pool.adapterReady;
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
      }
    }
    class MealsRecord extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    const animalsPool = Base.connectionHandler.establishConnection(
      new HashConfig("test", "AnimalsRecord", { adapter: "sqlite3", database: ":memory:" }),
      { owner: "AnimalsRecord", role: "writing" },
    );
    const mealsPool = Base.connectionHandler.establishConnection(
      new HashConfig("test", "MealsRecord", { adapter: "sqlite3", database: ":memory:" }),
      { owner: "MealsRecord", role: "writing" },
    );
    await Promise.all([animalsPool.adapterReady, mealsPool.adapterReady]);
    const animals = await AnimalsRecord.leaseConnection();
    const meals = await MealsRecord.leaseConnection();
    AnimalsRecord.connectedTo({ role: "writing", preventWrites: true }, () => {
      expect(animals.isPreventingWrites()).toBe(true);
      expect(meals.isPreventingWrites()).toBe(false);
    });
  });

  it("primary class connectedTo (after connectsTo) targets the Base-normalized pool", async () => {
    // Realistic primary-class flow: primaryAbstractClass marks abstract, then
    // connectsTo sets connectionClass=true so connectionClassForSelf walks no
    // further than ApplicationRecord. PoolConfig normalizes the descriptor
    // name to "Base"; the matcher must match the primary-class scope entry
    // (klasses=[ApplicationRecord]) against that normalized "Base" pool name.
    class ApplicationRecord extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
      static override primaryClassQ(): boolean {
        return true;
      }
    }
    // The "Base"-normalized pool name collides with the ambient worker pool, so
    // both pools live on an isolated handler and the connections are leased off
    // the pools directly — establishing them on `Base.connectionHandler` would
    // displace the worker connection for the rest of the file.
    const handler = new ConnectionHandler();
    const appPool = handler.establishConnection(
      new HashConfig("test", "ApplicationRecord", { adapter: "sqlite3", database: ":memory:" }),
      { owner: ApplicationRecord, role: "writing" },
    );
    const otherPool = handler.establishConnection(
      new HashConfig("test", "OtherAbstract", { adapter: "sqlite3", database: ":memory:" }),
      { owner: "OtherAbstract", role: "writing" },
    );
    try {
      await Promise.all([appPool.adapterReady, otherPool.adapterReady]);
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
  let prevCurrentConfigs: unknown;
  let prevBaseConfigs: DatabaseConfigurations;

  beforeEach(async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    prevCurrentConfigs = (DatabaseConfigurations as any).current;
    prevBaseConfigs = Base.configurations();
  });

  afterEach(async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    // fromEnv({}) mutates DatabaseConfigurations.current (the primary-config
    // registry HashConfig#isPrimary consults), so save and restore it here
    // — clearing connections alone leaves a stale primary registry behind.
    (DatabaseConfigurations as any).current = prevCurrentConfigs;
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
    // No `Untouched.configurations` assigned — resolving an unknown env name
    // against the empty default registry must surface AdapterNotSpecified
    // rather than passing the string through.
    expect(() => resolveConfigForConnection.call(Untouched, "missing_env")).toThrow(
      AdapterNotSpecified,
    );
    expect(() => resolveConfigForConnection.call(Untouched, "missing_env")).toThrow(
      /`missing_env` database is not configured/,
    );
    // Pin the available-configurations hint — regressions in the hint
    // wording shouldn't slip through.
    expect(() => resolveConfigForConnection.call(Untouched, "missing_env")).toThrow(
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
      const env = DatabaseConfigurations.currentEnv();
      priorConfigs = Base.configurations();
      Base.configurations({
        [env]: { primary: { adapter: "sqlite3", database: "db/primary.sqlite3" } },
      });

      // Exercises the public connectsTo path so the
      // resolveConfigForConnection side effect (planting
      // _connectionSpecificationName) is covered end-to-end.
      AppRecord.connectsTo({ database: { writing: "primary" } });
      expect((AppRecord as any)._connectionSpecificationName).toBe("Base");

      SecondaryAbstract.connectsTo({ database: { writing: "primary" } });
      expect((SecondaryAbstract as any)._connectionSpecificationName).toBe("SecondaryAbstract");
    } finally {
      __resetPrimaryAbstractClass();
      if (priorConfigs) Base.configurations(priorConfigs);
    }
  });
});

// trails-internal mechanism (no Rails counterpart): the connection threaded by
// `withQueryConnection` is only adopted by a model's internal reads when it
// belongs to *that model's own pool*, so a statement for a different-pool model
// running inside an outer wrap (cross-database eager-load, or `update_columns`
// inside another model's `transaction` block) resolves against its own pool
// rather than the foreign threaded connection.
describe("threadedConnectionFor pool-identity guard", () => {
  class Secondary extends Base {}

  beforeEach(async () => {
    Base.connectionHandler.establishConnection(
      new HashConfig("test", "primary", {
        adapter: "sqlite3",
        database: "secondary.db",
        pool: 5,
        reapingFrequency: null,
      }),
      { owner: "Secondary" },
    );
    Secondary.connectionSpecificationName = "Secondary";
  });

  // `Base` keeps riding the ambient worker pool, so only `Secondary`'s own
  // pool is torn down and nothing here needs a re-establish.
  afterEach(async () => {
    Base.connectionHandler.removeConnectionPool("Secondary");
  });

  it("adopts the threaded connection for its own pool but not a foreign pool", async () => {
    await withQueryConnection(Base, async () => {
      const threaded = Base.connectionPool().activeConnection;
      expect(threaded).toBeTruthy();
      // Same pool: the threaded connection is adopted.
      expect(threadedConnectionFor(Base)).toBe(threaded);
      // Foreign pool with no active connection of its own: not adopted, so the
      // caller falls back to resolving against Secondary's own pool.
      expect(Secondary.connectionPool().activeConnection).toBeNull();
      expect(threadedConnectionFor(Secondary)).toBeNull();
    });
  });

  it("returns null outside any withQueryConnection wrap", async () => {
    expect(threadedConnectionFor(Base)).toBeNull();
  });
});

describe("establish_connection accepts a DatabaseConfig", () => {
  // The round trip under test is observable on any class with a pool of its
  // own, so this drives its own model rather than swapping `Base`'s pool.
  class CapturedConfigModel extends Base {}

  afterEach(async () => {
    CapturedConfigModel.removeConnection();
  });

  // Mirrors Rails `establish_connection(db_config)` (the faithful
  // `run_without_connection` restore): the object captured by
  // `remove_connection` can be handed straight back to `establish_connection`,
  // and the pool stores that same object as its db_config.
  it("re-establishes the connection from the captured DatabaseConfig object", async () => {
    const config = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: "db/primary.sqlite3",
      pool: 5,
      reapingFrequency: null,
    });
    Base.connectionHandler.establishConnection(config, { owner: "CapturedConfigModel" });
    CapturedConfigModel.connectionSpecificationName = "CapturedConfigModel";

    const captured = CapturedConfigModel.removeConnection()!;
    expect(captured).toBeInstanceOf(HashConfig);

    await CapturedConfigModel.establishConnection(captured);

    const restored = CapturedConfigModel.connectionDbConfig();
    expect(restored).toBe(captured);
    expect(restored.adapter).toBe("sqlite3");
    expect(restored.configurationHash.database).toBe("db/primary.sqlite3");
  });
});

describe("loadConfigFile resolves config/database.* against Trails.root", () => {
  let tmpRoot: string;

  class RootConfigModel extends Base {}

  // See establish-connection.test.ts: the worker's setup file assigns
  // `Base.configurations`, which short-circuits the config-file lookup this
  // seam exists to exercise.
  const originalConfigurations = Base.configurations();

  beforeEach(() => {
    Base.configurations({});
  });

  // `Base`'s pool is never touched here, only its `configurations` registry.
  afterEach(async () => {
    setTrailsRoot(null);
    Base.configurations(originalConfigurations);
    RootConfigModel.removeConnection();
    if (tmpRoot) nodeFs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // Mirrors Rails' optional `Rails.root` seam: a relative `config/database.*`
  // is loaded from the application root when `Trails.root` is set, rather than
  // the raw process cwd.
  it("loads config/database.json from the injected root", async () => {
    tmpRoot = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "ar-trails-root-"));
    nodeFs.mkdirSync(nodePath.join(tmpRoot, "config"));
    nodeFs.writeFileSync(
      nodePath.join(tmpRoot, "config", "database.json"),
      JSON.stringify({ test: { adapter: "sqlite3", database: "db/primary.sqlite3" } }),
    );
    setTrailsRoot(tmpRoot);

    await RootConfigModel.establishConnection();

    const dbConfig = RootConfigModel.connectionDbConfig();
    expect(dbConfig.adapter).toBe("sqlite3");
    expect(dbConfig.configurationHash.database).toBe("db/primary.sqlite3");
  });
});
