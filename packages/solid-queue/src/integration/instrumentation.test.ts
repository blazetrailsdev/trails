import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../test-helpers/dummy-application.js";
import { Deadlocked } from "@blazetrails/activerecord";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { EnqueueError } from "@blazetrails/activejob";
import { AsyncAdapter } from "@blazetrails/activejob/queue-adapters/async-adapter";
import {
  days,
  isPresent,
  Notifications,
  seconds,
  travelBack,
  travelTo,
} from "@blazetrails/activesupport";
import type { Time } from "@blazetrails/date";
import { groupBy, rbEqual, slice } from "@blazetrails/ruby-compat";
import {
  BlockedExecution,
  ClaimedExecution,
  Dispatcher,
  FailedExecution,
  Job,
  Process,
  ReadyExecution,
  RecurringTask,
  ScheduledExecution,
  Scheduler,
  Semaphore,
  SolidQueue,
  SolidQueueAdapter,
  Worker,
} from "../index.js";
import { AddToBufferJob, JobBuffer } from "../test-helpers/add-to-buffer-job.js";
import { ApplicationJob } from "../test-helpers/application-job.js";
import { ExpectedTestError } from "../test-helpers/expected-test-error.js";
import { JobResult, StoreResultJob } from "../test-helpers/job-result.js";
import { waitForJobsToFinishFor } from "../test-helpers/jobs-test-helper.js";
import {
  sleep,
  waitForRegisteredProcesses,
  waitWhileWithTimeout,
} from "../test-helpers/processes-test-helper.js";
import { loadAppSchema } from "../test-helpers/queue-schema.js";
import { RaisingJob } from "../test-helpers/raising-job.js";
import { SequentialUpdateResultJob } from "../test-helpers/sequential-update-result-job.js";

type NotificationArgs = [string, unknown, unknown, unknown, { [key: string]: unknown }];

async function subscribed(name: string | RegExp, block: () => unknown) {
  const events: NotificationArgs[] = [];
  await Notifications.subscribed(
    (...args: unknown[]) => {
      events.push(args as NotificationArgs);
    },
    name,
    block,
  );
  return events;
}

function assertEvent(
  event: NotificationArgs,
  action: string,
  attributes: { [key: string]: unknown } = {},
) {
  expect(event[0]).toEqual(`${action}.solid_queue`);
  const sliced = slice(event[4], ...Object.keys(attributes));
  if (!rbEqual(attributes, sliced)) expect(sliced).toEqual(attributes);
}

