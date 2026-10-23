import { beforeEach, describe, it } from "vitest";
import { assertEqual, setZone, useZone } from "@blazetrails/activesupport";
import "./test-helpers/helper.js";
import { TimezoneDependentJob } from "./test-helpers/jobs/timezone-dependent-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

describe("TimezonesTest", () => {
  beforeEach(() => {
    JobBuffer.clear();
  });

  it("it performs the job in the given timezone", async () => {
    let job = new TimezoneDependentJob("2018-01-01T00:00:00Z");
    job.timezone = "London";
    await job.performNow();

    assertEqual("Happy New Year!", JobBuffer.lastValue());

    job = new TimezoneDependentJob("2018-01-01T00:00:00Z");
    job.timezone = "Eastern Time (US & Canada)";
    await job.performNow();

    assertEqual("Just 5 hours to go", JobBuffer.lastValue());
  });

  it("perform_now passes down current timezone to the job", async () => {
    try {
      setZone("America/New_York");

      await useZone("London", async () => {
        const job = new TimezoneDependentJob("2018-01-01T00:00:00Z");
        assertEqual("London", job.timezone);
        await job.performNow();
      });

      assertEqual("Happy New Year!", JobBuffer.lastValue());
    } finally {
      setZone(null);
    }
  });
});
