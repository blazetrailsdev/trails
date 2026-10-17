import "./test-helpers/helper.js";
import { Duration, Notifications } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/testing/autorun";
import { Time as RubyTime } from "@blazetrails/date";
import {
  NotImplementedError,
  block as rbBlock,
  rbObjClass,
  sort,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { TestHost } from "./codegen-runtime.js";
import { EnqueueError, performAllLater } from "./enqueuing.js";
import { EnqueueErrorJob } from "./test-helpers/jobs/enqueue-error-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { MultipleKwargsJob } from "./test-helpers/jobs/multiple-kwargs-job.js";
import { clear, lastValue, values } from "./test-helpers/support/job-buffer.js";
import { describe, beforeEach, it, expect, afterEach } from "vitest";

describe("QueuingTest", () => {
  class QueuingTest extends TestHost {}
  registerConstant("QueuingTest", QueuingTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  beforeEach(async ({ testCase }: any) => {
    await clear();
  });
  it("run queued job", async ({ testCase }: any) => {
    await await HelloJob.performLater();
    expect(await lastValue()).toEqual("David says hello");
  });
  it("run queued job with arguments", async ({ testCase }: any) => {
    await await HelloJob.performLater("Jamie");
    expect(await lastValue()).toEqual("Jamie says hello");
  });
  it("run queued job later", async ({ testCase }: any) => {
    let result: any;
    try {
      result = await await (
        await HelloJob.set({ waitUntil: await (await Duration.seconds(1)).ago() })
      ).performLater("Jamie");
      expect(result).toBeTruthy();
    } catch (error: any) {
      if (error instanceof NotImplementedError) {
        await testCase.pass();
      } else {
        throw error;
      }
    }
  });
  it("job returned by enqueue has the arguments available", async ({ testCase }: any) => {
    const job: any = await await HelloJob.performLater("Jamie");
    expect(await job.arguments).toEqual(["Jamie"]);
  });
  it("job returned by perform_at has the timestamp available", async ({ testCase }: any) => {
    let job: any;
    try {
      job = await await (
        await HelloJob.set({ waitUntil: await RubyTime.utc(2014, 1, 1) })
      ).performLater();
      expect(await job.scheduledAt).toEqual(await RubyTime.utc(2014, 1, 1));
    } catch (error: any) {
      if (error instanceof NotImplementedError) {
        await testCase.pass();
      } else {
        throw error;
      }
    }
  });
  it("job is yielded to block after enqueue with successfully_enqueued property set", async ({
    testCase,
  }: any) => {
    await await HelloJob.performLater(
      "John",
      rbBlock(async (job?: any) => {
        expect(await lastValue()).toEqual("John says hello");
        expect(await job.arguments).toEqual(["John"]);
        expect(await job.isSuccessfullyEnqueued()).toEqual(true);
        return expect((await job.enqueueError) ?? null).toBeNull();
      }),
    );
  });
  it("when enqueuing raises an EnqueueError job is yielded to block with error set on job", async ({
    testCase,
  }: any) => {
    await await EnqueueErrorJob.performLater(
      rbBlock(async (job?: any) => {
        expect(await job.isSuccessfullyEnqueued()).toEqual(false);
        return expect(await rbObjClass(await job.enqueueError)).toEqual(EnqueueError);
      }),
    );
  });
  it("run multiple queued jobs", async ({ testCase }: any) => {
    await performAllLater(new HelloJob("Jamie"), new HelloJob("John"));
    expect(await sort(await values())).toEqual(["Jamie says hello", "John says hello"]);
  });
  it("run multiple queued jobs passed as array", async ({ testCase }: any) => {
    await performAllLater([new HelloJob("Jamie"), new HelloJob("John")]);
    expect(await sort(await values())).toEqual(["Jamie says hello", "John says hello"]);
  });
  it("run multiple queued jobs of different classes", async ({ testCase }: any) => {
    await performAllLater([
      new HelloJob("Jamie"),
      new MultipleKwargsJob({ argument1: "John", argument2: 42 }),
    ]);
    expect(await sort(await values())).toEqual([
      "Jamie says hello",
      "Job with argument1: John, argument2: 42",
    ]);
  });
  it("perform_all_later enqueues jobs with schedules", async ({ testCase }: any) => {
    let scheduledJob1: any, scheduledJob2: any;
    try {
      scheduledJob1 = new HelloJob("Scheduled 2014");
      await scheduledJob1.set({ waitUntil: await RubyTime.utc(2014, 1, 1) });
      scheduledJob2 = new HelloJob("Scheduled 2015");
      scheduledJob2.scheduledAt = await RubyTime.utc(2015, 1, 1);
      await performAllLater(scheduledJob1, scheduledJob2);
      expect(await sort(await values())).toEqual([
        "Scheduled 2014 says hello",
        "Scheduled 2015 says hello",
      ]);
    } catch (error: any) {
      if (error instanceof NotImplementedError) {
        await testCase.pass();
      } else {
        throw error;
      }
    }
  });
  it("perform_all_later instrumentation", async ({ testCase }: any) => {
    const jobs: any = [new HelloJob("Jamie"), new HelloJob("John")];
    let called: any = false;
    const subscriber: any = async (_?: any, _2?: any, _3?: any, _4?: any, payload?: any) => {
      called = true;
      expect(await payload["adapter"]).toBeTruthy();
      expect(await payload["jobs"]).toEqual(jobs);
      return expect(await payload["enqueued_count"]).toEqual(2);
    };
    await await Notifications.subscribed(
      subscriber,
      "enqueue_all.active_job",
      async () => await performAllLater(jobs),
    );
    expect(called).toBeTruthy();
  });
});
