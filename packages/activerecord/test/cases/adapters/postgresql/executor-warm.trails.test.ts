import { it, expect } from "vitest";
import { Executor } from "@blazetrails/activesupport";
import { describeIfPg } from "./test-helper.js";
import { Base } from "../../../../lib/index.js";
import { ConnectionPool } from "../../../../lib/connection-adapters/abstract/connection-pool.js";
import { Topic } from "../../../models/topic.js";

describeIfPg("PostgreSQL ExecutorHooks (trails)", () => {
  it("reads a model's attributes on the first request after the boot flush", async () => {
    const pool = Base.connectionPool();
    await pool.schemaCache.columnsHash("topics");
    const pinned = await pool.unpinConnectionBang();
    try {
      Base.connectionHandler.clearActiveConnectionsBang("all");
      await pool.flushBang();
      expect(pool.isConnected()).toBe(false);
      class WarmTopic extends Topic {}

      const executor = class extends Executor {};
      ConnectionPool.installExecutorHooks(executor);
      const attributes = await executor.wrap(() => WarmTopic._defaultAttributes());
      expect(attributes.keys()).toContain("title");
    } finally {
      if (pinned) await pool.pinConnectionBang();
    }
  });
});
