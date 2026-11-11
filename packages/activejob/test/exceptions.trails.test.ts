import { describe, expect, expectTypeOf, it } from "vitest";
import type { Logger } from "@blazetrails/activesupport";
import { Base } from "../lib/base.js";
import "./helper.js";
import { JobBuffer } from "./support/job-buffer.js";
import { FirstRetryableErrorOfTwo, RetryJob, SecondRetryableErrorOfTwo } from "./jobs/retry-job.js";
import { RescueJob } from "./jobs/rescue-job.js";

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

  it("types after_discard's block with the subclass instance, and the job's logger", () => {
    class MailingJob extends Base {
      mailFailure(exception: Error): string {
        return exception.message;
      }
    }
    MailingJob.afterDiscard((job, exception) => {
      expectTypeOf(job).toEqualTypeOf<MailingJob>();
      return job.mailFailure(exception);
    });
    expect(MailingJob.afterDiscardProcs.length).toBe(Base.afterDiscardProcs.length + 1);
    expectTypeOf(new MailingJob().logger).toEqualTypeOf<Logger | null>();
  });
});
