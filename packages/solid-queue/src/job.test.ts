import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./test-helpers/dummy-application.js";
import {
  assertChanges,
  assertDifference,
  assertNoChanges,
  assertNoDifference,
  minutes,
  travelBack,
  travelTo,
} from "@blazetrails/activesupport";
import { Deadlocked, Rollback } from "@blazetrails/activerecord";
import { Time } from "@blazetrails/date";
import { performAllLater } from "@blazetrails/activejob";
import { registerConstant } from "@blazetrails/ruby-compat";
import {
  BlockedExecution,
  EnqueueError,
  Job,
  ReadyExecution,
  ScheduledExecution,
  Semaphore,
  SolidQueue,
  SolidQueueAdapter,
} from "./index.js";
import { ApplicationJob } from "./test-helpers/application-job.js";
import { AddToBufferJob } from "./test-helpers/add-to-buffer-job.js";
import { JobResult, StoreResultJob } from "./test-helpers/job-result.js";
import { ShardedJobResult } from "./test-helpers/sharded-job-result.js";
import { ShardedRecord } from "./test-helpers/sharded-record.js";
import { loadAppSchema } from "./test-helpers/queue-schema.js";

class NonOverlappingJob extends ApplicationJob {
  static {
    this.limitsConcurrency({ key: (jobResult: unknown) => jobResult });
  }

  perform(_jobResult: unknown): void {}
}

class NonOverlappingGroupedJob1 extends NonOverlappingJob {
  static {
    this.limitsConcurrency({ key: (jobResult: unknown) => jobResult, group: "MyGroup" });
  }
}

class NonOverlappingGroupedJob2 extends NonOverlappingJob {
  static {
    this.limitsConcurrency({ key: (jobResult: unknown) => jobResult, group: "MyGroup" });
  }
}

for (const klass of [NonOverlappingJob, NonOverlappingGroupedJob1, NonOverlappingGroupedJob2]) {
  registerConstant(`SolidQueue::JobTest::${klass.name}`, klass);
}

