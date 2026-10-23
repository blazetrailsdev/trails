import type {} from "@blazetrails/vitest-matchers";
import "./test-helpers/helper.js";
import { assertRaises, travelTo, stub, Duration } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { Kernel } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { AsyncAdapter } from "./queue-adapters/async-adapter.js";
import { InlineAdapter } from "./queue-adapters/inline-adapter.js";
import {
  AfterDiscardRetryJob,
  UnhandledError,
  ChildAfterDiscardError,
} from "./test-helpers/jobs/after-discard-retry-job.js";
import {
  RetryJob,
  SecondRetryableErrorOfTwo,
  DefaultsError,
  ShortWaitTenAttemptsError,
} from "./test-helpers/jobs/retry-job.js";
import { Person } from "./test-helpers/models/person.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { beforeEach, expect, it, describe } from "vitest";

describe("ExceptionsTest", () => {
  function isAdapterSkipsScheduling(queueAdapter: Record<string, unknown>) {
    return [InlineAdapter, AsyncAdapter, undefined].includes(queueAdapter.constructor);
  }

  beforeEach(() => {
    JobBuffer.clear();
  });

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "successfully retry job throwing exception against defaults",
    async () => {
      await RetryJob.performLater("DefaultsError", 5);
      expect(JobBuffer.values()).toEqual([
        "Raised DefaultsError for the 1st time",
        "Raised DefaultsError for the 2nd time",
        "Raised DefaultsError for the 3rd time",
        "Raised DefaultsError for the 4th time",
        "Successfully completed job",
      ]);
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "successfully retry job throwing exception against higher limit",
    async () => {
      await RetryJob.performLater("ShortWaitTenAttemptsError", 9);
      expect(await JobBuffer.values().length).toEqual(9);
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "keeps the same attempts counter for several exceptions listed in the same retry_on declaration",
    async () => {
      const exceptionsToRaise = [
        "FirstRetryableErrorOfTwo",
        "FirstRetryableErrorOfTwo",
        "FirstRetryableErrorOfTwo",
        "SecondRetryableErrorOfTwo",
        "SecondRetryableErrorOfTwo",
      ];
      await assertRaises(
        [SecondRetryableErrorOfTwo],
        {},
        async () => await RetryJob.performLater(exceptionsToRaise, 5),
      );
      expect(JobBuffer.values()).toEqual([
        "Raised FirstRetryableErrorOfTwo for the 1st time",
        "Raised FirstRetryableErrorOfTwo for the 2nd time",
        "Raised FirstRetryableErrorOfTwo for the 3rd time",
        "Raised SecondRetryableErrorOfTwo for the 4th time",
      ]);
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "keeps a separate attempts counter for each individual retry_on declaration",
    async () => {
      const exceptionsToRaise = [
        "DefaultsError",
        "DefaultsError",
        "DefaultsError",
        "DefaultsError",
        "FirstRetryableErrorOfTwo",
        "FirstRetryableErrorOfTwo",
        "FirstRetryableErrorOfTwo",
      ];
      await expect(
        (async () => {
          await RetryJob.performLater(exceptionsToRaise, 10);
          return expect(JobBuffer.values()).toEqual([
            "Raised DefaultsError for the 1st time",
            "Raised DefaultsError for the 2nd time",
            "Raised DefaultsError for the 3rd time",
            "Raised DefaultsError for the 4th time",
            "Raised FirstRetryableErrorOfTwo for the 5th time",
            "Raised FirstRetryableErrorOfTwo for the 6th time",
            "Raised FirstRetryableErrorOfTwo for the 7th time",
            "Successfully completed job",
          ]);
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "failed retry job when exception kept occurring against defaults",
    async () => {
      try {
        await RetryJob.performLater("DefaultsError", 6);
        expect(JobBuffer.lastValue()).toEqual("Raised DefaultsError for the 5th time");
      } catch (error) {
        if (error instanceof DefaultsError) {
          expect(true).toBe(true);
        } else {
          throw error;
        }
      }
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "failed retry job when exception kept occurring against higher limit",
    async () => {
      try {
        await RetryJob.performLater("ShortWaitTenAttemptsError", 11);
        expect(JobBuffer.lastValue()).toEqual("Raised ShortWaitTenAttemptsError for the 10th time");
      } catch (error) {
        if (error instanceof ShortWaitTenAttemptsError) {
          expect(true).toBe(true);
        } else {
          throw error;
        }
      }
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "discard job",
    async () => {
      await RetryJob.performLater("DiscardableError", 2);
      expect(JobBuffer.lastValue()).toEqual("Raised DiscardableError for the 1st time");
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "custom handling of discarded job",
    async () => {
      await RetryJob.performLater("CustomDiscardableError", 2);
      expect(JobBuffer.lastValue()).toEqual(
        "Dealt with a job that was discarded in a custom way. Message: CustomDiscardableError",
      );
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "custom handling of job that exceeds retry attempts",
    async () => {
      await RetryJob.performLater("CustomCatchError", 6);
      expect(JobBuffer.lastValue()).toEqual(
        "Dealt with a job that failed to retry in a custom way after 6 attempts. Message: CustomCatchError",
      );
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "long wait job",
    async () => {
      travelTo(RubyTime.now());
      const randomAmount = 1;
      const delayForJitter = await ((await (randomAmount * 3600)) * (await Base.retryJitter));
      await stub(Kernel, "rand", randomAmount, [], async () => {
        await RetryJob.performLater("LongWaitError", 2, "log_scheduled_at");
        return expect(JobBuffer.values()).toEqualRuby([
          "Raised LongWaitError for the 1st time",
          `Next execution scheduled at ${(await (await RubyTime.now().plus(await Duration.seconds(3600))).plus(delayForJitter)).toF()}`,
          "Successfully completed job",
        ]);
      });
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "polynomially retrying job includes jitter",
    async () => {
      travelTo(RubyTime.now());
      const randomAmount = 2;
      const delayForJitter = async (delay?: number | null) =>
        await ((await (randomAmount * delay)) * (await Base.retryJitter));
      await stub(Kernel, "rand", randomAmount, [], async () => {
        await RetryJob.performLater("PolynomialWaitTenAttemptsError", 5, "log_scheduled_at");
        return expect(JobBuffer.values()).toEqualRuby([
          "Raised PolynomialWaitTenAttemptsError for the 1st time",
          `Next execution scheduled at ${(await (await RubyTime.now().plus(await Duration.seconds(3))).plus(await delayForJitter(1))).toF()}`,
          "Raised PolynomialWaitTenAttemptsError for the 2nd time",
          `Next execution scheduled at ${(await (await RubyTime.now().plus(await Duration.seconds(18))).plus(await delayForJitter(16))).toF()}`,
          "Raised PolynomialWaitTenAttemptsError for the 3rd time",
          `Next execution scheduled at ${(await (await RubyTime.now().plus(await Duration.seconds(83))).plus(await delayForJitter(81))).toF()}`,
          "Raised PolynomialWaitTenAttemptsError for the 4th time",
          `Next execution scheduled at ${(await (await RubyTime.now().plus(await Duration.seconds(258))).plus(await delayForJitter(256))).toF()}`,
          "Successfully completed job",
        ]);
      });
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "retry jitter uses value from ActiveJob::Base.retry_jitter by default",
    async () => {
      let oldJitter: unknown, randomAmount: unknown;
      try {
        oldJitter = await Base.retryJitter;
        Base.retryJitter = new Number(4.0);
        travelTo(RubyTime.now());
        randomAmount = 1;
        await stub(Kernel, "rand", randomAmount, [], async () => {
          await RetryJob.performLater("PolynomialWaitTenAttemptsError", 5, "log_scheduled_at");
          return expect(JobBuffer.values()).toEqualRuby([
            "Raised PolynomialWaitTenAttemptsError for the 1st time",
            `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(7))).toF()}`,
            "Raised PolynomialWaitTenAttemptsError for the 2nd time",
            `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(82))).toF()}`,
            "Raised PolynomialWaitTenAttemptsError for the 3rd time",
            `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(407))).toF()}`,
            "Raised PolynomialWaitTenAttemptsError for the 4th time",
            `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(1282))).toF()}`,
            "Successfully completed job",
          ]);
        });
      } finally {
        Base.retryJitter = oldJitter as number;
      }
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "random wait time for default job when retry jitter delay multiplier value is between 1 and 2",
    async () => {
      let oldJitter: unknown;
      try {
        oldJitter = await Base.retryJitter;
        Base.retryJitter = 0.6;
        travelTo(RubyTime.now());
        await RetryJob.performLater("DefaultsError", 2, "log_scheduled_at");
        expect(JobBuffer.values()).not.toEqualRuby([
          "Raised DefaultsError for the 1st time",
          `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(3))).toF()}`,
          "Successfully completed job",
        ]);
      } finally {
        Base.retryJitter = oldJitter as number;
      }
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "random wait time for polynomially retrying job when retry jitter delay multiplier value is between 1 and 2",
    async () => {
      let oldJitter: unknown;
      try {
        oldJitter = await Base.retryJitter;
        Base.retryJitter = 1.2;
        travelTo(RubyTime.now());
        await RetryJob.performLater("PolynomialWaitTenAttemptsError", 2, "log_scheduled_at");
        expect(JobBuffer.values()).not.toEqualRuby([
          "Raised PolynomialWaitTenAttemptsError for the 1st time",
          `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(3))).toF()}`,
          "Successfully completed job",
        ]);
      } finally {
        Base.retryJitter = oldJitter as number;
      }
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "random wait time for negative jitter value",
    async () => {
      let oldJitter: unknown;
      try {
        oldJitter = await Base.retryJitter;
        Base.retryJitter = -1.2;
        travelTo(RubyTime.now());
        await RetryJob.performLater("PolynomialWaitTenAttemptsError", 2, "log_scheduled_at");
        expect(JobBuffer.values()).not.toEqualRuby([
          "Raised PolynomialWaitTenAttemptsError for the 1st time",
          `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(3))).toF()}`,
          "Successfully completed job",
        ]);
      } finally {
        Base.retryJitter = oldJitter as number;
      }
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "retry jitter disabled with nil",
    async () => {
      travelTo(RubyTime.now());
      await RetryJob.performLater("DisabledJitterError", 3, "log_scheduled_at");
      expect(JobBuffer.values()).toEqualRuby([
        "Raised DisabledJitterError for the 1st time",
        `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(3))).toF()}`,
        "Raised DisabledJitterError for the 2nd time",
        `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(3))).toF()}`,
        "Successfully completed job",
      ]);
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "retry jitter disabled with zero",
    async () => {
      travelTo(RubyTime.now());
      await RetryJob.performLater("ZeroJitterError", 3, "log_scheduled_at");
      expect(JobBuffer.values()).toEqualRuby([
        "Raised ZeroJitterError for the 1st time",
        `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(3))).toF()}`,
        "Raised ZeroJitterError for the 2nd time",
        `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(3))).toF()}`,
        "Successfully completed job",
      ]);
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "custom wait retrying job",
    async () => {
      travelTo(RubyTime.now());
      await RetryJob.performLater("CustomWaitTenAttemptsError", 5, "log_scheduled_at");
      expect(JobBuffer.values()).toEqualRuby([
        "Raised CustomWaitTenAttemptsError for the 1st time",
        `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(2))).toF()}`,
        "Raised CustomWaitTenAttemptsError for the 2nd time",
        `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(4))).toF()}`,
        "Raised CustomWaitTenAttemptsError for the 3rd time",
        `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(6))).toF()}`,
        "Raised CustomWaitTenAttemptsError for the 4th time",
        `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(8))).toF()}`,
        "Successfully completed job",
      ]);
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "use individual execution timers when calculating retry delay",
    async () => {
      travelTo(RubyTime.now());
      const exceptionsToRaise = [
        "PolynomialWaitTenAttemptsError",
        "CustomWaitTenAttemptsError",
        "PolynomialWaitTenAttemptsError",
        "CustomWaitTenAttemptsError",
      ];
      const randomAmount = 1;
      await stub(Kernel, "rand", randomAmount, [], async () => {
        await RetryJob.performLater(exceptionsToRaise, 5, "log_scheduled_at");
        const delayForJitter = async (delay?: number | null) =>
          await ((await (randomAmount * delay)) * (await Base.retryJitter));
        return expect(JobBuffer.values()).toEqualRuby([
          "Raised PolynomialWaitTenAttemptsError for the 1st time",
          `Next execution scheduled at ${(await (await RubyTime.now().plus(await Duration.seconds(3))).plus(await delayForJitter(1))).toF()}`,
          "Raised CustomWaitTenAttemptsError for the 2nd time",
          `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(2))).toF()}`,
          "Raised PolynomialWaitTenAttemptsError for the 3rd time",
          `Next execution scheduled at ${(await (await RubyTime.now().plus(await Duration.seconds(18))).plus(await delayForJitter(16))).toF()}`,
          "Raised CustomWaitTenAttemptsError for the 4th time",
          `Next execution scheduled at ${(await RubyTime.now().plus(await Duration.seconds(4))).toF()}`,
          "Successfully completed job",
        ]);
      });
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "successfully retry job throwing one of two retryable exceptions",
    async () => {
      await RetryJob.performLater("SecondRetryableErrorOfTwo", 3);
      expect(JobBuffer.values()).toEqual([
        "Raised SecondRetryableErrorOfTwo for the 1st time",
        "Raised SecondRetryableErrorOfTwo for the 2nd time",
        "Successfully completed job",
      ]);
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "discard job throwing one of two discardable exceptions",
    async () => {
      await RetryJob.performLater("SecondDiscardableErrorOfTwo", 2);
      expect(JobBuffer.values()).toEqual(["Raised SecondDiscardableErrorOfTwo for the 1st time"]);
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "successfully retry job throwing DeserializationError",
    async () => {
      await RetryJob.performLater(new Person(404), 5);
      expect(JobBuffer.values()).toEqual(["Raised ActiveJob::DeserializationError for the 5 time"]);
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "successfully retry job throwing UnlimitedRetryError a few times",
    async () => {
      await RetryJob.performLater("UnlimitedRetryError", 10);
      expect(await JobBuffer.values().length).toEqual(10);
      expect(JobBuffer.values()[8]).toEqual("Raised UnlimitedRetryError for the 9th time");
      expect(JobBuffer.values()[9]).toEqual("Successfully completed job");
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "running a job enqueued by AJ 5.2",
    async () => {
      const job = new RetryJob("DefaultsError", 6);
      job.exceptionExecutions = null;
      await assertRaises([DefaultsError], {}, async () => await job.enqueue());
      expect(await JobBuffer.values().length).toEqual(5);
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "running a job enqueued and attempted under AJ 5.2",
    async () => {
      const job = new RetryJob("DefaultsError", 6);
      job.exceptionExecutions = null;
      job.executions = 4;
      await assertRaises([DefaultsError], {}, async () => await job.enqueue());
      expect(JobBuffer.values()).toEqual(["Raised DefaultsError for the 5th time"]);
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "#after_discard block is run when an unhandled error is raised",
    async () => {
      await assertRaises(
        [UnhandledError],
        {},
        async () =>
          await AfterDiscardRetryJob.performLater("AfterDiscardRetryJob::UnhandledError", 2),
      );
      expect(JobBuffer.lastValue()).toEqual(
        "Ran after_discard for job. Message: AfterDiscardRetryJob::UnhandledError",
      );
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "#after_discard block is run when #retry_on is passed a block",
    async () => {
      await AfterDiscardRetryJob.performLater("AfterDiscardRetryJob::CustomCatchError", 6);
      expect(JobBuffer.lastValue()).toEqual(
        "Ran after_discard for job. Message: AfterDiscardRetryJob::CustomCatchError",
      );
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "#after_discard block is only run once when an error class and its superclass are handled by separate #retry_on calls",
    async () => {
      await assertRaises(
        [ChildAfterDiscardError],
        {},
        async () =>
          await AfterDiscardRetryJob.performLater(
            "AfterDiscardRetryJob::ChildAfterDiscardError",
            6,
          ),
      );
      expect(await JobBuffer.values().slice(-2)).toEqual([
        "Raised AfterDiscardRetryJob::ChildAfterDiscardError for the 5th time",
        "Ran after_discard for job. Message: AfterDiscardRetryJob::ChildAfterDiscardError",
      ]);
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "#after_discard is run when a job is discarded via #discard_on",
    async () => {
      await AfterDiscardRetryJob.performLater("AfterDiscardRetryJob::DiscardableError", 2);
      expect(JobBuffer.lastValue()).toEqual(
        "Ran after_discard for job. Message: AfterDiscardRetryJob::DiscardableError",
      );
    },
  );

  it.skipIf(!!isAdapterSkipsScheduling(Base.queueAdapter as Record<string, unknown>))(
    "#after_discard is run when a job is discarded via #discard_on with a block passed to #discard_on",
    async () => {
      await AfterDiscardRetryJob.performLater("AfterDiscardRetryJob::CustomDiscardableError", 2);
      const expectedArray = [
        "Dealt with a job that was discarded in a custom way. Message: AfterDiscardRetryJob::CustomDiscardableError",
        "Ran after_discard for job. Message: AfterDiscardRetryJob::CustomDiscardableError",
      ];
      expect(await JobBuffer.values().slice(-2)).toEqualRuby(expectedArray);
    },
  );
});
