import type {} from "@blazetrails/vitest-matchers";
import "./test-helpers/helper.js";
import { Duration, Notifications } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { NotImplementedError, sort } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./active-job.js";
import { EnqueueError, performAllLater } from "./enqueuing.js";
import { EnqueueErrorJob } from "./test-helpers/jobs/enqueue-error-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { MultipleKwargsJob } from "./test-helpers/jobs/multiple-kwargs-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { beforeEach, expect, it, describe } from "vitest";

describe("QueuingTest", () => {
  beforeEach(() => {
    JobBuffer.clear();
  });

  it("run queued job", async () => {
    await HelloJob.performLater();
    expect(JobBuffer.lastValue()).toEqual("David says hello");
  });

  it("run queued job with arguments", async () => {
    await HelloJob.performLater("Jamie");
    expect(JobBuffer.lastValue()).toEqual("Jamie says hello");
  });

  it("run queued job later", async () => {
    let result: unknown;
    try {
      result = await HelloJob.set({
        waitUntil: await (await Duration.seconds(1)).ago(),
      }).performLater("Jamie");
      expect(result).toBeRubyTruthy();
    } catch (error) {
      if (error instanceof NotImplementedError) {
        expect(true).toBe(true);
      } else {
        throw error;
      }
    }
  });

  it("job returned by enqueue has the arguments available", async () => {
    const job = await HelloJob.performLater("Jamie");
    expect(await job.arguments).toEqual(["Jamie"]);
  });

  it("job returned by perform_at has the timestamp available", async () => {
    let job: unknown;
    try {
      job = await HelloJob.set({ waitUntil: RubyTime.utc(2014, 1, 1) }).performLater();
      expect(await job.scheduledAt).toEqualRuby(RubyTime.utc(2014, 1, 1));
    } catch (error) {
      if (error instanceof NotImplementedError) {
        expect(true).toBe(true);
      } else {
        throw error;
      }
    }
  });

  it("job is yielded to block after enqueue with successfully_enqueued property set", async () => {
    await HelloJob.performLater("John", async (job: unknown) => {
      expect(JobBuffer.lastValue()).toEqual("John says hello");
      expect(await job.arguments).toEqual(["John"]);
      expect(await job.isSuccessfullyEnqueued()).toEqual(true);
      return expect(await job.enqueueError).toBeNull();
    });
  });

  it("when enqueuing raises an EnqueueError job is yielded to block with error set on job", async () => {
    await EnqueueErrorJob.performLater(async (job: unknown) => {
      expect(await job.isSuccessfullyEnqueued()).toEqual(false);
      return expect(await (await job.enqueueError).constructor).toEqualRuby(EnqueueError);
    });
  });

  it("run multiple queued jobs", async () => {
    performAllLater(new HelloJob("Jamie"), new HelloJob("John"));
    expect(await sort(JobBuffer.values())).toEqual(["Jamie says hello", "John says hello"]);
  });

  it("run multiple queued jobs passed as array", async () => {
    performAllLater([new HelloJob("Jamie"), new HelloJob("John")]);
    expect(await sort(JobBuffer.values())).toEqual(["Jamie says hello", "John says hello"]);
  });

  it("run multiple queued jobs of different classes", async () => {
    performAllLater([
      new HelloJob("Jamie"),
      new MultipleKwargsJob({ argument1: "John", argument2: 42 }),
    ]);
    expect(await sort(JobBuffer.values())).toEqual([
      "Jamie says hello",
      "Job with argument1: John, argument2: 42",
    ]);
  });

  it("perform_all_later enqueues jobs with schedules", async () => {
    let scheduledJob1: unknown, scheduledJob2: unknown;
    try {
      scheduledJob1 = new HelloJob("Scheduled 2014");
      await scheduledJob1.set({ waitUntil: RubyTime.utc(2014, 1, 1) });
      scheduledJob2 = new HelloJob("Scheduled 2015");
      scheduledJob2.scheduledAt = RubyTime.utc(2015, 1, 1);
      performAllLater(scheduledJob1, scheduledJob2);
      expect(await sort(JobBuffer.values())).toEqual([
        "Scheduled 2014 says hello",
        "Scheduled 2015 says hello",
      ]);
    } catch (error) {
      if (error instanceof NotImplementedError) {
        expect(true).toBe(true);
      } else {
        throw error;
      }
    }
  });

  it("perform_all_later instrumentation", async () => {
    const jobs = [new HelloJob("Jamie"), new HelloJob("John")];
    let called = false;
    const subscriber = (
      _?: unknown,
      _2?: unknown,
      _3?: unknown,
      _4?: unknown,
      payload?: Record<string, unknown> | null,
    ) => {
      called = true;
      expect(payload["adapter"]).toBeRubyTruthy();
      expect(payload["jobs"]).toEqualRuby(jobs);
      return expect(payload["enqueued_count"]).toEqual(2);
    };
    await Notifications.subscribed(subscriber, "enqueue_all.active_job", () =>
      performAllLater(jobs),
    );
    expect(called).toBeTruthy();
  });
});
