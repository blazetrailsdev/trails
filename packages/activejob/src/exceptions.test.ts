import "./test-helpers/helper.js";
import { assertRaises, stub, Duration } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/testing/autorun";
import { Time as RubyTime } from "@blazetrails/date";
import { rbObjClass, Kernel, rbEqual, last, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { rbBinop, rbToF, TestHost } from "./codegen-runtime.js";
import { QueueAdapters } from "./namespaces.js";
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
import { clear, values, lastValue } from "./test-helpers/support/job-buffer.js";
import { describe, beforeEach, it, expect, afterEach } from "vitest";

describe("ExceptionsTest", () => {
  class ExceptionsTest extends TestHost {}
  registerConstant("ExceptionsTest", ExceptionsTest);
  function isAdapterSkipsScheduling(queueAdapter: any): any {
    return [InlineAdapter, AsyncAdapter, (QueueAdapters as any).SneakersAdapter].includes(
      rbObjClass(queueAdapter),
    );
  }
  ExceptionsTest.isAdapterSkipsScheduling = isAdapterSkipsScheduling;
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  if (!ExceptionsTest.isAdapterSkipsScheduling(Base.queueAdapter())) {
    beforeEach(async ({ testCase }: any) => {
      await clear();
    });
    it("successfully retry job throwing exception against defaults", async ({ testCase }: any) => {
      await await RetryJob.performLater("DefaultsError", 5);
      expect(await values()).toEqual([
        "Raised DefaultsError for the 1st time",
        "Raised DefaultsError for the 2nd time",
        "Raised DefaultsError for the 3rd time",
        "Raised DefaultsError for the 4th time",
        "Successfully completed job",
      ]);
    });
    it("successfully retry job throwing exception against higher limit", async ({
      testCase,
    }: any) => {
      await await RetryJob.performLater("ShortWaitTenAttemptsError", 9);
      expect(await (await values()).length).toEqual(9);
    });
    it("keeps the same attempts counter for several exceptions listed in the same retry_on declaration", async ({
      testCase,
    }: any) => {
      const exceptionsToRaise: any = [
        "FirstRetryableErrorOfTwo",
        "FirstRetryableErrorOfTwo",
        "FirstRetryableErrorOfTwo",
        "SecondRetryableErrorOfTwo",
        "SecondRetryableErrorOfTwo",
      ];
      await assertRaises(
        [SecondRetryableErrorOfTwo],
        {},
        async () => await await RetryJob.performLater(exceptionsToRaise, 5),
      );
      expect(await values()).toEqual([
        "Raised FirstRetryableErrorOfTwo for the 1st time",
        "Raised FirstRetryableErrorOfTwo for the 2nd time",
        "Raised FirstRetryableErrorOfTwo for the 3rd time",
        "Raised SecondRetryableErrorOfTwo for the 4th time",
      ]);
    });
    it("keeps a separate attempts counter for each individual retry_on declaration", async ({
      testCase,
    }: any) => {
      const exceptionsToRaise: any = [
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
          await await RetryJob.performLater(exceptionsToRaise, 10);
          return expect(await values()).toEqual([
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
    });
    it("failed retry job when exception kept occurring against defaults", async ({
      testCase,
    }: any) => {
      try {
        await await RetryJob.performLater("DefaultsError", 6);
        expect(await lastValue()).toEqual("Raised DefaultsError for the 5th time");
      } catch (error: any) {
        if (error instanceof DefaultsError) {
          await testCase.pass();
        } else {
          throw error;
        }
      }
    });
    it("failed retry job when exception kept occurring against higher limit", async ({
      testCase,
    }: any) => {
      try {
        await await RetryJob.performLater("ShortWaitTenAttemptsError", 11);
        expect(await lastValue()).toEqual("Raised ShortWaitTenAttemptsError for the 10th time");
      } catch (error: any) {
        if (error instanceof ShortWaitTenAttemptsError) {
          await testCase.pass();
        } else {
          throw error;
        }
      }
    });
    it("discard job", async ({ testCase }: any) => {
      await await RetryJob.performLater("DiscardableError", 2);
      expect(await lastValue()).toEqual("Raised DiscardableError for the 1st time");
    });
    it("custom handling of discarded job", async ({ testCase }: any) => {
      await await RetryJob.performLater("CustomDiscardableError", 2);
      expect(await lastValue()).toEqual(
        "Dealt with a job that was discarded in a custom way. Message: CustomDiscardableError",
      );
    });
    it("custom handling of job that exceeds retry attempts", async ({ testCase }: any) => {
      await await RetryJob.performLater("CustomCatchError", 6);
      expect(await lastValue()).toEqual(
        "Dealt with a job that failed to retry in a custom way after 6 attempts. Message: CustomCatchError",
      );
    });
    it("long wait job", async ({ testCase }: any) => {
      await testCase.travelTo(await RubyTime.now());
      const randomAmount: any = 1;
      const delayForJitter: any = await ((await (randomAmount * 3600)) * (await Base.retryJitter));
      await await stub(Kernel, "rand", randomAmount, [], async () => {
        await await RetryJob.performLater("LongWaitError", 2, "log_scheduled_at");
        return expect(await values()).toEqual([
          "Raised LongWaitError for the 1st time",
          `Next execution scheduled at ${await rbToF(await rbBinop(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(3600)), "+", delayForJitter))}`,
          "Successfully completed job",
        ]);
      });
    });
    it("polynomially retrying job includes jitter", async ({ testCase }: any) => {
      await testCase.travelTo(await RubyTime.now());
      const randomAmount: any = 2;
      const delayForJitter: any = async (delay?: any) =>
        await ((await (randomAmount * delay)) * (await Base.retryJitter));
      await await stub(Kernel, "rand", randomAmount, [], async () => {
        await await RetryJob.performLater("PolynomialWaitTenAttemptsError", 5, "log_scheduled_at");
        return expect(await values()).toEqual([
          "Raised PolynomialWaitTenAttemptsError for the 1st time",
          `Next execution scheduled at ${await rbToF(await rbBinop(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(3)), "+", await delayForJitter(1)))}`,
          "Raised PolynomialWaitTenAttemptsError for the 2nd time",
          `Next execution scheduled at ${await rbToF(await rbBinop(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(18)), "+", await delayForJitter(16)))}`,
          "Raised PolynomialWaitTenAttemptsError for the 3rd time",
          `Next execution scheduled at ${await rbToF(await rbBinop(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(83)), "+", await delayForJitter(81)))}`,
          "Raised PolynomialWaitTenAttemptsError for the 4th time",
          `Next execution scheduled at ${await rbToF(await rbBinop(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(258)), "+", await delayForJitter(256)))}`,
          "Successfully completed job",
        ]);
      });
    });
    it("retry jitter uses value from ActiveJob::Base.retry_jitter by default", async ({
      testCase,
    }: any) => {
      let oldJitter: any, randomAmount: any;
      try {
        oldJitter = await Base.retryJitter;
        Base.retryJitter = new Number(4.0);
        await testCase.travelTo(await RubyTime.now());
        randomAmount = 1;
        await await stub(Kernel, "rand", randomAmount, [], async () => {
          await await RetryJob.performLater(
            "PolynomialWaitTenAttemptsError",
            5,
            "log_scheduled_at",
          );
          return expect(await values()).toEqual([
            "Raised PolynomialWaitTenAttemptsError for the 1st time",
            `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(7)))}`,
            "Raised PolynomialWaitTenAttemptsError for the 2nd time",
            `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(82)))}`,
            "Raised PolynomialWaitTenAttemptsError for the 3rd time",
            `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(407)))}`,
            "Raised PolynomialWaitTenAttemptsError for the 4th time",
            `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(1282)))}`,
            "Successfully completed job",
          ]);
        });
      } finally {
        Base.retryJitter = oldJitter;
      }
    });
    it("random wait time for default job when retry jitter delay multiplier value is between 1 and 2", async ({
      testCase,
    }: any) => {
      let oldJitter: any;
      try {
        oldJitter = await Base.retryJitter;
        Base.retryJitter = 0.6;
        await testCase.travelTo(await RubyTime.now());
        await await RetryJob.performLater("DefaultsError", 2, "log_scheduled_at");
        expect(
          rbEqual(await values(), [
            "Raised DefaultsError for the 1st time",
            `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(3)))}`,
            "Successfully completed job",
          ]),
        ).toBe(false);
      } finally {
        Base.retryJitter = oldJitter;
      }
    });
    it("random wait time for polynomially retrying job when retry jitter delay multiplier value is between 1 and 2", async ({
      testCase,
    }: any) => {
      let oldJitter: any;
      try {
        oldJitter = await Base.retryJitter;
        Base.retryJitter = 1.2;
        await testCase.travelTo(await RubyTime.now());
        await await RetryJob.performLater("PolynomialWaitTenAttemptsError", 2, "log_scheduled_at");
        expect(
          rbEqual(await values(), [
            "Raised PolynomialWaitTenAttemptsError for the 1st time",
            `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(3)))}`,
            "Successfully completed job",
          ]),
        ).toBe(false);
      } finally {
        Base.retryJitter = oldJitter;
      }
    });
    it("random wait time for negative jitter value", async ({ testCase }: any) => {
      let oldJitter: any;
      try {
        oldJitter = await Base.retryJitter;
        Base.retryJitter = -1.2;
        await testCase.travelTo(await RubyTime.now());
        await await RetryJob.performLater("PolynomialWaitTenAttemptsError", 2, "log_scheduled_at");
        expect(
          rbEqual(await values(), [
            "Raised PolynomialWaitTenAttemptsError for the 1st time",
            `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(3)))}`,
            "Successfully completed job",
          ]),
        ).toBe(false);
      } finally {
        Base.retryJitter = oldJitter;
      }
    });
    it("retry jitter disabled with nil", async ({ testCase }: any) => {
      await testCase.travelTo(await RubyTime.now());
      await await RetryJob.performLater("DisabledJitterError", 3, "log_scheduled_at");
      expect(await values()).toEqual([
        "Raised DisabledJitterError for the 1st time",
        `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(3)))}`,
        "Raised DisabledJitterError for the 2nd time",
        `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(3)))}`,
        "Successfully completed job",
      ]);
    });
    it("retry jitter disabled with zero", async ({ testCase }: any) => {
      await testCase.travelTo(await RubyTime.now());
      await await RetryJob.performLater("ZeroJitterError", 3, "log_scheduled_at");
      expect(await values()).toEqual([
        "Raised ZeroJitterError for the 1st time",
        `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(3)))}`,
        "Raised ZeroJitterError for the 2nd time",
        `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(3)))}`,
        "Successfully completed job",
      ]);
    });
    it("custom wait retrying job", async ({ testCase }: any) => {
      await testCase.travelTo(await RubyTime.now());
      await await RetryJob.performLater("CustomWaitTenAttemptsError", 5, "log_scheduled_at");
      expect(await values()).toEqual([
        "Raised CustomWaitTenAttemptsError for the 1st time",
        `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(2)))}`,
        "Raised CustomWaitTenAttemptsError for the 2nd time",
        `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(4)))}`,
        "Raised CustomWaitTenAttemptsError for the 3rd time",
        `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(6)))}`,
        "Raised CustomWaitTenAttemptsError for the 4th time",
        `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(8)))}`,
        "Successfully completed job",
      ]);
    });
    it("use individual execution timers when calculating retry delay", async ({
      testCase,
    }: any) => {
      await testCase.travelTo(await RubyTime.now());
      const exceptionsToRaise: any = [
        "PolynomialWaitTenAttemptsError",
        "CustomWaitTenAttemptsError",
        "PolynomialWaitTenAttemptsError",
        "CustomWaitTenAttemptsError",
      ];
      const randomAmount: any = 1;
      await await stub(Kernel, "rand", randomAmount, [], async () => {
        await await RetryJob.performLater(exceptionsToRaise, 5, "log_scheduled_at");
        const delayForJitter: any = async (delay?: any) =>
          await ((await (randomAmount * delay)) * (await Base.retryJitter));
        return expect(await values()).toEqual([
          "Raised PolynomialWaitTenAttemptsError for the 1st time",
          `Next execution scheduled at ${await rbToF(await rbBinop(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(3)), "+", await delayForJitter(1)))}`,
          "Raised CustomWaitTenAttemptsError for the 2nd time",
          `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(2)))}`,
          "Raised PolynomialWaitTenAttemptsError for the 3rd time",
          `Next execution scheduled at ${await rbToF(await rbBinop(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(18)), "+", await delayForJitter(16)))}`,
          "Raised CustomWaitTenAttemptsError for the 4th time",
          `Next execution scheduled at ${await rbToF(await rbBinop(await RubyTime.now(), "+", await Duration.seconds(4)))}`,
          "Successfully completed job",
        ]);
      });
    });
    it("successfully retry job throwing one of two retryable exceptions", async ({
      testCase,
    }: any) => {
      await await RetryJob.performLater("SecondRetryableErrorOfTwo", 3);
      expect(await values()).toEqual([
        "Raised SecondRetryableErrorOfTwo for the 1st time",
        "Raised SecondRetryableErrorOfTwo for the 2nd time",
        "Successfully completed job",
      ]);
    });
    it("discard job throwing one of two discardable exceptions", async ({ testCase }: any) => {
      await await RetryJob.performLater("SecondDiscardableErrorOfTwo", 2);
      expect(await values()).toEqual(["Raised SecondDiscardableErrorOfTwo for the 1st time"]);
    });
    it("successfully retry job throwing DeserializationError", async ({ testCase }: any) => {
      await await RetryJob.performLater(new Person(404), 5);
      expect(await values()).toEqual(["Raised ActiveJob::DeserializationError for the 5 time"]);
    });
    it("successfully retry job throwing UnlimitedRetryError a few times", async ({
      testCase,
    }: any) => {
      await await RetryJob.performLater("UnlimitedRetryError", 10);
      expect(await (await values()).length).toEqual(10);
      expect(await (await values())[8]).toEqual("Raised UnlimitedRetryError for the 9th time");
      expect(await (await values())[9]).toEqual("Successfully completed job");
    });
    it("running a job enqueued by AJ 5.2", async ({ testCase }: any) => {
      const job: any = new RetryJob("DefaultsError", 6);
      job.exceptionExecutions = null;
      await assertRaises([DefaultsError], {}, async () => await await job.enqueue());
      expect(await (await values()).length).toEqual(5);
    });
    it("running a job enqueued and attempted under AJ 5.2", async ({ testCase }: any) => {
      const job: any = new RetryJob("DefaultsError", 6);
      job.exceptionExecutions = null;
      job.executions = 4;
      await assertRaises([DefaultsError], {}, async () => await await job.enqueue());
      expect(await values()).toEqual(["Raised DefaultsError for the 5th time"]);
    });
    it("#after_discard block is run when an unhandled error is raised", async ({
      testCase,
    }: any) => {
      await assertRaises(
        [UnhandledError],
        {},
        async () =>
          await await AfterDiscardRetryJob.performLater("AfterDiscardRetryJob::UnhandledError", 2),
      );
      expect(await lastValue()).toEqual(
        "Ran after_discard for job. Message: AfterDiscardRetryJob::UnhandledError",
      );
    });
    it("#after_discard block is run when #retry_on is passed a block", async ({
      testCase,
    }: any) => {
      await await AfterDiscardRetryJob.performLater("AfterDiscardRetryJob::CustomCatchError", 6);
      expect(await lastValue()).toEqual(
        "Ran after_discard for job. Message: AfterDiscardRetryJob::CustomCatchError",
      );
    });
    it("#after_discard block is only run once when an error class and its superclass are handled by separate #retry_on calls", async ({
      testCase,
    }: any) => {
      await assertRaises(
        [ChildAfterDiscardError],
        {},
        async () =>
          await await AfterDiscardRetryJob.performLater(
            "AfterDiscardRetryJob::ChildAfterDiscardError",
            6,
          ),
      );
      expect(await last(await values(), 2)).toEqual([
        "Raised AfterDiscardRetryJob::ChildAfterDiscardError for the 5th time",
        "Ran after_discard for job. Message: AfterDiscardRetryJob::ChildAfterDiscardError",
      ]);
    });
    it("#after_discard is run when a job is discarded via #discard_on", async ({
      testCase,
    }: any) => {
      await await AfterDiscardRetryJob.performLater("AfterDiscardRetryJob::DiscardableError", 2);
      expect(await lastValue()).toEqual(
        "Ran after_discard for job. Message: AfterDiscardRetryJob::DiscardableError",
      );
    });
    it("#after_discard is run when a job is discarded via #discard_on with a block passed to #discard_on", async ({
      testCase,
    }: any) => {
      await await AfterDiscardRetryJob.performLater(
        "AfterDiscardRetryJob::CustomDiscardableError",
        2,
      );
      const expectedArray: any = [
        "Dealt with a job that was discarded in a custom way. Message: AfterDiscardRetryJob::CustomDiscardableError",
        "Ran after_discard for job. Message: AfterDiscardRetryJob::CustomDiscardableError",
      ];
      expect(await last(await values(), 2)).toEqual(expectedArray);
    });
  }
});
