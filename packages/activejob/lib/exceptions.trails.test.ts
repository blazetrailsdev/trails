import { describe, expect, it } from "vitest";
import "./test-helpers/helper.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import {
  FirstRetryableErrorOfTwo,
  RetryJob,
  SecondRetryableErrorOfTwo,
} from "./test-helpers/jobs/retry-job.js";
import { RescueJob } from "./test-helpers/jobs/rescue-job.js";

describe("Exceptions", () => {
  it("keys exception_executions by Array#to_s of the exception classes", async () => {
    const job = new RetryJob("FirstRetryableErrorOfTwo", 3);
    job.executionsFor([FirstRetryableErrorOfTwo, SecondRetryableErrorOfTwo]);
    job.executionsFor([FirstRetryableErrorOfTwo, SecondRetryableErrorOfTwo]);
    expect(job.serialize()["exception_executions"]).toEqual({
      "[FirstRetryableErrorOfTwo, SecondRetryableErrorOfTwo]": 2,
    });
  });

  it("raises RuntimeError for an unknown wait", () => {
    const job = new RetryJob(null, 0);
    expect(() =>
      job.determineDelay({ secondsOrDurationOrAlgorithm: "nope", executions: 1 }),
    ).toThrow(`Couldn't determine a delay based on "nope"`);
  });

  it("retry_job from a rescue_from handler", async () => {
    await RescueJob.performLater("david");
    expect(JobBuffer.values()).toContain("rescued from ArgumentError");
    expect(JobBuffer.values()).toContain("Retried job DIFFERENT!");
  });
});
