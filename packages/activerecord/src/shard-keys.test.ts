import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import { DatabaseConfigurations } from "./database-configurations.js";

describe("ShardsKeysTest", () => {
  class UnshardedBase extends Base {
    static override abstractClass = true;
  }
  class UnshardedModel extends UnshardedBase {}

  class ShardedBase extends Base {
    static override abstractClass = true;
  }
  class ShardedModel extends ShardedBase {}

  let prevConfigs: unknown;
  let prevDefaultEnv: string;
  let prevCurrent: unknown;

  beforeEach(() => {
    prevConfigs = (Base as any).configurations;
    prevDefaultEnv = DatabaseConfigurations.defaultEnv;
    prevCurrent = (DatabaseConfigurations as any).current;
    DatabaseConfigurations.defaultEnv = "default_env";
    (Base as any).configurations = {
      default_env: {
        primary: { adapter: "sqlite3", database: ":memory:" },
        shard_one: { adapter: "sqlite3", database: ":memory:" },
        shard_one_reading: { adapter: "sqlite3", database: ":memory:", replica: true },
        shard_two: { adapter: "sqlite3", database: ":memory:" },
        shard_two_reading: { adapter: "sqlite3", database: ":memory:", replica: true },
      },
    };
    (Base as any)._shardKeys = undefined;

    UnshardedBase.connectsTo({ database: { writing: "primary" } });
    ShardedBase.connectsTo({
      shards: {
        shard_one: { writing: "shard_one", reading: "shard_one_reading" },
        shard_two: { writing: "shard_two", reading: "shard_two_reading" },
      },
    });
  });

  afterEach(() => {
    Base.connectionHandler.clearAllConnectionsBang();
    (Base as any).configurations = prevConfigs;
    DatabaseConfigurations.defaultEnv = prevDefaultEnv;
    (DatabaseConfigurations as any).current = prevCurrent;
    (Base as any)._shardKeys = undefined;
  });

  it("connects to sets shard keys", () => {
    expect(Base.shardKeys()).toEqual([]);
    expect(ShardedBase.shardKeys()).toEqual(["shard_one", "shard_two"]);
  });

  it("connects to sets shard keys for descendents", () => {
    expect(ShardedModel.shardKeys()).toEqual(ShardedBase.shardKeys());
  });

  it("sharded?", () => {
    expect(Base.isSharded()).toBe(false);
    expect(UnshardedBase.isSharded()).toBe(false);
    expect(UnshardedModel.isSharded()).toBe(false);

    expect(ShardedBase.isSharded()).toBe(true);
    expect(ShardedModel.isSharded()).toBe(true);
  });

  it.skip("connected to all shards", () => {
    // BLOCKED: connection-pool — sharding / shard-selector not fully implemented
    // ROOT-CAUSE: connection-handling.ts#connectedTo shard routing + connection-adapters/abstract/connection-handler.ts pool-per-shard not fully implemented
    // SCOPE: ~100 LOC in connection-handling.ts + connection-adapters/abstract/connection-handler.ts; affects ~19–26 tests in sharding files
  });
  it.skip("connected to all shards can switch each to reading role", () => {
    // BLOCKED: connection-pool — sharding / shard-selector not fully implemented
    // ROOT-CAUSE: connection-handling.ts#connectedTo shard routing + connection-adapters/abstract/connection-handler.ts pool-per-shard not fully implemented
    // SCOPE: ~100 LOC in connection-handling.ts + connection-adapters/abstract/connection-handler.ts; affects ~19–26 tests in sharding files
  });
  it.skip("connected to all shards respects preventing writes", () => {
    // BLOCKED: connection-pool — sharding / shard-selector not fully implemented
    // ROOT-CAUSE: connection-handling.ts#connectedTo shard routing + connection-adapters/abstract/connection-handler.ts pool-per-shard not fully implemented
    // SCOPE: ~100 LOC in connection-handling.ts + connection-adapters/abstract/connection-handler.ts; affects ~19–26 tests in sharding files
  });
});
