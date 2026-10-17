import "./test-helpers/helper.js";
import { tomorrow, noon } from "@blazetrails/activesupport/core-ext/date/calculations";
import "@blazetrails/activesupport/testing/autorun";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { TestHost } from "./codegen-runtime.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { clear, lastValue } from "./test-helpers/support/job-buffer.js";
import { describe, beforeEach, it, expect, afterEach } from "vitest";

describe("AsyncAdapterTest", () => {
  class AsyncAdapterTest extends TestHost {}
  registerConstant("AsyncAdapterTest", AsyncAdapterTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  beforeEach(async ({ testCase }: any) => {
    await clear();
    (await Base.queueAdapter()).immediate = true;
  });
  it("in immediate run, perform_later runs immediately", async ({ testCase }: any) => {
    await await HelloJob.performLater("Alex");
    expect(await lastValue()).toMatch(/Alex/);
  });
  it.skip("in immediate run, enqueue with wait: runs immediately", async ({ testCase }: any) => {
    await await (
      await HelloJob.set({ waitUntil: await noon(await tomorrow()) })
    ).performLater("Alex");
    expect(await lastValue()).toMatch(/Alex/);
  });
});
