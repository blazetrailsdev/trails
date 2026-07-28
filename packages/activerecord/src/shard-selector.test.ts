import { describe, it, expect, afterEach } from "vitest";
import { Base } from "./base.js";
import { ShardSelector } from "./middleware/shard-selector.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { ambientPoolConfiguration } from "./test-adapter.js";

describe("ShardSelectorTest", () => {
  afterEach(async () => {
    await Base.connectionHandler.clearAllConnectionsBang();
  });

  function setupShards() {
    // Rails' ShardSelectorTest resolves shards from the ambient `arunit`
    // configuration; the shard pool clones that config rather than naming a
    // database of its own.
    const dbConfig = new HashConfig("test", "Base", ambientPoolConfiguration());
    Base.connectionHandler.establishConnection(dbConfig, {
      owner: "Base",
      role: "writing",
      shard: "shard_one",
    });
  }

  it("middleware locks to shard by default", async () => {
    const middleware = new ShardSelector(
      async () => {
        expect(Base.isShardSwappingProhibited()).toBe(true);
        return [200, {}, ["body"]];
      },
      () => "shard_one",
    );
    setupShards();
    expect(await middleware.call({ method: "GET" })).toEqual([200, {}, ["body"]]);
  });

  it("middleware can turn off lock option", async () => {
    const middleware = new ShardSelector(
      async () => {
        expect(Base.isShardSwappingProhibited()).toBe(false);
        return [200, {}, ["body"]];
      },
      () => "shard_one",
      { lock: false },
    );
    setupShards();
    expect(await middleware.call({ method: "GET" })).toEqual([200, {}, ["body"]]);
  });

  it("middleware can change shards", async () => {
    setupShards();
    const middleware = new ShardSelector(
      async () => {
        expect(Base.connectedToQ({ role: "writing", shard: "shard_one" })).toBe(true);
        return [200, {}, ["body"]];
      },
      () => "shard_one",
    );
    expect(await middleware.call({ method: "GET" })).toEqual([200, {}, ["body"]]);
  });

  it("middleware can handle string shards", async () => {
    setupShards();
    const middleware = new ShardSelector(
      async () => {
        expect(Base.connectedToQ({ role: "writing", shard: "shard_one" })).toBe(true);
        return [200, {}, ["body"]];
      },
      () => "shard_one",
    );
    expect(await middleware.call({ method: "GET" })).toEqual([200, {}, ["body"]]);
  });
});
