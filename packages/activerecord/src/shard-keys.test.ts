import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base } from "./base.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { assertEmpty } from "@blazetrails/activesupport";
import { fixtures } from "./test-helpers/use-fixtures.js";

describe("ShardsKeysTest", () => {
  const { self } = fixtures([]);
  class UnshardedBase extends Base {
    static override abstractClass = true;
  }
  class UnshardedModel extends UnshardedBase {}

  class ShardedBase extends Base {
    static override abstractClass = true;
  }
  class ShardedModel extends ShardedBase {}

  let prevConfigs: DatabaseConfigurations;

  beforeEach(async () => {
    prevConfigs = Base.configurations();
    vi.stubEnv("TRAILS_ENV", "default_env");
    Base.configurations({
      default_env: {
        primary: { adapter: "sqlite3", database: ":memory:" },
        shard_one: { adapter: "sqlite3", database: ":memory:" },
        shard_one_reading: { adapter: "sqlite3", database: ":memory:", replica: true },
        shard_two: { adapter: "sqlite3", database: ":memory:" },
        shard_two_reading: { adapter: "sqlite3", database: ":memory:", replica: true },
      },
    });
    (Base as any)._shardKeys = undefined;

    await UnshardedBase.connectsTo({ database: { writing: ":primary" } });
    await ShardedBase.connectsTo({
      shards: {
        shard_one: { writing: ":shard_one", reading: ":shard_one_reading" },
        shard_two: { writing: ":shard_two", reading: ":shard_two_reading" },
      },
    });
  });

  afterEach(async () => {
    self().cleanUpConnectionHandler();
    Base.configurations(prevConfigs);
    await Base.establishConnection(":arunit");
    vi.unstubAllEnvs();
  });

  it("connects to sets shard keys", () => {
    assertEmpty(Base.shardKeys());
    expect(ShardedBase.shardKeys()).toEqual(["shard_one", "shard_two"]);
  });

  it("connects to sets shard keys for descendents", () => {
    expect(ShardedModel.shardKeys()).toEqual(ShardedBase.shardKeys());
  });

  it("sharded?", () => {
    expect(Base.isSharded()).toBeFalsy();
    expect(UnshardedBase.isSharded()).toBeFalsy();
    expect(UnshardedModel.isSharded()).toBeFalsy();

    expect(ShardedBase.isSharded()).toBeTruthy();
    expect(ShardedModel.isSharded()).toBeTruthy();
  });

  it("connected to all shards", async () => {
    const unshardedResults = await UnshardedBase.connectedToAllShards({}, () => {
      return UnshardedBase.connectionPool().dbConfig.name;
    });

    const shardedResults = await ShardedBase.connectedToAllShards({}, () => {
      return ShardedBase.connectionPool().dbConfig.name;
    });

    assertEmpty(unshardedResults);
    expect(shardedResults).toEqual(["shard_one", "shard_two"]);
  });

  it("connected to all shards can switch each to reading role", async () => {
    self().teardownSharedConnectionPool();
    await ShardedBase.connectsTo({
      shards: {
        shard_one: { writing: ":shard_one", reading: ":shard_one_reading" },
        shard_two: { writing: ":shard_two", reading: ":shard_two_reading" },
      },
    });

    const results = await ShardedBase.connectedToAllShards({ role: "reading" }, () => {
      return ShardedBase.connectionPool().dbConfig.name;
    });

    expect(results).toEqual(["shard_one_reading", "shard_two_reading"]);
  });

  it("connected to all shards runs an async block against one shard at a time", async () => {
    const results = await ShardedBase.connectedToAllShards({}, async () => {
      await Promise.resolve();
      return ShardedBase.connectionPool().dbConfig.name;
    });

    expect(results).toEqual(["shard_one", "shard_two"]);
  });

  it("connected to all shards respects preventing writes", async () => {
    expect(ShardedBase.currentPreventingWrites()).toBeFalsy();

    const results = await ShardedBase.connectedToAllShards(
      { role: "writing", preventWrites: true },
      () => {
        return ShardedBase.currentPreventingWrites();
      },
    );

    expect(results).toEqual([true, true]);
  });
});
