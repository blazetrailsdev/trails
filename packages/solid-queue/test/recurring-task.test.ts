import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import { Deadlocked, RecordNotFound, RecordNotUnique } from "@blazetrails/activerecord";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { Base, EnqueueError } from "@blazetrails/activejob";
import { AsyncAdapter } from "@blazetrails/activejob/queue-adapters/async-adapter";
import { ActiveSupport, isPresent } from "@blazetrails/activesupport";
import {
  assertDifference,
  assertNoDifference,
} from "@blazetrails/activesupport/testing/assertions";
import { Time } from "@blazetrails/date";
import { Fugit, type Cron } from "@blazetrails/fugit";
import { constGet, constSet } from "@blazetrails/ruby-compat";
import {
  Job,
  ReadyExecution,
  RecurringTask,
  SolidQueue,
  SolidQueueAdapter,
  Worker,
} from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import { JobBuffer } from "./support/add-to-buffer-job.js";
import { ErrorBuffer } from "./support/error-buffer.js";
import { loadAppSchema } from "./support/queue-schema.js";
import "./test-helper.js";

class JobWithoutArguments extends ApplicationJob {
  perform(): void {
    JobBuffer.add("job_without_arguments");
  }
}

class JobWithRegularHashArguments extends ApplicationJob {
  perform(value: unknown, options: { value: unknown }): void {
    JobBuffer.add([value, options.value]);
  }
}

class JobWithKeywordArgument extends ApplicationJob {
  perform(value: unknown, { value_kwarg }: { value_kwarg: unknown }): void {
    JobBuffer.add([value, value_kwarg]);
  }
}

class JobWithMultipleTypeArguments extends ApplicationJob {
  perform(value: unknown, ...rest: { value?: unknown; value_kwarg?: unknown }[]): void {
    const kwargs = rest.at(-1) ?? {};
    const options = rest.length > 1 ? rest[0] : {};
    JobBuffer.add([value, options.value ?? null, kwargs.value_kwarg]);
  }
}

class JobWithPriority extends ApplicationJob {
  static {
    this.queueWithPriority(10);
  }

  perform(): void {
    JobBuffer.add("job_with_priority");
  }
}

class JobWithConcurrencyControlsAndDiscard extends ApplicationJob {
  static {
    this.limitsConcurrency({ key: () => true, onConflict: "discard" });
  }

  perform(): void {
    JobBuffer.add("job_with_concurrency_controls");
  }
}

class JobUsingAsyncAdapter extends ApplicationJob {
  static {
    this.queueAdapter = "async";
  }

  perform(): void {
    JobBuffer.add("job_using_async_adapter");
  }
}

const RecurringTaskTest = constSet(
  constGet(Object, "SolidQueue") as object,
  "RecurringTaskTest",
  {},
);
for (const job of [
  JobWithoutArguments,
  JobWithRegularHashArguments,
  JobWithKeywordArgument,
  JobWithMultipleTypeArguments,
  JobWithPriority,
  JobWithConcurrencyControlsAndDiscard,
  JobUsingAsyncAdapter,
]) {
  constSet(RecurringTaskTest, job.name, job);
}

const sleep = (s: number) => new Promise((resolve) => setTimeout(resolve, s * 1000));

async function waitWhileWithTimeout(timeout: number, block: () => boolean) {
  const end = Date.now() + timeout * 1000;
  while (Date.now() < end && block()) await sleep(0.05);
}

