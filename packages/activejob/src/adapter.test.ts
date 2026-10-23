import type {} from "@blazetrails/vitest-matchers";
import { isAdapterIs } from "./test-helpers/helper.js";
import { getEnv, classify, squish } from "@blazetrails/activesupport";
import { ActiveJob } from "./active-job.js";
import { Base } from "./base.js";
import { deprecator } from "./deprecator.js";
import { expect, it, describe } from "vitest";

describe("AdapterTest", () => {
  it(`should load ${getEnv("AJ_ADAPTER") ?? ""} adapter`, async () => {
    expect(
      await ((x) => (Object.hasOwn(x, "toString") ? String(x) : x.name || null))(
        await (
          await Base.queueAdapter
        ).constructor,
      ),
    ).toEqualRuby(
      await classify(`active_job/queue_adapters/${getEnv("AJ_ADAPTER") ?? ""}_adapter`),
    );
  });

  it.skipIf(!isAdapterIs("sucker_punch"))("sucker_punch adapter should be deprecated", async () => {
    let beforeAdapter: unknown, msg: unknown;
    try {
      beforeAdapter = await Base.queueAdapter;
      msg = await squish(
        `The \`sucker_punch\` adapter is deprecated and will be removed in Rails 8.1.\nPlease use the \`async\` adapter instead.\n`,
      );
      await this.assertDeprecated(msg, deprecator(), () => {
        Base.setQueueAdapter("sucker_punch");
        return "sucker_punch";
      });
    } finally {
      Base.setQueueAdapter(beforeAdapter);
    }
  });

  it.skipIf(!isAdapterIs("sucker_punch"))("sucker_punch check_adapter should warn", async () => {
    const msg = await squish(
      `The \`sucker_punch\` adapter is deprecated and will be removed in Rails 8.1.\nPlease use the \`async\` adapter instead.\n`,
    );
    await this.assertDeprecated(
      msg,
      deprecator(),
      async () => await (await Base.queueAdapter).checkAdapter(),
    );
  });
});
