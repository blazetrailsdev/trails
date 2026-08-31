import { describe, it, expect, afterEach } from "vitest";
import { Base } from "./base.js";
import { ShardSelector } from "./middleware/shard-selector.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { ambientPoolConfiguration } from "./test-adapter.js";
import { _setActionDispatchRequest } from "./middleware/request-slot.js";

class TestRequest {
  readonly method: string;
  constructor(env: Record<string, unknown>) {
    this.method = env["REQUEST_METHOD"] as string;
  }
}
_setActionDispatchRequest(TestRequest);

describe("ShardSelectorTest", () => {
  afterEach(async () => {
    await Base.connectionHandler.clearAllConnectionsBang();
    Base.connectionHandler.removeConnectionPool("ActiveRecord::Base", { shard: "shard_one" });
  });

  function setupShards() {
    const dbConfig = new HashConfig("test", "Base", ambientPoolConfiguration());
    Base.connectionHandler.establishConnection(dbConfig, {
      ownerName: "ActiveRecord::Base",
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
    expect(await middleware.call({ REQUEST_METHOD: "GET" })).toEqual([200, {}, ["body"]]);
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
    expect(await middleware.call({ REQUEST_METHOD: "GET" })).toEqual([200, {}, ["body"]]);
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
    expect(await middleware.call({ REQUEST_METHOD: "GET" })).toEqual([200, {}, ["body"]]);
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
    expect(await middleware.call({ REQUEST_METHOD: "GET" })).toEqual([200, {}, ["body"]]);
  });
});
