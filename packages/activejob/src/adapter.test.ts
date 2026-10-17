import { isAdapterIs } from "./test-helpers/helper.js";
import { getEnv, classify, squish } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/testing/autorun";
import { rbObjAsString, rbObjClass, rbModName, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { TestHost } from "./codegen-runtime.js";
import { deprecator } from "./deprecator.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("AdapterTest", () => {
  class AdapterTest extends TestHost {}
  registerConstant("AdapterTest", AdapterTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  it(`should load ${rbObjAsString(getEnv("AJ_ADAPTER"))} adapter`, async ({ testCase }: any) => {
    expect(await rbModName(await rbObjClass(await Base.queueAdapter()))).toEqual(
      await classify(
        `active_job/queue_adapters/${rbObjAsString(await getEnv("AJ_ADAPTER"))}_adapter`,
      ),
    );
  });
  if (isAdapterIs("sucker_punch")) {
    it("sucker_punch adapter should be deprecated", async ({ testCase }: any) => {
      let beforeAdapter: any, msg: any;
      try {
        beforeAdapter = await Base.queueAdapter();
        msg = await squish(
          `The \`sucker_punch\` adapter is deprecated and will be removed in Rails 8.1.\nPlease use the \`async\` adapter instead.\n`,
        );
        await testCase.assertDeprecated(msg, await deprecator(), () => {
          Base.setQueueAdapter("sucker_punch");
          return "sucker_punch";
        });
      } finally {
        Base.setQueueAdapter(beforeAdapter);
      }
    });
    it("sucker_punch check_adapter should warn", async ({ testCase }: any) => {
      const msg: any = await squish(
        `The \`sucker_punch\` adapter is deprecated and will be removed in Rails 8.1.\nPlease use the \`async\` adapter instead.\n`,
      );
      await testCase.assertDeprecated(
        msg,
        await deprecator(),
        async () => await (await Base.queueAdapter()).checkAdapter(),
      );
    });
  }
});
