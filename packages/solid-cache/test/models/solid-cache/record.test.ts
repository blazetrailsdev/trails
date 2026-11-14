import { ActiveRecord } from "@blazetrails/activerecord";
import { describe, expect, it } from "vitest";
import { Record } from "../../../lib/index.js";
import { useSolidCache } from "../../support/test-helper.js";

describe("SolidCache::RecordTest", () => {
  useSolidCache();

  it("each_shard", async () => {
    const shards: unknown[] = [];
    await Record.eachShard(() => shards.push(Record.currentShard()));
    expect(shards).toEqual(["default"]);
  });

  it("each_shard uses the default role", async () => {
    const role = await ActiveRecord.Base.connectedTo({ role: "reading" }, async () => {
      const roles: unknown[] = [];
      await Record.eachShard(() => roles.push(Record.currentRole()));
      return roles;
    });
    expect(role).toEqual(["reading"]);
  });
});
