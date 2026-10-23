import { describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { Notifications } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { block, NotImplementedError } from "@blazetrails/ruby-compat";
import { EnqueueError, performAllLater } from "./enqueuing.js";
import "./test-helpers/helper.js";
import { EnqueueErrorJob } from "./test-helpers/jobs/enqueue-error-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { MultipleKwargsJob } from "./test-helpers/jobs/multiple-kwargs-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

describe("QueuingTest", () => {
  it("run queued job", async () => {
    await HelloJob.performLater();
    expect(JobBuffer.lastValue()).toBe("David says hello");
  });

  it("run queued job with arguments", async () => {
    await HelloJob.performLater("Jamie");
    expect(JobBuffer.lastValue()).toBe("Jamie says hello");
  });

  it("run queued job later", async () => {
    try {
      const result = await (
        HelloJob.set({ waitUntil: Time.now().minus(1) }) as {
          performLater(...args: unknown[]): Promise<unknown>;
        }
      ).performLater("Jamie");
      expect(result).toBeRubyTruthy();
    } catch (e) {
      if (!(e instanceof NotImplementedError)) throw e;
    }
  });

  it("job returned by enqueue has the arguments available", async () => {
    const job = (await HelloJob.performLater("Jamie")) as HelloJob;
    expect(job.arguments).toEqual(["Jamie"]);
  });

  it("job returned by perform_at has the timestamp available", async () => {
    try {
      const job = (await (
        HelloJob.set({ waitUntil: Time.utc(2014, 1, 1) }) as {
          performLater(...args: unknown[]): Promise<unknown>;
        }
      ).performLater()) as HelloJob;
      expect(job.scheduledAt).toEqual(Time.utc(2014, 1, 1));
    } catch (e) {
      if (!(e instanceof NotImplementedError)) throw e;
    }
  });

  it("job is yielded to block after enqueue with successfully_enqueued property set", async () => {
    await HelloJob.performLater(
      "John",
      block((job: HelloJob) => {
        expect(JobBuffer.lastValue()).toBe("John says hello");
        expect(job.arguments).toEqual(["John"]);
        expect(job.isSuccessfullyEnqueued()).toBe(true);
        expect(job.enqueueError).toBeNull();
      }),
    );
  });

  it("when enqueuing raises an EnqueueError job is yielded to block with error set on job", async () => {
    await EnqueueErrorJob.performLater(
      block((job: EnqueueErrorJob) => {
        expect(job.isSuccessfullyEnqueued()).toBe(false);
        expect((job.enqueueError as object).constructor).toBe(EnqueueError);
      }),
    );
  });

  it("run multiple queued jobs", async () => {
    await performAllLater(new HelloJob("Jamie"), new HelloJob("John"));
    expect([...JobBuffer.values()].sort()).toEqual(["Jamie says hello", "John says hello"]);
  });

  it("run multiple queued jobs passed as array", async () => {
    await performAllLater([new HelloJob("Jamie"), new HelloJob("John")]);
    expect([...JobBuffer.values()].sort()).toEqual(["Jamie says hello", "John says hello"]);
  });

  it("run multiple queued jobs of different classes", async () => {
    await performAllLater([
      new HelloJob("Jamie"),
      new MultipleKwargsJob({ argument1: "John", argument2: 42 }),
    ]);
    expect([...JobBuffer.values()].sort()).toEqual([
      "Jamie says hello",
      "Job with argument1: John, argument2: 42",
    ]);
  });

  it("perform_all_later enqueues jobs with schedules", async () => {
    try {
      const scheduledJob1 = new HelloJob("Scheduled 2014");
      scheduledJob1.set({ waitUntil: Time.utc(2014, 1, 1) });

      const scheduledJob2 = new HelloJob("Scheduled 2015");
      scheduledJob2.scheduledAt = Time.utc(2015, 1, 1);

      await performAllLater(scheduledJob1, scheduledJob2);
      expect([...JobBuffer.values()].sort()).toEqual([
        "Scheduled 2014 says hello",
        "Scheduled 2015 says hello",
      ]);
    } catch (e) {
      if (!(e instanceof NotImplementedError)) throw e;
    }
  });

  it("perform_all_later instrumentation", async () => {
    const jobs = [new HelloJob("Jamie"), new HelloJob("John")];
    let called = false;

    const subscriber = (...args: unknown[]) => {
      const payload = args[4] as Record<string, unknown>;
      called = true;
      expect(payload["adapter"]).toBeRubyTruthy();
      expect(payload["jobs"]).toEqual(jobs);
      expect(payload["enqueued_count"]).toBe(2);
    };

    await Notifications.subscribed(subscriber as never, "enqueue_all.active_job", async () => {
      await performAllLater(jobs);
    });

    expect(called).toBeTruthy();
  });
});
