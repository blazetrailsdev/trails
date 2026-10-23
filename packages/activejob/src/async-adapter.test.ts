import "./test-helpers/helper.js";
import { tomorrow, noon } from "@blazetrails/activesupport/core-ext/date/calculations";
import { Date as RubyDate } from "@blazetrails/date";
import { Base } from "./base.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { beforeEach, expect, it, describe } from "vitest";

describe("AsyncAdapterTest", () => {
  beforeEach(async () => {
    JobBuffer.clear();
    (await Base.queueAdapter).immediate = true;
  });

  it("in immediate run, perform_later runs immediately", async () => {
    await HelloJob.performLater("Alex");
    expect(JobBuffer.lastValue()).toMatch(/Alex/);
  });

  it("in immediate run, enqueue with wait: runs immediately", async () => {
    await HelloJob.set({ waitUntil: await noon(await tomorrow()) }).performLater("Alex");
    expect(JobBuffer.lastValue()).toMatch(/Alex/);
  });
});
