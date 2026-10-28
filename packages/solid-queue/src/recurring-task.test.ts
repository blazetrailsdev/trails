import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "./test-helpers/dummy-application.js";
import { Deadlocked } from "@blazetrails/activerecord";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { Base, EnqueueError } from "@blazetrails/activejob";
import { AsyncAdapter } from "@blazetrails/activejob/queue-adapters/async-adapter";
import { isPresent } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Job, Process, ReadyExecution, RecurringTask, SolidQueueAdapter, Worker } from "./index.js";
import { ApplicationJob } from "./test-helpers/application-job.js";
import { JobBuffer } from "./test-helpers/add-to-buffer-job.js";
import { loadAppSchema } from "./test-helpers/queue-schema.js";

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

class JobUsingAsyncAdapter extends ApplicationJob {
  static {
    this.setQueueAdapter("async");
  }

  perform(): void {
    JobBuffer.add("job_using_async_adapter");
  }
}

for (const job of [
  JobWithoutArguments,
  JobWithRegularHashArguments,
  JobWithKeywordArgument,
  JobWithMultipleTypeArguments,
  JobWithPriority,
  JobUsingAsyncAdapter,
]) {
  registerConstant(`SolidQueue::RecurringTaskTest::${job.name}`, job);
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
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
    oldQueueAdapter = Base.queueAdapter;
    Base.setQueueAdapter(new SolidQueueAdapter());
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    JobBuffer.values.length = 0;
    await Job.destroyAll();
    await Process.destroyAll();
    await RecurringTask.deleteAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
    Base.setQueueAdapter(oldQueueAdapter);
  });

  async function enqueueAndAssertPerformedWithResult(task: RecurringTask, result: unknown) {
    const jobCount = await Job.count();
    const readyCount = await ReadyExecution.count();
    await task.enqueue({ at: Time.now() });
    expect(await Job.count()).toBe(jobCount + 1);
    expect(await ReadyExecution.count()).toBe(readyCount + 1);

    const size = JobBuffer.values.length;
    const worker = new Worker({ queues: "*" });
    worker.mode = "inline";
    await worker.start();
    expect(JobBuffer.values.length).toBe(size + 1);

    expect(JobBuffer.values.at(-1)).toEqual(result);
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
    const jobCount = await Job.count();
    await task.enqueue({ at: Time.now() });
    expect(await Job.count()).toBe(jobCount);
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
    ).toBe(false);
    expect(
      await recurringTaskWith({
        class_name: "JobWithoutArguments",
        schedule: "tomorrow",
      }).isValid(),
    ).toBe(false);

    let task = recurringTaskWith({
      class_name: "JobWithoutArguments",
      schedule: "every Thursday at 1 AM",
    });
    expect(await task.isValid()).toBe(true);
    expect(task.toString().endsWith("[ 0 1 * * 4 ]")).toBe(true);

    task = recurringTaskWith({ class_name: "JobWithoutArguments", schedule: "every month" });
    expect(await task.isValid()).toBe(true);
    expect(task.toString().endsWith("[ 0 0 1 * * ]")).toBe(true);

    task = recurringTaskWith({ class_name: "JobWithoutArguments", schedule: "every second" });
    expect(await task.isValid()).toBe(true);
    expect(task.toString().endsWith("[ * * * * * * ]")).toBe(true);

    expect(
      await new RecurringTask({
        key: "task-id",
        class_name: "SolidQueue::RecurringTaskTest::JobWithoutArguments",
      }).isValid(),
    ).toBe(false);
  });

  it("valid and invalid job class and command", async () => {
    expect(await recurringTaskWith({ command: "puts '¡hola!'" }).isValid()).toBe(true);
    expect(await recurringTaskWith({ class_name: "JobWithPriority" }).isValid()).toBe(true);

    expect(await recurringTaskWith({ class_name: "UnknownJob" }).isValid()).toBe(false);

    expect(await recurringTaskWith({ key: "task-id", schedule: "every minute" }).isValid()).toBe(
      false,
    );
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

  it("task configured with a command", async () => {
    const task = recurringTaskWith({
      command: `${import.meta.dirname}/test-helpers/dummy/lib/from-a-command.ts`,
    });
    await enqueueAndAssertPerformedWithResult(task, "from_a_command");

    expect(((await Job.last()) as Job).class_name).toBe("SolidQueue::RecurringJob");
  });
});
