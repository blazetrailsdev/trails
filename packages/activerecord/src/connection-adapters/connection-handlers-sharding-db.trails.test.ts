import { describe, it, expect, afterEach } from "vitest";
import { Base } from "../base.js";
import { connectedToStack } from "../core.js";
import { fixtures } from "../test-helpers/use-fixtures.js";

describe("ConnectionHandlersShardingDbTest (trails-only)", () => {
  const { self } = fixtures({}, { useTransactionalTests: false });

  afterEach(() => {
    self().cleanUpConnectionHandler();
  });

  it("connectingTo uses the class defaultShard when shard is omitted", async () => {
    class ShardedAbstractBase extends Base {
      static override abstractClass = true;
    }
    await ShardedAbstractBase.connectsTo({
      shards: { not_default: { writing: { database: ":memory:", adapter: "sqlite3" } } },
    });
    expect(ShardedAbstractBase.defaultShard).toBe("not_default");

    ShardedAbstractBase.connectingTo({ role: "writing" });
    try {
      expect(ShardedAbstractBase.isConnectedTo({ role: "writing", shard: "not_default" })).toBe(
        true,
      );
    } finally {
      connectedToStack().pop();
    }
  });
});
