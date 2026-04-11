import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { createTestAdapter } from "./test-adapter.js";
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
  Base.connectionHandler.establishConnection(config, {
    owner: "Base",
    adapterFactory: createTestAdapter,
  });
}

describe("ConnectionHandlingTest", () => {
  beforeEach(() => {
    setupConnection();
  });

  afterEach(() => {
    connectedToStack().length = 0;
    Base.connectionHandler.clearAllConnectionsBang();
  });

  it("#with_connection lease the connection for the duration of the block", () => {
    const pool = Base.connectionPool();
    expect(pool.activeConnection).toBeNull();
    Base.withConnection((conn) => {
      expect(conn).toBeTruthy();
      expect(pool.activeConnection).toBeTruthy();
    });
  });

  it("#lease_connection makes the lease permanent even inside #with_connection", () => {
    Base.withConnection(() => {
      const leased = Base.leaseConnection();
      expect(leased).toBeTruthy();
    });
    // leaseConnection makes sticky=true, so connection persists
    expect(Base.connectionPool().activeConnection).toBeTruthy();
    Base.releaseConnection();
  });

  it.skip("#lease_connection makes the lease permanent even inside #with_connection(prevent_permanent_checkout: true)", () => {});

  it("#with_connection use the already leased connection if available", () => {
    const leased = Base.leaseConnection();
    Base.withConnection((conn) => {
      expect(conn).toBe(leased);
    });
    Base.releaseConnection();
  });

  it("#with_connection is reentrant", () => {
    Base.withConnection((outer) => {
      Base.withConnection((inner) => {
        expect(inner).toBe(outer);
      });
    });
  });

  it.skip("#connection is a soft-deprecated alias to #lease_connection", () => {});
  it.skip("#connection emits a deprecation warning if ActiveRecord.permanent_connection_checkout == :deprecated", () => {});
  it.skip("#connection raises an error if ActiveRecord.permanent_connection_checkout == :disallowed", () => {});
  it.skip("#connection doesn't make the lease permanent if inside #with_connection(prevent_permanent_checkout: true)", () => {});
  it.skip("common APIs don't permanently hold a connection when permanent checkout is deprecated or disallowed", () => {});

  it("connected_to switches role for block", () => {
    expect(currentRole.call(Base)).toBe("writing");
    Base.connectedTo({ role: "reading" }, () => {
      expect(currentRole.call(Base)).toBe("reading");
    });
    expect(currentRole.call(Base)).toBe("writing");
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
    ).toThrow(/can only accept/);
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
    Base.connectedToMany([Base], { role: "reading" }, () => {
      expect(currentRole.call(Base)).toBe("reading");
    });
    expect(currentRole.call(Base)).toBe("writing");
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
});
