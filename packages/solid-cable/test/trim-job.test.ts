import { days } from "@blazetrails/activesupport";
import { assertDifference } from "@blazetrails/activesupport/testing/assertions";
import { afterEach, beforeAll, describe, it, vi } from "vitest";
import { Message, SolidCable, TrimJob } from "../lib/index.js";
import { loadCableSchema } from "./support/cable-schema.js";
import { useDummyApplication, withCableConfig } from "./support/config-stubs.js";

describe("TrimJobTest", () => {
  useDummyApplication();

  beforeAll(async () => {
    await loadCableSchema();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Message.deleteAll();
  });

  it("trims a limited number of messages", async () => {
    vi.spyOn(SolidCable, "trimChance").mockReturnValue(99.999);
    await withCableConfig({ trimBatchSize: 2, messageRention: "1.second" }, async () => {
      for (let i = 0; i < 4; i++) {
        await Message.broadcast("foo", "bar");
        await Message.updateAll({ created_at: days(2).ago() });
      }

      await assertDifference(
        () => Message.count(),
        -2,
        null,
        () => TrimJob.performNow(),
      );
    });
  });
});
