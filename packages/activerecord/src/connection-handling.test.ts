import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { SQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import { Table, Visitors, setToSqlVisitor } from "@blazetrails/arel";
import {
  connectedToStack,
  currentRole,
  currentShard,
  currentPreventingWrites,
  withIsolatedConnectionState,
} from "./core.js";

function setupConnection() {
  const config = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    pool: 5,
    reapingFrequency: null,
  });
  Base.connectionHandler.establishConnection(config, { owner: "Base" });
}

describe("ConnectionHandlingTest", () => {
  beforeEach(() => {
    setupConnection();
  });

  afterEach(() => {
    connectedToStack().length = 0;
    Base.connectionHandler.clearAllConnectionsBang();
  });

  it("#with_connection lease the connection for the duration of the block", async () => {
    const pool = Base.connectionPool();
    expect(pool.activeConnection).toBeNull();
    await Base.withConnection((conn) => {
      expect(conn).toBeTruthy();
      expect(pool.activeConnection).toBeTruthy();
    });
  });

  it("#lease_connection makes the lease permanent even inside #with_connection", async () => {
    await Base.withConnection(() => {
      const leased = Base.leaseConnection();
      expect(leased).toBeTruthy();
    });
    // leaseConnection makes sticky=true, so connection persists
    expect(Base.connectionPool().activeConnection).toBeTruthy();
    Base.releaseConnection();
  });

  it.skip("#lease_connection makes the lease permanent even inside #with_connection(prevent_permanent_checkout: true)", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in connection-handling
    // ROOT-CAUSE: connection-adapters/abstract/connection-pool.ts or abstract/connection-handler.ts missing Rails parity for ConnectionHandlingTest
    // SCOPE: ~50–100 LOC fix in connection-adapters/abstract/connection-pool.ts; affects ~10–24 tests in connection-handling.test.ts
  });

  it("#with_connection use the already leased connection if available", async () => {
    const leased = Base.leaseConnection();
    await Base.withConnection((conn) => {
      expect(conn).toBe(leased);
    });
    Base.releaseConnection();
  });

  it("#with_connection is reentrant", async () => {
    await Base.withConnection(async (outer) => {
      await Base.withConnection((inner) => {
        expect(inner).toBe(outer);
      });
    });
  });

  it.skip("#connection is a soft-deprecated alias to #lease_connection", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in connection-handling
    // ROOT-CAUSE: connection-adapters/abstract/connection-pool.ts or abstract/connection-handler.ts missing Rails parity for ConnectionHandlingTest
    // SCOPE: ~50–100 LOC fix in connection-adapters/abstract/connection-pool.ts; affects ~10–24 tests in connection-handling.test.ts
  });
  it.skip("#connection emits a deprecation warning if ActiveRecord.permanent_connection_checkout == :deprecated", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in connection-handling
    // ROOT-CAUSE: connection-adapters/abstract/connection-pool.ts or abstract/connection-handler.ts missing Rails parity for ConnectionHandlingTest
    // SCOPE: ~50–100 LOC fix in connection-adapters/abstract/connection-pool.ts; affects ~10–24 tests in connection-handling.test.ts
  });
  it.skip("#connection raises an error if ActiveRecord.permanent_connection_checkout == :disallowed", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in connection-handling
    // ROOT-CAUSE: connection-adapters/abstract/connection-pool.ts or abstract/connection-handler.ts missing Rails parity for ConnectionHandlingTest
    // SCOPE: ~50–100 LOC fix in connection-adapters/abstract/connection-pool.ts; affects ~10–24 tests in connection-handling.test.ts
  });
  it.skip("#connection doesn't make the lease permanent if inside #with_connection(prevent_permanent_checkout: true)", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in connection-handling
    // ROOT-CAUSE: connection-adapters/abstract/connection-pool.ts or abstract/connection-handler.ts missing Rails parity for ConnectionHandlingTest
    // SCOPE: ~50–100 LOC fix in connection-adapters/abstract/connection-pool.ts; affects ~10–24 tests in connection-handling.test.ts
  });
  it.skip("common APIs don't permanently hold a connection when permanent checkout is deprecated or disallowed", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in connection-handling
    // ROOT-CAUSE: connection-adapters/abstract/connection-pool.ts or abstract/connection-handler.ts missing Rails parity for ConnectionHandlingTest
    // SCOPE: ~50–100 LOC fix in connection-adapters/abstract/connection-pool.ts; affects ~10–24 tests in connection-handling.test.ts
  });

  it("connected_to switches role for block", () => {
    expect(currentRole.call(Base)).toBe("writing");
    Base.connectedTo({ role: "reading" }, () => {
      expect(currentRole.call(Base)).toBe("reading");
    });
    expect(currentRole.call(Base)).toBe("writing");
  });

  it("connected_to with reading role automatically prevents writes", () => {
    expect(currentPreventingWrites.call(Base)).toBe(false);
    Base.connectedTo({ role: "reading" }, () => {
      expect(currentPreventingWrites.call(Base)).toBe(true);
    });
    expect(currentPreventingWrites.call(Base)).toBe(false);
  });

  it("connected_to switches shard for block", () => {
    expect(currentShard.call(Base)).toBe("default");
    Base.connectedTo({ role: "writing", shard: "shard_one" }, () => {
      expect(currentShard.call(Base)).toBe("shard_one");
    });
    expect(currentShard.call(Base)).toBe("default");
  });

  it("connected_to? checks role and shard", () => {
    expect(Base.connectedToQ({ role: "writing" })).toBe(true);
    expect(Base.connectedToQ({ role: "reading" })).toBe(false);
    Base.connectedTo({ role: "reading" }, () => {
      expect(Base.connectedToQ({ role: "reading" })).toBe(true);
    });
  });

  it("while_preventing_writes", () => {
    expect(currentPreventingWrites.call(Base)).toBe(false);
    Base.whilePreventingWrites(() => {
      expect(currentPreventingWrites.call(Base)).toBe(true);
    });
    expect(currentPreventingWrites.call(Base)).toBe(false);
  });

  it("prohibit_shard_swapping", () => {
    expect(Base.isShardSwappingProhibited()).toBe(false);
    Base.prohibitShardSwapping(() => {
      expect(Base.isShardSwappingProhibited()).toBe(true);
      expect(() => {
        Base.connectedTo({ role: "writing", shard: "other" }, () => {});
      }).toThrow(/cannot swap.*shard/);
    });
    expect(Base.isShardSwappingProhibited()).toBe(false);
  });

  it("connection_specification_name defaults to Base", () => {
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

  it("shard_keys and sharded?", () => {
    expect(Base.shardKeys()).toEqual([]);
    expect(Base.isSharded()).toBe(false);
  });

  it("lease_connection and release_connection", () => {
    const conn = Base.leaseConnection();
    expect(conn).toBeTruthy();
    expect(Base.connectionPool().activeConnection).toBe(conn);
    Base.releaseConnection();
    expect(Base.connectionPool().activeConnection).toBeNull();
  });

  it("connection_pool returns pool", () => {
    const pool = Base.connectionPool();
    expect(pool).toBeTruthy();
    expect(pool.role).toBe("writing");
  });

  it("connection_db_config", () => {
    const config = Base.connectionDbConfig();
    expect(config.adapter).toBe("sqlite3");
  });

  it("is_connected?", () => {
    const pool = Base.connectionPool();
    pool.leaseConnection();
    expect(Base.isConnectedQ()).toBe(true);
    pool.releaseConnection();
  });

  it("connectsTo rejects both database and shards", () => {
    expect(() =>
      Base.connectsTo({
        database: { writing: "primary" },
        shards: { default: { writing: "primary" } },
      }),
    ).toThrow(
      "`connects_to` can only accept a `database` or `shards` argument, but not both arguments.",
    );
  });

  it("connectedTo requires role or shard", () => {
    expect(() => Base.connectedTo({}, () => {})).toThrow(/must provide/);
  });

  it("connectingTo pushes onto stack", () => {
    Base.connectingTo({ role: "reading" });
    expect(currentRole.call(Base)).toBe("reading");
    connectedToStack().pop();
    expect(currentRole.call(Base)).toBe("writing");
  });

  it("connectedToMany switches for classes", () => {
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

  it("clear_query_caches_for_current_thread does not throw", () => {
    expect(() => Base.clearQueryCachesForCurrentThread()).not.toThrow();
  });

  it("schema_cache and clear_cache_bang do not throw", () => {
    expect(() => Base.schemaCache()).not.toThrow();
    expect(() => Base.clearCacheBang()).not.toThrow();
  });

  it("remove_connection removes the pool", () => {
    expect(Base.connectionPool()).toBeTruthy();
    Base.removeConnection();
    expect(() => Base.connectionPool()).toThrow(/No database connection/);
    // Re-establish for other tests
    setupConnection();
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

  it("#isConnected delegates to isConnectedQ", () => {
    expect(Base.isConnected()).toBe(Base.isConnectedQ());
  });

  it("#connection leases a connection when none is active", () => {
    const pool = Base.connectionPool();
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

  it("#isPrimaryClass returns true for Base", () => {
    expect(Base.isPrimaryClass()).toBe(true);
  });

  it("#isPrimaryClass returns false for a normal model subclass", () => {
    class Post extends Base {}
    expect(Post.isPrimaryClass()).toBe(false);
  });

  it("#adapterClass resolves to the SQLite3Adapter constructor", async () => {
    const Klass = await Base.adapterClass();
    const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");
    expect(Klass).toBe(SQLite3Adapter);
  });

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
    try {
      const inMemory = new DatabaseConfigurations([
        new HashConfig(env, "primary", { adapter: "sqlite3", database: ":memory:" }),
      ]);

      class InMemoryModel extends Base {}
      (InMemoryModel as any).configurations = inMemory;

      await InMemoryModel.establishConnection();
      const Klass = await InMemoryModel.adapterClass();
      const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");
      expect(Klass).toBe(SQLite3Adapter);
    } finally {
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
    try {
      const url = new UrlConfig(env, "primary", "sqlite3:db/foo.sqlite3");
      url._database = "db/foo-2.sqlite3"; // mimic worker-suffix mutation
      const inMemory = new DatabaseConfigurations([url]);

      class WorkerModel extends Base {}
      (WorkerModel as any).configurations = inMemory;

      await WorkerModel.establishConnection();
      // The connection pool's resolved dbConfig must point at the
      // mutated database, not the original URL path. This is the
      // actual reconnect-target observation Copilot review #3 asked
      // for — without the URL-skip in autoConnect, this would surface
      // the original "db/foo.sqlite3" instead.
      const pool = WorkerModel.connectionPool();
      expect(pool.dbConfig.database).toBe("db/foo-2.sqlite3");
      const Klass = await WorkerModel.adapterClass();
      const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");
      expect(Klass).toBe(SQLite3Adapter);
    } finally {
      (DatabaseConfigurations as any).current = priorCurrent;
    }
  });
});

describe("withRoleAndShard loads Relation return values within scope (Story K gap 5)", () => {
  setupHandlerSuite();

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
  afterEach(() => {
    connectedToStack().length = 0;
    Base.connectionHandler.clearAllConnectionsBang();
  });

  it("Base.connectedTo preventing writes applies globally to unrelated pools", () => {
    class UnrelatedAbstract extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    Base.connectionHandler.establishConnection(
      new HashConfig("test", "UnrelatedAbstract", { adapter: "sqlite3", database: ":memory:" }),
      {
        owner: "UnrelatedAbstract",
        role: "writing",
        adapterFactory: () => new SQLite3Adapter(),
      },
    );
    const conn = UnrelatedAbstract.leaseConnection();
    expect(conn.isPreventingWrites()).toBe(false);
    Base.connectedTo({ role: "writing", preventWrites: true }, () => {
      expect(conn.isPreventingWrites()).toBe(true);
    });
    expect(conn.isPreventingWrites()).toBe(false);
  });

  it("abstract-class connectedTo does not leak to unrelated pools", () => {
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
    Base.connectionHandler.establishConnection(
      new HashConfig("test", "AnimalsRecord", { adapter: "sqlite3", database: ":memory:" }),
      { owner: "AnimalsRecord", role: "writing", adapterFactory: () => new SQLite3Adapter() },
    );
    Base.connectionHandler.establishConnection(
      new HashConfig("test", "MealsRecord", { adapter: "sqlite3", database: ":memory:" }),
      { owner: "MealsRecord", role: "writing", adapterFactory: () => new SQLite3Adapter() },
    );
    const animals = AnimalsRecord.leaseConnection();
    const meals = MealsRecord.leaseConnection();
    AnimalsRecord.connectedTo({ role: "writing", preventWrites: true }, () => {
      expect(animals.isPreventingWrites()).toBe(true);
      expect(meals.isPreventingWrites()).toBe(false);
    });
  });

  it("primary class connectedTo (after connectsTo) targets the Base-normalized pool", () => {
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
    class OtherAbstract extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    Base.connectionHandler.establishConnection(
      new HashConfig("test", "ApplicationRecord", { adapter: "sqlite3", database: ":memory:" }),
      { owner: ApplicationRecord, role: "writing", adapterFactory: () => new SQLite3Adapter() },
    );
    Base.connectionHandler.establishConnection(
      new HashConfig("test", "OtherAbstract", { adapter: "sqlite3", database: ":memory:" }),
      { owner: "OtherAbstract", role: "writing", adapterFactory: () => new SQLite3Adapter() },
    );
    const appConn = ApplicationRecord.leaseConnection();
    const otherConn = OtherAbstract.leaseConnection();
    ApplicationRecord.connectedTo({ role: "writing", preventWrites: true }, () => {
      expect(appConn.isPreventingWrites()).toBe(true);
      expect(otherConn.isPreventingWrites()).toBe(false);
    });
  });
});

describe("resolveConfigForConnection / connectsTo with unset configurations", () => {
  let prevCurrentConfigs: unknown;
  let prevBaseConfigs: unknown;

  beforeEach(async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    prevCurrentConfigs = (DatabaseConfigurations as any).current;
    prevBaseConfigs = (Base as any).configurations;
  });

  afterEach(async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    // fromEnv({}) mutates DatabaseConfigurations.current (the primary-config
    // registry HashConfig#isPrimary consults), so save and restore it here
    // — clearing connections alone leaves a stale primary registry behind.
    (DatabaseConfigurations as any).current = prevCurrentConfigs;
    (Base as any).configurations = prevBaseConfigs;
    Base.connectionHandler.clearAllConnectionsBang();
    delete (Base as any)._connectionSpecificationName;
  });

  it("unknown string config name raises AdapterNotSpecified with available-configs hint", async () => {
    const { resolveConfigForConnection } = await import("./connection-handling.js");
    const { AdapterNotSpecified } = await import("./errors.js");
    class Untouched extends Base {
      static {
        this.abstractClass = true;
      }
    }
    // No `Untouched.configurations` assigned — normalizeConfigurations falls
    // back to DatabaseConfigurations.fromEnv({}), so resolving an unknown
    // env name must surface AdapterNotSpecified rather than passing the
    // string through.
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
    class AppRecord extends Base {}
    class SecondaryAbstract extends Base {
      static {
        this.abstractClass = true;
      }
    }
    try {
      __resetPrimaryAbstractClass();
      primaryAbstractClass(AppRecord);
      (AppRecord as any).configurations = {
        development: { primary: { adapter: "sqlite3", database: ":memory:" } },
      };
      (SecondaryAbstract as any).configurations = (AppRecord as any).configurations;

      // Exercises the public connectsTo path so the
      // resolveConfigForConnection side effect (planting
      // _connectionSpecificationName) is covered end-to-end.
      AppRecord.connectsTo({ database: { writing: "primary" } });
      expect((AppRecord as any)._connectionSpecificationName).toBe("Base");

      SecondaryAbstract.connectsTo({ database: { writing: "primary" } });
      expect((SecondaryAbstract as any)._connectionSpecificationName).toBe("SecondaryAbstract");
    } finally {
      __resetPrimaryAbstractClass();
    }
  });
});

describe("establishConnection installs the matching Arel visitor", () => {
  afterEach(() => {
    setToSqlVisitor(Visitors.ToSql);
    // establishConnection nulls _adapter up the prototype chain on entry, so
    // clearing the handler's pools is the only reset needed here.
    Base.connectionHandler.clearAllConnectionsBang();
  });

  it("routes the global toSql visitor through the established adapter's dialect", async () => {
    // Start from the generic visitor so any change is attributable to establish.
    setToSqlVisitor(Visitors.ToSql);
    const users = new Table("users");
    const node = users.get("name").isDistinctFrom(null);
    expect(node.toSql()).toBe(`"users"."name" IS DISTINCT FROM NULL`);

    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });

    // SQLite's visitor rewrites IS DISTINCT FROM NULL to IS NOT NULL.
    expect(node.toSql()).toBe(`"users"."name" IS NOT NULL`);
  });

  it("leaves the visitor untouched and does not throw when the database cannot be opened", async () => {
    // Generic visitor installed; establishing against an unopenable path must
    // not flip it, and the open failure must defer to the first real query.
    setToSqlVisitor(Visitors.ToSql);
    const users = new Table("users");
    const node = users.get("name").isDistinctFrom(null);

    class Unopenable extends Base {}
    await expect(
      Unopenable.establishConnection({
        adapter: "sqlite3",
        database: "no/such/dir/foo.sqlite3",
        pool: 1,
      }),
    ).resolves.toBeUndefined();

    expect(node.toSql()).toBe(`"users"."name" IS DISTINCT FROM NULL`);
  });
});
