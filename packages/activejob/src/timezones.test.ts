import "./test-helpers/helper.js";
import { setZone, useZone } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { TimezoneDependentJob } from "./test-helpers/jobs/timezone-dependent-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { beforeEach, expect, it, describe } from "vitest";

describe("TimezonesTest", () => {
  beforeEach(() => {
    JobBuffer.clear();
  });

  it("it performs the job in the given timezone", async () => {
    let job = new TimezoneDependentJob("2018-01-01T00:00:00Z");
    job.timezone = "London";
    await job.performNow();
    expect(JobBuffer.lastValue()).toEqual("Happy New Year!");
    job = new TimezoneDependentJob("2018-01-01T00:00:00Z");
    job.timezone = "Eastern Time (US & Canada)";
    await job.performNow();
    expect(JobBuffer.lastValue()).toEqual("Just 5 hours to go");
  });

  it("perform_now passes down current timezone to the job", async () => {
    try {
      setZone("America/New_York");
      await useZone("London", async () => {
        const job = new TimezoneDependentJob("2018-01-01T00:00:00Z");
        expect(await job.timezone).toEqual("London");
        return await job.performNow();
      });
      expect(JobBuffer.lastValue()).toEqual("Happy New Year!");
    } finally {
      setZone(null);
    }
  });
});