describe("InstrumentationTest", () => {
  let originalOnThreadError: typeof SolidQueue.onThreadError;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    const pool = RecurringTask.connectionPool();
    await pool.schemaReflection.loadAllBang(pool);
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(() => {
    originalOnThreadError = SolidQueue.onThreadError;
    SolidQueue.onThreadError = (error) => {
      if (!(error instanceof ExpectedTestError)) originalOnThreadError?.(error);
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    travelBack();
    SolidQueue.onThreadError = originalOnThreadError;
    JobBuffer.clear();
    await Job.destroyAll();
    await Process.destroyAll();
    await Semaphore.deleteAll();
    await RecurringTask.deleteAll();
    await JobResult.deleteAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("dispatcher polling emits dispatch_scheduled event", async () => {
    for (let i = 0; i < 8; i++) {
      await AddToBufferJob.set({ wait: days(1) }).performLater("I'm scheduled");
    }

    const events = await subscribed("dispatch_scheduled.solid_queue", async () => {
      travelTo(days(2).fromNow() as Time);
      const dispatcher = new Dispatcher({ pollingInterval: 0.1, batchSize: 10 });
      await dispatcher.start();

      await waitWhileWithTimeout(0.5, async () => await ScheduledExecution.isAny());
      await dispatcher.stop();
    });

    expect(events.length).toEqual(1);
    assertEvent(events[0], "dispatch_scheduled", { batch_size: 10, size: 8 });
  });

  it("claiming jobs emits claim events", async () => {
    for (let i = 0; i < 3; i++) await StoreResultJob.performLater(42);
    let process: Process | null = null;
    const jobs = await Job.last(3);

    const events = await subscribed("claim.solid_queue", async () => {
      const worker = new Worker();
      await worker.start();

      await waitWhileWithTimeout(3, async () => await ReadyExecution.isAny());
      process = await Process.last();

      await worker.stop();
      await waitForRegisteredProcesses(0, { timeout: 3 });
    });

    expect(events.length).toEqual(1);
    assertEvent(events[0], "claim", {
      process_id: process!.id,
      job_ids: jobs.map((job) => job.id),
      claimed_job_ids: jobs.map((job) => job.id),
      size: 3,
    });
  });

  it("polling emits events", async () => {
    for (let i = 0; i < 3; i++) await StoreResultJob.performLater(42);

    const events = await subscribed("polling.solid_queue", async () => {
      const worker = new Worker();
      await worker.start();

      await waitWhileWithTimeout(3, async () => await ReadyExecution.isAny());

      await worker.stop();
    });

    expect(events.length >= 1).toBe(true);
    for (const e of events) assertEvent(e, "polling");
  });

  it("stopping a worker with claimed executions emits release_claimed events", async () => {
    await StoreResultJob.performLater(42, {
      pause: SolidQueue.shutdownTimeout.plus(seconds(100)).toF(),
    });
    let process: Process | null = null;

    const events = await subscribed(/release.*_claimed\.solid_queue/, async () => {
      const worker = new Worker();
      await worker.start();

      await waitWhileWithTimeout(3, async () => await ReadyExecution.isAny());
      process = await Process.last();

      await worker.stop();
      await waitForRegisteredProcesses(0, { timeout: 3 });
    });

    expect(events.length).toEqual(2);
    const [releaseOneEvent, releaseManyEvent] = events;
    assertEvent(releaseOneEvent, "release_claimed", {
      job_id: (await Job.last())!.id,
      process_id: process!.id,
    });
    assertEvent(releaseManyEvent, "release_many_claimed", { size: 1 });
  }, 15_000);

  it("starting a runnable process emits a start_process event", async () => {
    const worker = new Worker();

    const events = await subscribed("start_process.solid_queue", async () => {
      await worker.start();
      await waitForRegisteredProcesses(1, { timeout: 1 });

      await worker.stop();
      await waitForRegisteredProcesses(0, { timeout: 1 });
    });

    expect(events.length).toEqual(1);
    assertEvent(events[0], "start_process", { process: worker });
  });

  it("starting and stopping a worker emits register_process and deregister_process events", async () => {
    await StoreResultJob.performLater(42, {
      pause: SolidQueue.shutdownTimeout.plus(seconds(100)).toF(),
    });
    let process: Process | null = null;

    const events = await subscribed(/(register|deregister)_process\.solid_queue/, async () => {
      const worker = new Worker();
      await worker.start();
      await waitWhileWithTimeout(3, async () => await ReadyExecution.isAny());

      process = await Process.last();

      await worker.stop();
      await waitForRegisteredProcesses(0, { timeout: 3 });
    });

    expect(events.length).toEqual(2);
    const [registerEvent, deregisterEvent] = events;
    assertEvent(registerEvent, "register_process", {
      kind: "Worker",
      pid: process!.pid,
      process_id: process!.id,
    });
    assertEvent(deregisterEvent, "deregister_process", { process: process, pruned: false });
  }, 15_000);

  it("starting and stopping a dispatcher emits register_process and deregister_process events", async () => {
    let process: Process | null = null;

    const events = await subscribed(/(register|deregister)_process\.solid_queue/, async () => {
      const dispatcher = new Dispatcher();
      await dispatcher.start();
      await waitForRegisteredProcesses(1, { timeout: 3 });

      process = await Process.last();

      await dispatcher.stop();
      await waitForRegisteredProcesses(0, { timeout: 3 });
    });

    expect(events.length).toEqual(2);
    const [registerEvent, deregisterEvent] = events;
    assertEvent(registerEvent, "register_process", {
      kind: "Dispatcher",
      pid: process!.pid,
      process_id: process!.id,
    });
    assertEvent(deregisterEvent, "deregister_process", { process: process, pruned: false });
  });

  it("pruning processes emit prune_processes and deregister_process events", async () => {
    const processes: Process[] = [];
    for (let i = 0; i < 3; i++) {
      processes.push(
        await Process.createBang({
          kind: "Worker",
          supervisor_id: 42,
          pid: 10 + i,
          hostname: "localhost",
          last_heartbeat_at: days(3).ago(),
          name: `worker-123${i}`,
        }),
      );
    }

    const events = await subscribed(/.*process.*\.solid_queue/, async () => {
      await Process.prune();
    });

    expect(events.length).toEqual(4);
    const deregisterEvents = events.slice(0, 3);
    const pruneEvent = events.at(-1)!;

    assertEvent(pruneEvent, "prune_processes", { size: 3 });
    deregisterEvents.forEach((event, i) => {
      assertEvent(event, "deregister_process", { process: processes[i], pruned: true });
    });
  });

  it("pruning a process with claimed executions emits fail_many_claimed event", async () => {
    const process = await Process.createBang({
      kind: "Worker",
      supervisor_id: 42,
      pid: 10,
      last_heartbeat_at: days(3).ago(),
      name: "worker-123",
    });

    for (let i = 0; i < 3; i++) await StoreResultJob.set({ queue: "new_queue" }).performLater(i);
    const jobs = await Job.last(3);

    await ReadyExecution.claim("*", 5, process.id);

    const events = await subscribed(/fail.*_claimed\.solid_queue/, async () => {
      await Process.prune();
    });

    expect(events.length).toEqual(1);
    assertEvent(events[0], "fail_many_claimed", {
      process_ids: [process.id],
      job_ids: jobs.map((job) => job.id),
      size: 3,
    });
  });

  it("errors when deregistering processes are included in deregister_process events", async () => {
    const error = new ExpectedTestError("everything is broken");
    vi.spyOn(Process.prototype, "destroyBang").mockRejectedValue(error);

    const events = await subscribed("deregister_process.solid_queue", async () => {
      await expect(
        (async () => {
          const worker = new Worker();
          await worker.start();
          await waitForRegisteredProcesses(1, { timeout: 1 });

          await worker.stop();
          await waitForRegisteredProcesses(0, { timeout: 1 });
        })(),
      ).rejects.toThrow(Error);
    });

    expect(events.length).toEqual(1);
    assertEvent(events[0], "deregister_process", { error: error });
  });

  it("retrying failed job emits retry event", async () => {
    await RaisingJob.performLater(ExpectedTestError, "A");
    const job = (await Job.last())!;

    const worker = new Worker();
    await worker.start();
    await waitForJobsToFinishFor(3);
    await worker.stop();

    const events = await subscribed("retry.solid_queue", async () => {
      await (await job.reload()).retry();
    });

    expect(events.length).toEqual(1);
    assertEvent(events[0], "retry", { job_id: job.id });
  });

  it("retrying failed jobs in bulk emits retry_all", async () => {
    for (let i = 0; i < 3; i++) await RaisingJob.performLater(ExpectedTestError, "A");
    await AddToBufferJob.performLater("A");

    const jobs = Job.where({ id: (await Job.last(4)).map((job) => job.id) });

    const worker = new Worker();
    await worker.start();
    await waitForJobsToFinishFor(3);
    await worker.stop();

    const events = await subscribed("retry_all.solid_queue", async () => {
      await FailedExecution.retryAll(jobs);
      await FailedExecution.retryAll(jobs);
    });

    expect(events.length).toEqual(2);
    assertEvent(events[0], "retry_all", { jobs_size: 4, size: 3 });
    assertEvent(events[1], "retry_all", { jobs_size: 4, size: 0 });
  });

  it("discarding job emits a discard event", async () => {
    await AddToBufferJob.performLater("A");
    const job = (await Job.last())!;

    const events = await subscribed("discard.solid_queue", async () => {
      await job.discard();
    });

    expect(events.length).toEqual(1);
    assertEvent(events[0], "discard", { job_id: job.id, status: "ready" });
  });

  it("discarding jobs in bulk emits a discard_all event", async () => {
    for (let i = 0; i < 5; i++) await AddToBufferJob.performLater("A");
    const result = await JobResult.createBang();
    for (let i = 0; i < 4; i++) await SequentialUpdateResultJob.performLater(result, { name: "A" });

    const events = await subscribed("discard_all.solid_queue", async () => {
      await ReadyExecution.discardAllFromJobs(Job.all());
      await ReadyExecution.discardAllFromJobs(Job.all());
    });

    expect(events.length).toEqual(2);
    assertEvent(events[0], "discard_all", { jobs_size: 9, status: "ready", size: 6 });
    assertEvent(events[1], "discard_all", { jobs_size: 3, status: "ready", size: 0 });
  });

  it("discarding jobs in batches emits a discard_all event", async () => {
    for (let i = 0; i < 15; i++) await AddToBufferJob.performLater("A");

    const events = await subscribed("discard_all.solid_queue", async () => {
      await ReadyExecution.discardAllInBatches({ batchSize: 6 });
    });

    expect(events.length).toEqual(1);
    assertEvent(events[0], "discard_all", {
      batch_size: 6,
      status: "ready",
      batches: 3,
      size: 15,
    });
  });

  it("unblocking job emits release_blocked event", async () => {
    const result = await JobResult.createBang();
    for (let i = 0; i < 3; i++) await SequentialUpdateResultJob.performLater(result, { name: "A" });

    travelTo(days(3).fromNow() as Time);
    await Semaphore.expired().deleteAll();

    const blockedExecutions = await BlockedExecution.last(2);
    const blockedJobs = await Promise.all(blockedExecutions.map(async (e) => await e.job));
    const concurrencyKey = blockedJobs[0].concurrency_key;

    const events = await subscribed("release_blocked.solid_queue", async () => {
      await BlockedExecution.releaseOne(concurrencyKey);
      await BlockedExecution.releaseOne(concurrencyKey);
    });

    expect(events.length).toEqual(2);
    assertEvent(events[0], "release_blocked", {
      job_id: blockedJobs[0].id,
      concurrency_key: concurrencyKey,
      released: true,
    });
    assertEvent(events[1], "release_blocked", {
      job_id: blockedJobs[1].id,
      concurrency_key: concurrencyKey,
      released: false,
    });
  });

  it("unblocking jobs in bulk emits release_many_blocked event", async () => {
    let result = await JobResult.createBang();
    for (let i = 0; i < 4; i++) await SequentialUpdateResultJob.performLater(result, { name: "A" });

    result = await JobResult.createBang();
    for (let i = 0; i < 3; i++) await SequentialUpdateResultJob.performLater(result, { name: "B" });

    travelTo(days(3).fromNow() as Time);
    await Semaphore.expired().deleteAll();

    const events = await subscribed("release_many_blocked.solid_queue", async () => {
      await BlockedExecution.unblock(5);
      await BlockedExecution.unblock(5);
    });

    expect(events.length).toEqual(2);
    assertEvent(events[0], "release_many_blocked", { limit: 5, size: 2 });
    assertEvent(events[1], "release_many_blocked", { limit: 5, size: 0 });
  });

  it("enqueuing recurring task emits enqueue_recurring_task event", async () => {
    const recurringTask = {
      example_task: { class: "AddToBufferJob", schedule: "every second", args: 42 },
    };
    const scheduler = new Scheduler({ recurringTasks: recurringTask });

    const events = await subscribed("enqueue_recurring_task.solid_queue", async () => {
      await scheduler.start();
      await sleep(1.01);
      await scheduler.stop();
    });

    expect(events.length >= 1).toBe(true);
    const event = events.at(-1)!;

    assertEvent(event, "enqueue_recurring_task", {
      task: "example_task",
      active_job_id: (await Job.last())!.active_job_id,
    });
    expect(isPresent(event[4].at)).toBe(true);
    expect(event[4].other_adapter).toBeUndefined();
  });

  it("skipping a recurring task is reflected in the enqueue_recurring_task event", async () => {
    const recurringTask = {
      example_task: { class: "AddToBufferJob", schedule: "every second", args: 42 },
    };
    const schedulers = [0, 1].map(() => new Scheduler({ recurringTasks: recurringTask }));

    const events = await subscribed("enqueue_recurring_task.solid_queue", async () => {
      for (const scheduler of schedulers) await scheduler.start();
      await sleep(1.01);
      for (const scheduler of schedulers) await scheduler.stop();
    });

    expect(events.length >= 2).toBe(true);
    for (const event of events) {
      assertEvent(event, "enqueue_recurring_task", { task: "example_task" });
    }

    const activeJobIds = (await Job.all().toArray()).map((job) => job.active_job_id);
    const byTime = groupBy(events, (event: NotificationArgs) => event[4].at) as Map<
      unknown,
      NotificationArgs[]
    >;
    for (const eventsByTime of [...byTime.values()].filter((group) => group.length > 1)) {
      expect(eventsByTime.some((e) => e[4].active_job_id == null)).toBe(true);
      expect(eventsByTime.some((e) => activeJobIds.includes(e[4].active_job_id as string))).toBe(
        true,
      );
    }
  });

  it("an error enqueuing a recurring task in Solid Queue is reflected in the enqueue_recurring_task event", async () => {
    const recurringTask = {
      example_task: { class: "AddToBufferJob", schedule: "every second", args: 42 },
    };
    vi.spyOn(Job, "createBang").mockRejectedValue(new Deadlocked());

    const scheduler = new Scheduler({ recurringTasks: recurringTask });

    const events = await subscribed("enqueue_recurring_task.solid_queue", async () => {
      await scheduler.start();
      await sleep(1.01);
      await scheduler.stop();
    });

    expect(events.length >= 1).toBe(true);
    const event = events.at(-1)!;

    assertEvent(event, "enqueue_recurring_task", {
      task: "example_task",
      enqueue_error: "ActiveRecord::Deadlocked: ActiveRecord::Deadlocked",
    });
    expect(isPresent(event[4].at)).toBe(true);
    expect(event[4].other_adapter).toBeUndefined();
  });

  it("an error enqueuing a recurring task with another adapter is reflected in the enqueue_recurring_task event", async () => {
    AddToBufferJob.setQueueAdapter("async");
    try {
      vi.spyOn(AsyncAdapter.prototype, "enqueue").mockImplementation(() => {
        throw new EnqueueError("All is broken");
      });

      const recurringTask = {
        example_task: { class: "AddToBufferJob", schedule: "every second", args: 42 },
      };

      const scheduler = new Scheduler({ recurringTasks: recurringTask });

      const events = await subscribed("enqueue_recurring_task.solid_queue", async () => {
        await scheduler.start();
        await sleep(1.01);
        await scheduler.stop();
      });

      expect(events.length >= 1).toBe(true);
      const event = events.at(-1)!;

      assertEvent(event, "enqueue_recurring_task", {
        task: "example_task",
        enqueue_error: "All is broken",
      });
      expect(isPresent(event[4].at)).toBe(true);
      expect(event[4].other_adapter).toBeTruthy();
    } finally {
      AddToBufferJob.setQueueAdapter("solid_queue");
    }
  });

  it("thread errors emit thread_error events", async () => {
    const error = new ExpectedTestError("everything is broken");
    const Result = ClaimedExecution.Result;
    ClaimedExecution.Result = class {
      constructor() {
        throw error;
      }
    } as unknown as typeof Result;

    try {
      await AddToBufferJob.performLater("hey!");

      const events = await subscribed("thread_error.solid_queue", async () => {
        const worker = new Worker();
        worker.mode = "inline";
        await worker.start();
      });

      expect(events.length).toEqual(1);
      assertEvent(events[0], "thread_error", { error: error });
    } finally {
      ClaimedExecution.Result = Result;
    }
  });
});
