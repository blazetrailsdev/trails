import { describe, it, expect, afterEach } from "vitest";
import { Base } from "./base.js";
import { ShardSelector } from "./middleware/shard-selector.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { ambientPoolConfiguration } from "./test-adapter.js";
import { TopLevel } from "@blazetrails/activesupport";

class TestRequest {
  readonly method: string;
  constructor(env: Record<string, unknown>) {
    this.method = env["REQUEST_METHOD"] as string;
  }
}
TopLevel.ActionDispatch = { Request: TestRequest } as never;

describe("ShardSelectorTest", () => {
  afterEach(async () => {
    await Base.connectionHandler.clearAllConnectionsBang();
    await Base.connectionHandler.removeConnectionPool("ActiveRecord::Base", { shard: "shard_one" });
  });

  it("middleware with an explicitly stored nil lock does not lock", async () => {
    const middleware = new ShardSelector(
      async () => {
        expect(Base.isShardSwappingProhibited()).toBeFalsy();
        return [200, {}, ["body"]];
      },
      () => "shard_one",
      { lock: null },
    );
    await Base.connectionHandler.establishConnection(
      new HashConfig("test", "Base", ambientPoolConfiguration()),
      { ownerName: "ActiveRecord::Base", role: "writing", shard: "shard_one" },
    );
    expect(await middleware.call({ REQUEST_METHOD: "GET" })).toEqual([200, {}, ["body"]]);
  });
});
