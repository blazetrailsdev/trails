import {
  assertNothingRaised,
  seconds,
  stub,
  travelBack,
  travelTo,
} from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { Kernel, toF } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "./test-helpers/helper.js";
import { Base } from "./base.js";
import { AsyncAdapter } from "./queue-adapters/async-adapter.js";
import { InlineAdapter } from "./queue-adapters/inline-adapter.js";
import { AfterDiscardRetryJob } from "./test-helpers/jobs/after-discard-retry-job.js";
import {
  DefaultsError,
  RetryJob,
  SecondRetryableErrorOfTwo,
  ShortWaitTenAttemptsError,
} from "./test-helpers/jobs/retry-job.js";
import { Person } from "./test-helpers/models/person.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

function isAdapterSkipsScheduling(queueAdapter: unknown): boolean {
  return [InlineAdapter, AsyncAdapter].includes(
    (queueAdapter as object).constructor as typeof InlineAdapter,
  );
}

const AfterDiscardErrors = AfterDiscardRetryJob as unknown as Record<string, new () => Error>;

describe.skipIf(isAdapterSkipsScheduling(Base.queueAdapter))("ExceptionsTest", () => {
  beforeEach(() => {
    JobBuffer.clear();
  });

  afterEach(() => travelBack());

  it("successfully retry job throwing exception against defaults", async () => {
    await RetryJob.performLater("DefaultsError", 5);

    expect(JobBuffer.values()).toEqual([
      "Raised DefaultsError for the 1st time",
      "Raised DefaultsError for the 2nd time",
      "Raised DefaultsError for the 3rd time",
      "Raised DefaultsError for the 4th time",
      "Successfully completed job",
    ]);
  });

  it("successfully retry job throwing exception against higher limit", async () => {
    await RetryJob.performLater("ShortWaitTenAttemptsError", 9);
    expect(JobBuffer.values().length).toBe(9);
  });

  it("keeps the same attempts counter for several exceptions listed in the same retry_on declaration", async () => {
    const exceptionsToRaise = [
      "FirstRetryableErrorOfTwo",
      "FirstRetryableErrorOfTwo",
      "FirstRetryableErrorOfTwo",
      "SecondRetryableErrorOfTwo",
      "SecondRetryableErrorOfTwo",
    ];

    await expect(RetryJob.performLater(exceptionsToRaise, 5)).rejects.toThrow(
      SecondRetryableErrorOfTwo,
    );

    expect(JobBuffer.values()).toEqual([
      "Raised FirstRetryableErrorOfTwo for the 1st time",
      "Raised FirstRetryableErrorOfTwo for the 2nd time",
      "Raised FirstRetryableErrorOfTwo for the 3rd time",
      "Raised SecondRetryableErrorOfTwo for the 4th time",
    ]);
  });

  it("keeps a separate attempts counter for each individual retry_on declaration", async () => {
    const exceptionsToRaise = [
      "DefaultsError",
      "DefaultsError",
      "DefaultsError",
      "DefaultsError",
      "FirstRetryableErrorOfTwo",
      "FirstRetryableErrorOfTwo",
      "FirstRetryableErrorOfTwo",
    ];

    await assertNothingRaised(async () => {
      await RetryJob.performLater(exceptionsToRaise, 10);

      expect(JobBuffer.values()).toEqual([
        "Raised DefaultsError for the 1st time",
        "Raised DefaultsError for the 2nd time",
        "Raised DefaultsError for the 3rd time",
        "Raised DefaultsError for the 4th time",
        "Raised FirstRetryableErrorOfTwo for the 5th time",
        "Raised FirstRetryableErrorOfTwo for the 6th time",
        "Raised FirstRetryableErrorOfTwo for the 7th time",
        "Successfully completed job",
      ]);
    });
  });

  it("failed retry job when exception kept occurring against defaults", async () => {
    try {
      await RetryJob.performLater("DefaultsError", 6);
      expect(JobBuffer.lastValue()).toBe("Raised DefaultsError for the 5th time");
    } catch (e) {
      if (!(e instanceof DefaultsError)) throw e;
    }
  });

  it("failed retry job when exception kept occurring against higher limit", async () => {
    try {
      await RetryJob.performLater("ShortWaitTenAttemptsError", 11);
      expect(JobBuffer.lastValue()).toBe("Raised ShortWaitTenAttemptsError for the 10th time");
    } catch (e) {
      if (!(e instanceof ShortWaitTenAttemptsError)) throw e;
    }
  });

  it("discard job", async () => {
    await RetryJob.performLater("DiscardableError", 2);
    expect(JobBuffer.lastValue()).toBe("Raised DiscardableError for the 1st time");
  });

  it("custom handling of discarded job", async () => {
    await RetryJob.performLater("CustomDiscardableError", 2);
    expect(JobBuffer.lastValue()).toBe(
      "Dealt with a job that was discarded in a custom way. Message: CustomDiscardableError",
    );
  });

  it("custom handling of job that exceeds retry attempts", async () => {
    await RetryJob.performLater("CustomCatchError", 6);
    expect(JobBuffer.lastValue()).toBe(
      "Dealt with a job that failed to retry in a custom way after 6 attempts. Message: CustomCatchError",
    );
  });

  it("long wait job", async () => {
    travelTo(Time.now());
    const randomAmount = 1;
    const delayForJitter = randomAmount * 3600 * Base.retryJitter;

    await stub(Kernel, "rand", randomAmount, [], async () => {
      await RetryJob.performLater("LongWaitError", 2, ":log_scheduled_at");
      expect(JobBuffer.values()).toEqual([
        "Raised LongWaitError for the 1st time",
        `Next execution scheduled at ${toF(Time.now().plus(seconds(3600)).plus(delayForJitter))}`,
        "Successfully completed job",
      ]);
    });
  });

  it("polynomially retrying job includes jitter", async () => {
    travelTo(Time.now());

    const randomAmount = 2;
    const delayForJitter = (delay: number) => randomAmount * delay * Base.retryJitter;

    await stub(Kernel, "rand", randomAmount, [], async () => {
      await RetryJob.performLater("PolynomialWaitTenAttemptsError", 5, ":log_scheduled_at");

      expect(JobBuffer.values()).toEqual([
        "Raised PolynomialWaitTenAttemptsError for the 1st time",
        `Next execution scheduled at ${toF(Time.now().plus(seconds(3)).plus(delayForJitter(1)))}`,
        "Raised PolynomialWaitTenAttemptsError for the 2nd time",
        `Next execution scheduled at ${toF(Time.now().plus(seconds(18)).plus(delayForJitter(16)))}`,
        "Raised PolynomialWaitTenAttemptsError for the 3rd time",
        `Next execution scheduled at ${toF(Time.now().plus(seconds(83)).plus(delayForJitter(81)))}`,
        "Raised PolynomialWaitTenAttemptsError for the 4th time",
        `Next execution scheduled at ${toF(Time.now().plus(seconds(258)).plus(delayForJitter(256)))}`,
        "Successfully completed job",
      ]);
    });
  });

  it("retry jitter uses value from ActiveJob::Base.retry_jitter by default", async () => {
    const oldJitter = Base.retryJitter;
    Base.retryJitter = 4.0;
    try {
      travelTo(Time.now());

      const randomAmount = 1;

      await stub(Kernel, "rand", randomAmount, [], async () => {
        await RetryJob.performLater("PolynomialWaitTenAttemptsError", 5, ":log_scheduled_at");

        expect(JobBuffer.values()).toEqual([
          "Raised PolynomialWaitTenAttemptsError for the 1st time",
          `Next execution scheduled at ${toF(Time.now().plus(seconds(7)))}`,
          "Raised PolynomialWaitTenAttemptsError for the 2nd time",
          `Next execution scheduled at ${toF(Time.now().plus(seconds(82)))}`,
          "Raised PolynomialWaitTenAttemptsError for the 3rd time",
          `Next execution scheduled at ${toF(Time.now().plus(seconds(407)))}`,
          "Raised PolynomialWaitTenAttemptsError for the 4th time",
          `Next execution scheduled at ${toF(Time.now().plus(seconds(1282)))}`,
          "Successfully completed job",
        ]);
      });
    } finally {
      Base.retryJitter = oldJitter;
    }
  });

  it("random wait time for default job when retry jitter delay multiplier value is between 1 and 2", async () => {
    const oldJitter = Base.retryJitter;
    Base.retryJitter = 0.6;
    try {
      travelTo(Time.now());

      await RetryJob.performLater("DefaultsError", 2, ":log_scheduled_at");

      expect(JobBuffer.values()).not.toEqual([
        "Raised DefaultsError for the 1st time",
        `Next execution scheduled at ${toF(Time.now().plus(seconds(3)))}`,
        "Successfully completed job",
      ]);
    } finally {
      Base.retryJitter = oldJitter;
    }
  });

  it("random wait time for polynomially retrying job when retry jitter delay multiplier value is between 1 and 2", async () => {
    const oldJitter = Base.retryJitter;
    Base.retryJitter = 1.2;
    try {
      travelTo(Time.now());

      await RetryJob.performLater("PolynomialWaitTenAttemptsError", 2, ":log_scheduled_at");

      expect(JobBuffer.values()).not.toEqual([
        "Raised PolynomialWaitTenAttemptsError for the 1st time",
        `Next execution scheduled at ${toF(Time.now().plus(seconds(3)))}`,
        "Successfully completed job",
      ]);
    } finally {
      Base.retryJitter = oldJitter;
    }
  });

  it("random wait time for negative jitter value", async () => {
    const oldJitter = Base.retryJitter;
    Base.retryJitter = -1.2;
    try {
      travelTo(Time.now());

      await RetryJob.performLater("PolynomialWaitTenAttemptsError", 2, ":log_scheduled_at");

      expect(JobBuffer.values()).not.toEqual([
        "Raised PolynomialWaitTenAttemptsError for the 1st time",
        `Next execution scheduled at ${toF(Time.now().plus(seconds(3)))}`,
        "Successfully completed job",
      ]);
    } finally {
      Base.retryJitter = oldJitter;
    }
  });

  it("retry jitter disabled with nil", async () => {
    travelTo(Time.now());

    await RetryJob.performLater("DisabledJitterError", 3, ":log_scheduled_at");

    expect(JobBuffer.values()).toEqual([
      "Raised DisabledJitterError for the 1st time",
      `Next execution scheduled at ${toF(Time.now().plus(seconds(3)))}`,
      "Raised DisabledJitterError for the 2nd time",
      `Next execution scheduled at ${toF(Time.now().plus(seconds(3)))}`,
      "Successfully completed job",
    ]);
  });

  it("retry jitter disabled with zero", async () => {
    travelTo(Time.now());

    await RetryJob.performLater("ZeroJitterError", 3, ":log_scheduled_at");

    expect(JobBuffer.values()).toEqual([
      "Raised ZeroJitterError for the 1st time",
      `Next execution scheduled at ${toF(Time.now().plus(seconds(3)))}`,
      "Raised ZeroJitterError for the 2nd time",
      `Next execution scheduled at ${toF(Time.now().plus(seconds(3)))}`,
      "Successfully completed job",
    ]);
  });

  it("custom wait retrying job", async () => {
    travelTo(Time.now());

    await RetryJob.performLater("CustomWaitTenAttemptsError", 5, ":log_scheduled_at");

    expect(JobBuffer.values()).toEqual([
      "Raised CustomWaitTenAttemptsError for the 1st time",
      `Next execution scheduled at ${toF(Time.now().plus(seconds(2)))}`,
      "Raised CustomWaitTenAttemptsError for the 2nd time",
      `Next execution scheduled at ${toF(Time.now().plus(seconds(4)))}`,
      "Raised CustomWaitTenAttemptsError for the 3rd time",
      `Next execution scheduled at ${toF(Time.now().plus(seconds(6)))}`,
      "Raised CustomWaitTenAttemptsError for the 4th time",
      `Next execution scheduled at ${toF(Time.now().plus(seconds(8)))}`,
      "Successfully completed job",
    ]);
  });

  it("use individual execution timers when calculating retry delay", async () => {
    travelTo(Time.now());

    const exceptionsToRaise = [
      "PolynomialWaitTenAttemptsError",
      "CustomWaitTenAttemptsError",
      "PolynomialWaitTenAttemptsError",
      "CustomWaitTenAttemptsError",
    ];

    const randomAmount = 1;

    await stub(Kernel, "rand", randomAmount, [], async () => {
      await RetryJob.performLater(exceptionsToRaise, 5, ":log_scheduled_at");

      const delayForJitter = (delay: number) => randomAmount * delay * Base.retryJitter;

      expect(JobBuffer.values()).toEqual([
        "Raised PolynomialWaitTenAttemptsError for the 1st time",
        `Next execution scheduled at ${toF(Time.now().plus(seconds(3)).plus(delayForJitter(1)))}`,
        "Raised CustomWaitTenAttemptsError for the 2nd time",
        `Next execution scheduled at ${toF(Time.now().plus(seconds(2)))}`,
        "Raised PolynomialWaitTenAttemptsError for the 3rd time",
        `Next execution scheduled at ${toF(Time.now().plus(seconds(18)).plus(delayForJitter(16)))}`,
        "Raised CustomWaitTenAttemptsError for the 4th time",
        `Next execution scheduled at ${toF(Time.now().plus(seconds(4)))}`,
        "Successfully completed job",
      ]);
    });
  });

  it("successfully retry job throwing one of two retryable exceptions", async () => {
    await RetryJob.performLater("SecondRetryableErrorOfTwo", 3);

    expect(JobBuffer.values()).toEqual([
      "Raised SecondRetryableErrorOfTwo for the 1st time",
      "Raised SecondRetryableErrorOfTwo for the 2nd time",
      "Successfully completed job",
    ]);
  });

  it("discard job throwing one of two discardable exceptions", async () => {
    await RetryJob.performLater("SecondDiscardableErrorOfTwo", 2);
    expect(JobBuffer.values()).toEqual(["Raised SecondDiscardableErrorOfTwo for the 1st time"]);
  });

  it("successfully retry job throwing DeserializationError", async () => {
    await RetryJob.performLater(new Person(404), 5);
    expect(JobBuffer.values()).toEqual(["Raised ActiveJob::DeserializationError for the 5 time"]);
  });

  it("successfully retry job throwing UnlimitedRetryError a few times", async () => {
    await RetryJob.performLater("UnlimitedRetryError", 10);

    expect(JobBuffer.values().length).toBe(10);
    expect(JobBuffer.values()[8]).toBe("Raised UnlimitedRetryError for the 9th time");
    expect(JobBuffer.values()[9]).toBe("Successfully completed job");
  });

  it("running a job enqueued by AJ 5.2", async () => {
    const job = new RetryJob("DefaultsError", 6);
    job.exceptionExecutions = null;

    await expect(job.enqueue()).rejects.toThrow(DefaultsError);

    expect(JobBuffer.values().length).toBe(5);
  });

  it("running a job enqueued and attempted under AJ 5.2", async () => {
    const job = new RetryJob("DefaultsError", 6);

    job.exceptionExecutions = null;
    job.executions = 4;

    await expect(job.enqueue()).rejects.toThrow(DefaultsError);

    expect(JobBuffer.values()).toEqual(["Raised DefaultsError for the 5th time"]);
  });

  it("#after_discard block is run when an unhandled error is raised", async () => {
    await expect(
      AfterDiscardRetryJob.performLater("AfterDiscardRetryJob::UnhandledError", 2),
    ).rejects.toThrow(AfterDiscardErrors.UnhandledError);

    expect(JobBuffer.lastValue()).toBe(
      "Ran after_discard for job. Message: AfterDiscardRetryJob::UnhandledError",
    );
  });

  it("#after_discard block is run when #retry_on is passed a block", async () => {
    await AfterDiscardRetryJob.performLater("AfterDiscardRetryJob::CustomCatchError", 6);

    expect(JobBuffer.lastValue()).toBe(
      "Ran after_discard for job. Message: AfterDiscardRetryJob::CustomCatchError",
    );
  });

  it("#after_discard block is only run once when an error class and its superclass are handled by separate #retry_on calls", async () => {
    await expect(
      AfterDiscardRetryJob.performLater("AfterDiscardRetryJob::ChildAfterDiscardError", 6),
    ).rejects.toThrow(AfterDiscardErrors.ChildAfterDiscardError);
    expect(JobBuffer.values().slice(-2)).toEqual([
      "Raised AfterDiscardRetryJob::ChildAfterDiscardError for the 5th time",
      "Ran after_discard for job. Message: AfterDiscardRetryJob::ChildAfterDiscardError",
    ]);
  });

  it("#after_discard is run when a job is discarded via #discard_on", async () => {
    await AfterDiscardRetryJob.performLater("AfterDiscardRetryJob::DiscardableError", 2);

    expect(JobBuffer.lastValue()).toBe(
      "Ran after_discard for job. Message: AfterDiscardRetryJob::DiscardableError",
    );
  });

  it("#after_discard is run when a job is discarded via #discard_on with a block passed to #discard_on", async () => {
    await AfterDiscardRetryJob.performLater("AfterDiscardRetryJob::CustomDiscardableError", 2);

    const expectedArray = [
      "Dealt with a job that was discarded in a custom way. Message: AfterDiscardRetryJob::CustomDiscardableError",
      "Ran after_discard for job. Message: AfterDiscardRetryJob::CustomDiscardableError",
    ];
    expect(JobBuffer.values().slice(-2)).toEqual(expectedArray);
  });
});