describe("SolidQueue::RecurringTaskTest", () => {
  let oldQueueAdapter: unknown;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    const pool = RecurringTask.connectionPool();
    await pool.schemaReflection.loadAllBang(pool);
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldQueueAdapter = Base.queueAdapter;
    Base.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
    Base.queueAdapter = oldQueueAdapter;
  });

  async function enqueueAndAssertPerformedWithResult(task: RecurringTask, result: unknown) {
    await assertDifference([() => Job.count(), () => ReadyExecution.count()], +1, null, () =>
      task.enqueue({ at: Time.now() }),
    );

    await assertDifference(
      () => JobBuffer.size(),
      +1,
      null,
      async () => {
        const worker = new Worker({ queues: "*" });
        worker.mode = "inline";
        await worker.start();
      },
    );

    expect(JobBuffer.lastValue()).toEqual(result);
  }

  async function withTimeZone(zone: string | null, block: () => Promise<void>): Promise<void> {
    const previous = SolidQueue.timeZone;
    SolidQueue.setTimeZone(zone);
    try {
      await block();
    } finally {
      SolidQueue.setTimeZone(previous);
    }
  }

  async function runAllJobsInline(): Promise<void> {
    const worker = new Worker({ queues: "*" });
    worker.mode = "inline";
    await worker.start();
  }

  async function withErrorSubscriber(
    subscriber: ErrorBuffer,
    block: () => Promise<unknown>,
  ): Promise<void> {
    ActiveSupport.errorReporter.subscribe(subscriber);
    try {
      await block();
    } finally {
      ActiveSupport.errorReporter.unsubscribe(subscriber);
    }
  }

  function recurringTaskWith({
    class_name = null,
    ...options
  }: { class_name?: string | null; [key: string]: unknown } = {}): RecurringTask {
    options = { schedule: "every hour", ...options };

    if (isPresent(class_name)) {
      options.class = `SolidQueue::RecurringTaskTest::${class_name}`;
    }

    return RecurringTask.fromConfiguration("task-id", options);
  }

  it("job without arguments", async () => {
    const task = recurringTaskWith({ class_name: "JobWithoutArguments" });
    await enqueueAndAssertPerformedWithResult(task, "job_without_arguments");
  });

  it("job with regular hash argument", async () => {
    const task = recurringTaskWith({
      class_name: "JobWithRegularHashArguments",
      args: ["regular_hash_argument", { value: 42, not_used: 24 }],
    });

    await enqueueAndAssertPerformedWithResult(task, ["regular_hash_argument", 42]);
  });

  it("job with keyword argument", async () => {
    const task = recurringTaskWith({
      class_name: "JobWithKeywordArgument",
      args: ["keyword_argument", { value_kwarg: [42, 24] }],
    });
    await enqueueAndAssertPerformedWithResult(task, ["keyword_argument", [42, 24]]);
  });

  it("job with arguments of multiple types", async () => {
    const task = recurringTaskWith({
      class_name: "JobWithMultipleTypeArguments",
      args: [
        "multiple_types",
        { value: "regular_hash_value", not_used: 28 },
        { value_kwarg: 42, not_used: 32 },
      ],
    });
    await enqueueAndAssertPerformedWithResult(task, ["multiple_types", "regular_hash_value", 42]);
  });

  it("job with arguments of multiple types ignoring optional regular hash", async () => {
    const task = recurringTaskWith({
      class_name: "JobWithMultipleTypeArguments",
      args: ["multiple_types", { value: "regular_hash_value", value_kwarg: 42, not_used: 32 }],
    });
    await enqueueAndAssertPerformedWithResult(task, ["multiple_types", null, 42]);
  });

  it("job using a different adapter", async () => {
    const task = recurringTaskWith({ class_name: "JobUsingAsyncAdapter" });
    const previousSize = JobBuffer.values.length;

    await task.enqueue({ at: Time.now() });
    await waitWhileWithTimeout(0.5, () => JobBuffer.values.length === previousSize);

    expect(JobBuffer.values.at(-1)).toBe("job_using_async_adapter");
  });

  it("error when enqueuing job before recording task", async () => {
    vi.spyOn(Job, "createBang").mockRejectedValue(new Deadlocked());

    const task = recurringTaskWith({ class_name: "JobWithoutArguments" });
    await assertNoDifference(
      () => Job.count(),
      null,
      () => task.enqueue({ at: Time.now() }),
    );
  });

  it("error when enqueuing job because of concurrency controls and discard", async () => {
    await JobWithConcurrencyControlsAndDiscard.performLater();

    const task = recurringTaskWith({ class_name: "JobWithConcurrencyControlsAndDiscard" });
    await assertNoDifference(
      () => Job.count(),
      null,
      () => task.enqueue({ at: Time.now() }),
    );

    await runAllJobsInline();

    await enqueueAndAssertPerformedWithResult(task, "job_with_concurrency_controls");
  });

  it("error when enqueuing job using another adapter that raises ActiveJob::EnqueueError", async () => {
    vi.spyOn(AsyncAdapter.prototype, "enqueue").mockImplementation(() => {
      throw new EnqueueError();
    });
    const previousSize = JobBuffer.values.length;

    const task = recurringTaskWith({ class_name: "JobUsingAsyncAdapter" });
    await task.enqueue({ at: Time.now() });

    await waitWhileWithTimeout(0.5, () => JobBuffer.values.length === previousSize);

    expect(JobBuffer.values.length).toBe(previousSize);
  });

  it("valid and invalid schedules", async () => {
    expect(
      await recurringTaskWith({
        class_name: "JobWithoutArguments",
        schedule: "once a year",
      }).isValid(),
    ).toBeFalsy();
    expect(
      await recurringTaskWith({
        class_name: "JobWithoutArguments",
        schedule: "tomorrow",
      }).isValid(),
    ).toBeFalsy();

    let task = recurringTaskWith({
      class_name: "JobWithoutArguments",
      schedule: "every Thursday at 1 AM",
    });
    expect(await task.isValid()).toBeTruthy();
    expect(task.toString().endsWith("[ 0 1 * * 4 ]")).toBeTruthy();

    task = recurringTaskWith({ class_name: "JobWithoutArguments", schedule: "every month" });
    expect(await task.isValid()).toBeTruthy();
    expect(task.toString().endsWith("[ 0 0 1 * * ]")).toBeTruthy();

    task = recurringTaskWith({ class_name: "JobWithoutArguments", schedule: "every second" });
    expect(await task.isValid()).toBeTruthy();
    expect(task.toString().endsWith("[ * * * * * * ]")).toBeTruthy();

    expect(
      await new RecurringTask({
        key: "task-id",
        class_name: "SolidQueue::RecurringTaskTest::JobWithoutArguments",
      }).isValid(),
    ).toBeFalsy();

    task = recurringTaskWith({ class_name: "JobWithoutArguments", schedule: "every day at 00:40" });
    expect(await task.isValid()).toBeTruthy();
    expect(task.toString().endsWith("[ 40 0 * * * ]")).toBeTruthy();

    task = recurringTaskWith({ class_name: "JobWithoutArguments", schedule: "40 0 * * *" });
    expect(await task.isValid()).toBeTruthy();

    task = recurringTaskWith({
      class_name: "JobWithoutArguments",
      schedule: "every day at 00:40 and 15:40",
    });
    expect(await task.isValid()).toBeTruthy();
    expect(task.toString().endsWith("[ 40 0,15 * * * ]")).toBeTruthy();

    task = recurringTaskWith({
      class_name: "JobWithoutArguments",
      schedule: "every day at 00:40 and 15:20",
    });
    expect(await task.isValid()).toBeFalsy();
    const errorMessage = task.errors.get("schedule")[0];
    expect(errorMessage).toContain("generates multiple cron schedules");
    expect(errorMessage).toContain("Please use separate recurring tasks");
  });

  it("valid and invalid job class and command", async () => {
    expect(await recurringTaskWith({ command: "puts '¡hola!'" }).isValid()).toBeTruthy();
    expect(await recurringTaskWith({ class_name: "JobWithPriority" }).isValid()).toBeTruthy();

    expect(await recurringTaskWith({ class_name: "UnknownJob" }).isValid()).toBeFalsy();

    expect(
      await recurringTaskWith({ key: "task-id", schedule: "every minute" }).isValid(),
    ).toBeFalsy();
  });

  it("task with custom queue and priority", async () => {
    const task = recurringTaskWith({
      class_name: "JobWithoutArguments",
      queue: "my_new_queue",
      priority: 4,
    });
    await enqueueAndAssertPerformedWithResult(task, "job_without_arguments");

    const job = (await Job.last()) as Job;
    expect(job.queue_name).toBe("my_new_queue");
    expect(job.priority).toBe(4);
  });

  it("overriding existing priority", async () => {
    let task = recurringTaskWith({ class_name: "JobWithPriority", priority: null });
    await task.saveBang();
    await enqueueAndAssertPerformedWithResult(await task.reload(), "job_with_priority");

    let job = (await Job.last()) as Job;
    expect(job.priority).toBe(10);

    await task.destroy();

    task = recurringTaskWith({ class_name: "JobWithPriority", priority: 4 });
    await task.saveBang();
    await enqueueAndAssertPerformedWithResult(await task.reload(), "job_with_priority");

    job = (await Job.last()) as Job;
    expect(job.priority).toBe(4);
  });

  it("next_time_after returns the next occurrence after the given time", async () => {
    const task = recurringTaskWith({ class_name: "JobWithoutArguments", schedule: "every minute" });

    let time = Time.utc(2026, 3, 12, 1, 28, 0);
    expect(task.nextTimeAfter(time)).toEqual(Time.utc(2026, 3, 12, 1, 29, 0));

    time = Time.utc(2026, 3, 12, 1, 27, 59);
    expect(task.nextTimeAfter(time)).toEqual(Time.utc(2026, 3, 12, 1, 28, 0));
  });

  it("task configured with a command", async () => {
    const task = recurringTaskWith({
      command: `${import.meta.dirname}/support/dummy/lib/from-a-command.ts`,
    });
    await enqueueAndAssertPerformedWithResult(task, "from_a_command");

    expect(((await Job.last()) as Job).class_name).toBe("SolidQueue::RecurringJob");
  });

  it("schedule recurring tasks dynamically", async () => {
    await RecurringTask.createDynamicTask("test 1", { command: "puts 1", schedule: "every hour" });
    await RecurringTask.createDynamicTask("test 2", {
      command: "puts 2",
      schedule: "every minute",
      static: true,
    });

    expect(
      await RecurringTask.isExists({
        key: "test 1",
        command: "puts 1",
        schedule: "every hour",
        static: false,
      }),
    ).toBeTruthy();
    expect(
      await RecurringTask.isExists({
        key: "test 2",
        command: "puts 2",
        schedule: "every minute",
        static: false,
      }),
    ).toBeTruthy();
  });

  it("schedule recurring tasks dynamically with class and args (same keys as YAML config)", async () => {
    await RecurringTask.createDynamicTask("test 3", {
      class: "AddToBufferJob",
      args: [42],
      schedule: "every hour",
    });

    const task = await RecurringTask.findByBang({ key: "test 3" });
    expect(task.class_name).toEqual("AddToBufferJob");
    expect(task.arguments).toEqual([42]);
    expect(task.static).toBeFalsy();
  });

  it("unschedule recurring tasks dynamically", async () => {
    const dynamicTask = await RecurringTask.createBang({
      key: "dynamic",
      command: "puts 'd'",
      schedule: "every day",
      static: false,
    });

    const staticTask = await RecurringTask.createBang({
      key: "static",
      command: "puts 's'",
      schedule: "every week",
      static: true,
    });

    await RecurringTask.deleteDynamicTask(dynamicTask.key);

    await expect(RecurringTask.deleteDynamicTask(staticTask.key)).rejects.toThrow(RecordNotFound);

    expect(await RecurringTask.isExists({ key: "dynamic", static: false })).toBeFalsy();
    expect(await RecurringTask.isExists({ key: "static", static: true })).toBeTruthy();
  });

  it("scheduling dynamic recurring task with duplicate key raises error", async () => {
    await RecurringTask.createDynamicTask("duplicate_test", {
      command: "puts 1",
      schedule: "every hour",
    });

    await expect(
      RecurringTask.createDynamicTask("duplicate_test", {
        command: "puts 2",
        schedule: "every minute",
      }),
    ).rejects.toThrow(RecordNotUnique);
  });

  it("unscheduling dynamic recurring task with nonexistent key raises RecordNotFound", async () => {
    await expect(RecurringTask.deleteDynamicTask("nonexistent_key")).rejects.toThrow(
      RecordNotFound,
    );
  });

  it("schedule without a time zone uses the configured default time zone", async () => {
    await withTimeZone("America/New_York", async () => {
      const task = recurringTaskWith({
        class_name: "JobWithoutArguments",
        schedule: "every day at 9am",
      });
      expect(task.nextTime()).toEqual(
        (Fugit.parse("0 9 * * * America/New_York") as Cron).nextTime().utc(),
      );
    });
  });

  it("schedule with an explicit time zone ignores the configured default time zone", async () => {
    await withTimeZone("America/New_York", async () => {
      const task = recurringTaskWith({
        class_name: "JobWithoutArguments",
        schedule: "0 9 * * * Europe/Madrid",
      });
      expect(task.nextTime()).toEqual(
        (Fugit.parse("0 9 * * * Europe/Madrid") as Cron).nextTime().utc(),
      );
    });
  });

  it("schedule falls back to local time when no default time zone is configured", async () => {
    await withTimeZone(null, async () => {
      const task = recurringTaskWith({
        class_name: "JobWithoutArguments",
        schedule: "every day at 9am",
      });
      expect(task.nextTime()).toEqual((Fugit.parse("0 9 * * *") as Cron).nextTime().utc());
    });
  });

  it("configured default time zone accepts Rails time zone names", async () => {
    await withTimeZone("Eastern Time (US & Canada)", async () => {
      const task = recurringTaskWith({
        class_name: "JobWithoutArguments",
        schedule: "every day at 9am",
      });
      expect(task.nextTime()).toEqual(
        (Fugit.parse("0 9 * * * America/New_York") as Cron).nextTime().utc(),
      );
    });
  });

  it("default time zone doesn't change the displayed schedule", async () => {
    await withTimeZone("America/New_York", async () => {
      const task = recurringTaskWith({
        class_name: "JobWithoutArguments",
        schedule: "every day at 9am",
      });
      expect(task.toString().endsWith("[ 0 9 * * * ]")).toBeTruthy();
    });
  });

  it("reports Job::EnqueueError to Rails.error when enqueuing via Solid Queue", async () => {
    vi.spyOn(Job, "createBang").mockRejectedValue(new Deadlocked());
    const subscriber = new ErrorBuffer();
    const at = Time.now();

    await withErrorSubscriber(subscriber, async () => {
      const task = recurringTaskWith({ class_name: "JobWithoutArguments" });
      await task.enqueue({ at: at });
    });

    expect(subscriber.errors.length).toEqual(1);
    const [error, options] = subscriber.errors[0];
    expect(error).toBeInstanceOf(Job.EnqueueError);
    expect(error.message).toMatch("ActiveRecord::Deadlocked");
    expect(options.handled).toEqual(true);
    expect(options.source).toEqual("application.solid_queue");
    expect((options.context as { task: unknown }).task).toEqual("task-id");
    expect((options.context as { at: unknown }).at).toEqual(at);
  });

  it("reports enqueue error to Rails.error when using another adapter", async () => {
    vi.spyOn(AsyncAdapter.prototype, "enqueue").mockImplementation(() => {
      throw new EnqueueError("All is broken");
    });
    const subscriber = new ErrorBuffer();
    const at = Time.now();

    await withErrorSubscriber(subscriber, async () => {
      const task = recurringTaskWith({ class_name: "JobUsingAsyncAdapter" });
      await task.enqueue({ at: at });
    });

    expect(subscriber.errors.length).toEqual(1);
    const [error, options] = subscriber.errors[0];
    expect(error).toBeInstanceOf(EnqueueError);
    expect(error.message).toEqual("All is broken");
    expect(options.handled).toEqual(true);
    expect(options.source).toEqual("application.solid_queue");
    expect((options.context as { task: unknown }).task).toEqual("task-id");
    expect((options.context as { at: unknown }).at).toEqual(at);
  });
});
