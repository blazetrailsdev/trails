import "./test-helpers/helper.js";
import { setZone, useZone } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/testing/autorun";
import { registerConstant } from "@blazetrails/ruby-compat";
import { TestHost } from "./codegen-runtime.js";
import { TimezoneDependentJob } from "./test-helpers/jobs/timezone-dependent-job.js";
import { clear, lastValue } from "./test-helpers/support/job-buffer.js";
import { describe, beforeEach, it, expect, afterEach } from "vitest";

describe("TimezonesTest", () => {
  class TimezonesTest extends TestHost {}
  registerConstant("TimezonesTest", TimezonesTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  beforeEach(async ({ testCase }: any) => {
    await clear();
  });
  it("it performs the job in the given timezone", async ({ testCase }: any) => {
    let job: any = new TimezoneDependentJob("2018-01-01T00:00:00Z");
    job.timezone = "London";
    await await job.performNow();
    expect(await lastValue()).toEqual("Happy New Year!");
    job = new TimezoneDependentJob("2018-01-01T00:00:00Z");
    job.timezone = "Eastern Time (US & Canada)";
    await await job.performNow();
    expect(await lastValue()).toEqual("Just 5 hours to go");
  });
  it("perform_now passes down current timezone to the job", async ({ testCase }: any) => {
    try {
      setZone("America/New_York");
      await useZone("London", async () => {
        const job: any = new TimezoneDependentJob("2018-01-01T00:00:00Z");
        expect(await job.timezone).toEqual("London");
        return await await job.performNow();
      });
      expect(await lastValue()).toEqual("Happy New Year!");
    } finally {
      setZone(null);
    }
  });
});