describe("SolidQueue::JobTest", () => {
  let result: JobResult;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
  });

  beforeEach(async () => {
    result = await JobResult.createBang({ queue_name: "default" });
  });

  afterEach(async () => {
    travelBack();
    vi.restoreAllMocks();
    await Job.destroyAll();
    await Semaphore.deleteAll();
    await JobResult.deleteAll();
  });

  async function assertJobCounts(
    {
      ready = 0,
      scheduled = 0,
      blocked = 0,
    }: { ready?: number; scheduled?: number; blocked?: number },
    block: () => Promise<unknown>,
  ): Promise<void> {
    await assertDifference(
      () => Job.count(),
      +(ready + scheduled + blocked),
      null,
      () =>
        assertDifference(
          () => ReadyExecution.count(),
          +ready,
          null,
          () =>
            assertDifference(
              () => ScheduledExecution.count(),
              +scheduled,
              null,
              () => assertDifference(() => BlockedExecution.count(), +blocked, null, block),
            ),
        ),
    );
  }

  async function assertReady(block: () => Promise<unknown>): Promise<void> {
    await assertJobCounts({ ready: 1 }, block);
    expect(await ((await Job.last()) as Job).isReady()).toBe(true);
  }

  async function assertScheduled(block: () => Promise<unknown>): Promise<void> {
    await assertJobCounts({ scheduled: 1 }, block);
  }

  async function assertBlocked(block: () => Promise<unknown>): Promise<void> {
    await assertJobCounts({ blocked: 1 }, block);
    expect(await ((await Job.last()) as Job).isBlocked()).toBe(true);
  }

  it("enqueue active job to be executed right away", async () => {
    const activeJob = new AddToBufferJob(1).set({ priority: 8, queue: "test" });

    await assertReady(() => Job.enqueue(activeJob));

    const solidQueueJob = (await Job.last()) as Job;
    expect(await solidQueueJob.isReady()).toBe(true);
    expect(await solidQueueJob.status()).toBe("ready");
    expect(activeJob.providerJobId).toBe(solidQueueJob.id);
    expect(solidQueueJob.priority).toBe(8);
    expect(solidQueueJob.queue_name).toBe("test");
    expect(solidQueueJob.class_name).toBe("AddToBufferJob");
    expect(Time.now().compare(solidQueueJob.scheduled_at)! >= 0).toBe(true);
    expect(solidQueueJob.arguments["arguments"]).toEqual([1]);

    const execution = (await ReadyExecution.last()) as ReadyExecution;
    expect((await execution.job).id).toBe(solidQueueJob.id);
    expect(execution.queue_name).toBe("test");
    expect(execution.priority).toBe(8);
  });

  it("enqueue active job to be scheduled in the future", async () => {
    const activeJob = new AddToBufferJob(1).set({ priority: 8, queue: "test" });

    await assertScheduled(() => Job.enqueue(activeJob, { scheduledAt: minutes(5).fromNow() }));

    const solidQueueJob = (await Job.last()) as Job;
    expect(await solidQueueJob.isScheduled()).toBe(true);
    expect(await solidQueueJob.status()).toBe("scheduled");
    expect(solidQueueJob.priority).toBe(8);
    expect(solidQueueJob.queue_name).toBe("test");
    expect(solidQueueJob.class_name).toBe("AddToBufferJob");
    expect(Time.now().compare(solidQueueJob.scheduled_at)! < 0).toBe(true);
    expect(solidQueueJob.arguments["arguments"]).toEqual([1]);

    const execution = (await ScheduledExecution.last()) as ScheduledExecution;
    expect((await execution.job).id).toBe(solidQueueJob.id);
    expect(execution.queue_name).toBe("test");
    expect(execution.priority).toBe(8);
    expect(execution.scheduled_at!.compare(solidQueueJob.scheduled_at)).toBe(0);
  });

  it("enqueue jobs within a connected_to block for the primary DB", async () => {
    await ShardedRecord.connectedTo({ role: "writing", shard: "shard_two" }, async () => {
      await ShardedJobResult.createBang({ value: "in shard two" });
      await AddToBufferJob.performLater("enqueued within block");
    });

    const job = (await Job.last()) as Job;
    expect((job.arguments["arguments"] as unknown[])[0]).toBe("enqueued within block");
  });

  it("enqueue jobs without concurrency controls", async () => {
    const activeJob = (await AddToBufferJob.performLater(1)) as AddToBufferJob;
    expect(activeJob.concurrencyLimit).toBeNull();
    expect(activeJob.concurrencyKey()).toBeNull();

    const job = (await Job.last()) as Job;
    expect(job.concurrencyLimit()).toBeNull();
    expect(job.isConcurrencyLimited()).toBe(false);
  });

  it("enqueue jobs with concurrency controls", async () => {
    const activeJob = (await NonOverlappingJob.performLater(result, {
      name: "A",
    })) as NonOverlappingJob;
    expect(activeJob.concurrencyLimit).toBe(1);
    expect(activeJob.concurrencyKey()).toBe(
      `SolidQueue::JobTest::NonOverlappingJob/JobResult/${result.id}`,
    );

    const job = (await Job.last()) as Job;
    expect(job.concurrencyLimit()).toBe(activeJob.concurrencyLimit);
    expect(job.concurrency_key).toBe(activeJob.concurrencyKey());
  });

  it("enqueue jobs with concurrency controls in the same concurrency group", async () => {
    await assertReady(async () => {
      const activeJob = (await NonOverlappingGroupedJob1.performLater(result, {
        name: "A",
      })) as NonOverlappingJob;
      expect(activeJob.concurrencyLimit).toBe(1);
      expect(activeJob.concurrencyKey()).toBe(`MyGroup/JobResult/${result.id}`);
    });

    await assertBlocked(async () => {
      const activeJob = (await NonOverlappingGroupedJob2.performLater(result, {
        name: "B",
      })) as NonOverlappingJob;
      expect(activeJob.concurrencyLimit).toBe(1);
      expect(activeJob.concurrencyKey()).toBe(`MyGroup/JobResult/${result.id}`);
    });
  });

  it("enqueue multiple jobs", async () => {
    const activeJobs = [
      new AddToBufferJob(2),
      new AddToBufferJob(6).set({ wait: minutes(2) }),
      new NonOverlappingJob(result),
      new StoreResultJob(42),
      new AddToBufferJob(4),
      new NonOverlappingGroupedJob1(result),
      new AddToBufferJob(6).set({ wait: minutes(3) }),
      new NonOverlappingJob(result),
      new NonOverlappingGroupedJob2(result),
    ];

    await assertJobCounts({ ready: 5, scheduled: 2, blocked: 2 }, () =>
      performAllLater(activeJobs),
    );

    const jobs = await Job.last(9);
    expect(activeJobs.map((activeJob) => activeJob.providerJobId as number).sort()).toEqual(
      jobs.map((job) => job.id as number).sort(),
    );
    expect(activeJobs.every((activeJob) => activeJob.isSuccessfullyEnqueued())).toBe(true);
  });

  it("block jobs when concurrency limits are reached", async () => {
    await assertReady(() => NonOverlappingJob.performLater(result, { name: "A" }));

    await assertBlocked(() => NonOverlappingJob.performLater(result, { name: "B" }));

    const blockedExecution = (await BlockedExecution.last()) as BlockedExecution;
    expect(
      blockedExecution.expires_at.compare(SolidQueue.defaultConcurrencyControlPeriod.fromNow())! <=
        0,
    ).toBe(true);
  });

  it("discard ready job", async () => {
    await AddToBufferJob.performLater(1);
    const job = (await Job.last()) as Job;

    await assertJobCounts({ ready: -1 }, () => job.discard());
  });

  it("discard blocked job", async () => {
    await NonOverlappingJob.performLater(result, { name: "ready" });
    await NonOverlappingJob.performLater(result, { name: "blocked" });
    const [, blockedJob] = await Job.last(2);
    const semaphore = (await Semaphore.last()) as Semaphore;

    travelTo(minutes(10).fromNow() as Time);

    await assertNoChanges(
      () => semaphore.value,
      null,
      {},
      () =>
        assertNoChanges(
          () => semaphore.expires_at,
          null,
          {},
          () => assertJobCounts({ blocked: -1 }, () => blockedJob.discard()),
        ),
    );
  });

  it("discard scheduled job", async () => {
    await (
      AddToBufferJob.set({ wait: minutes(5) }) as unknown as typeof AddToBufferJob
    ).performLater();
    const job = (await Job.last()) as Job;

    await assertJobCounts({ scheduled: -1 }, () => job.discard());
  });

  it("release blocked locks when discarding a ready job", async () => {
    await NonOverlappingJob.performLater(result, { name: "ready" });
    await NonOverlappingJob.performLater(result, { name: "blocked" });
    const [readyJob, blockedJob] = await Job.last(2);
    const semaphore = (await Semaphore.last()) as Semaphore;

    expect(await readyJob.isReady()).toBe(true);
    expect(await blockedJob.isBlocked()).toBe(true);

    travelTo(minutes(10).fromNow() as Time);

    await assertChanges(
      async () => (await semaphore.reload()).expires_at.toI(),
      null,
      {},
      () => assertJobCounts({ blocked: -1 }, () => readyJob.discard()),
    );

    expect(await (await blockedJob.reload()).isReady()).toBe(true);
  });

  it("discard jobs by execution type in bulk", async () => {
    const activeJobs = [
      new AddToBufferJob(2),
      new AddToBufferJob(6).set({ wait: minutes(2) }),
      new NonOverlappingJob(result),
      new StoreResultJob(42),
      new AddToBufferJob(4),
      new NonOverlappingGroupedJob1(result),
      new AddToBufferJob(6).set({ wait: minutes(3) }),
      new NonOverlappingJob(result),
      new NonOverlappingGroupedJob2(result),
    ];

    await assertJobCounts({ ready: 5, scheduled: 2, blocked: 2 }, () =>
      performAllLater(activeJobs),
    );

    await assertJobCounts({ ready: -5 }, () => ReadyExecution.discardAllFromJobs(Job.all()));

    await assertJobCounts({ scheduled: -2 }, () =>
      ScheduledExecution.discardAllFromJobs(Job.all()),
    );

    await assertJobCounts({ blocked: -2 }, () => BlockedExecution.discardAllFromJobs(Job.all()));
  });

  it("enqueue successfully inside a rolled-back transaction in the app DB", async () => {
    await assertDifference(
      () => Job.count(),
      1,
      null,
      async () => {
        await assertNoDifference(
          () => JobResult.count(),
          null,
          async () => {
            await JobResult.transaction(async () => {
              await JobResult.createBang({
                queue_name: "default",
                value: "this will be rolled back",
              });
              await StoreResultJob.performLater("enqueued inside a rolled back transaction");
              throw new Rollback();
            });
          },
        );
      },
    );

    const job = (await Job.last()) as Job;
    expect((job.arguments["arguments"] as unknown[])[0]).toBe(
      "enqueued inside a rolled back transaction",
    );
  });

  it("raise EnqueueError when there's an ActiveRecordError", async () => {
    vi.spyOn(Job, "createBang").mockRejectedValue(new Deadlocked());

    const activeJob = new AddToBufferJob(1).set({ priority: 8, queue: "test" });
    await expect(Job.enqueue(activeJob)).rejects.toThrow(EnqueueError);

    await expect(AddToBufferJob.performLater(1)).rejects.toThrow(EnqueueError);
  });
});
