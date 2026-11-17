import type {} from "@blazetrails/vitest-matchers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import { Notifications, minutes } from "@blazetrails/activesupport";
import {
  assertChanges,
  assertDifference,
  assertNoChanges,
  assertNoDifference,
} from "@blazetrails/activesupport/testing/assertions";
import { freezeTime, travelBack, travelTo } from "@blazetrails/activesupport/testing/time-helpers";
import { Deadlocked, Rollback } from "@blazetrails/activerecord";
import { Time } from "@blazetrails/date";
import { performAllLater } from "@blazetrails/activejob";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { constGet, constSet } from "@blazetrails/ruby-compat";
import {
  BlockedExecution,
  ClaimedExecution,
  EnqueueError,
  Job,
  Process,
  ReadyExecution,
  ScheduledExecution,
  Semaphore,
  SolidQueue,
  SolidQueueAdapter,
  UndiscardableError,
  Worker,
} from "../lib/index.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { ApplicationJob } from "./support/application-job.js";
import { AddToBufferJob } from "./support/add-to-buffer-job.js";
import { JobResult, StoreResultJob } from "./support/job-result.js";
import { ShardedJobResult } from "./support/sharded-job-result.js";
import { ShardedRecord } from "./support/sharded-record.js";
import { loadAppSchema } from "./support/queue-schema.js";

class NonOverlappingJob extends ApplicationJob {
  static {
    this.limitsConcurrency({ key: (jobResult: unknown) => jobResult });
  }

  perform(_jobResult: unknown): void {}
}

class DiscardableNonOverlappingJob extends NonOverlappingJob {
  static {
    this.limitsConcurrency({ key: (jobResult: unknown) => jobResult, onConflict: "discard" });
  }
}

class DiscardableNonOverlappingGroupedJob1 extends NonOverlappingJob {
  static {
    this.limitsConcurrency({
      key: (jobResult: unknown) => jobResult,
      group: "DiscardingGroup",
      onConflict: "discard",
    });
  }
}

class DiscardableNonOverlappingGroupedJob2 extends NonOverlappingJob {
  static {
    this.limitsConcurrency({
      key: (jobResult: unknown) => jobResult,
      group: "DiscardingGroup",
      onConflict: "discard",
    });
  }
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

class JobTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(constGet(Object, "SolidQueue") as object, "JobTest", JobTest);
for (const klass of [
  NonOverlappingJob,
  DiscardableNonOverlappingJob,
  DiscardableNonOverlappingGroupedJob1,
  DiscardableNonOverlappingGroupedJob2,
  NonOverlappingGroupedJob1,
  NonOverlappingGroupedJob2,
]) {
  constSet(JobTest, klass.name, klass);
}

describe("SolidQueue::JobTest", () => {
  let result: JobResult;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
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
    expect(await ((await Job.last()) as Job).isReady()).toBeTruthy();
  }

  async function assertScheduled(block: () => Promise<unknown>): Promise<void> {
    await assertJobCounts({ scheduled: 1 }, block);
  }

  async function assertBlocked(block: () => Promise<unknown>): Promise<void> {
    await assertJobCounts({ blocked: 1 }, block);
    expect(await ((await Job.last()) as Job).isBlocked()).toBeTruthy();
  }

  it("enqueue does not reload the job to create its execution", async () => {
    const payloads: { sql: string; name: string }[] = [];
    const callback = (
      _name: unknown,
      _start: unknown,
      _finish: unknown,
      _id: unknown,
      payload: { sql: string; name: string },
    ) => payloads.push(payload);

    await Notifications.subscribed(callback, "sql.active_record", async () => {
      await AddToBufferJob.performLater(1);
      await AddToBufferJob.set({ wait: minutes(1) }).performLater(2);
      for (let i = 0; i < 2; i++) await NonOverlappingJob.performLater(result);
    });

    expect(await BlockedExecution.isExists()).toBeTruthy();

    const jobSelects = payloads
      .filter(({ name, sql }) => name !== "SCHEMA" && /^SELECT .*solid_queue_jobs/i.test(sql))
      .map(({ sql }) => sql);
    expect(jobSelects).toBeEmpty();
  });

  it("enqueue active job to be executed right away", async () => {
    const activeJob = new AddToBufferJob(1).set({ priority: 8, queue: "test" });

    await assertReady(() => Job.enqueue(activeJob));

    const solidQueueJob = (await Job.last()) as Job;
    expect(await solidQueueJob.isReady()).toBeTruthy();
    expect(await solidQueueJob.status()).toBe("ready");
    expect(activeJob.providerJobId).toBe(solidQueueJob.id);
    expect(solidQueueJob.priority).toBe(8);
    expect(solidQueueJob.queue_name).toBe("test");
    expect(solidQueueJob.class_name).toBe("AddToBufferJob");
    expect(Time.now().compare(solidQueueJob.scheduled_at)! >= 0).toBeTruthy();
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
    expect(await solidQueueJob.isScheduled()).toBeTruthy();
    expect(await solidQueueJob.status()).toBe("scheduled");
    expect(solidQueueJob.priority).toBe(8);
    expect(solidQueueJob.queue_name).toBe("test");
    expect(solidQueueJob.class_name).toBe("AddToBufferJob");
    expect(Time.now().compare(solidQueueJob.scheduled_at)! < 0).toBeTruthy();
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
    expect(job.concurrencyLimit).toBeNull();
    expect(job.isConcurrencyLimited()).toBeFalsy();
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
    expect(job.concurrencyLimit).toBe(activeJob.concurrencyLimit);
    expect(job.concurrency_key).toBe(activeJob.concurrencyKey());
  });

  it("block jobs in the same concurrency group when concurrency limits are reached", async () => {
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

  it("enqueue jobs in bulk", async () => {
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
    expect(activeJobs.every((activeJob) => activeJob.isSuccessfullyEnqueued())).toBeTruthy();
  });

  it("enqueue jobs in bulk acquiring their concurrency locks by key", async () => {
    const results: JobResult[] = [];
    for (let i = 0; i < 3; i++) results.push(await JobResult.createBang({ queue_name: "default" }));

    const acquired: [string, number][] = [];
    vi.spyOn(Semaphore, "wait").mockImplementation(async (job) => {
      acquired.push([job.concurrency_key!, job.id as number]);
      return 1;
    });

    const activeJobs = [...results.reverse(), ...results].map(
      (jobResult) => new NonOverlappingJob(jobResult),
    );
    await performAllLater(activeJobs);

    expect(acquired.length).toBe(6);
    expect(acquired).toEqual(
      [...acquired].sort(([k1, i1], [k2, i2]) => (k1 < k2 ? -1 : k1 > k2 ? 1 : i1 - i2)),
    );
  });

  it("block jobs when concurrency limits are reached", async () => {
    await assertReady(() => NonOverlappingJob.performLater(result, { name: "A" }));

    await assertBlocked(() => NonOverlappingJob.performLater(result, { name: "B" }));

    const blockedExecution = (await BlockedExecution.last()) as BlockedExecution;
    expect(
      blockedExecution.expires_at.compare(SolidQueue.defaultConcurrencyControlPeriod.fromNow())! <=
        0,
    ).toBeTruthy();
  });

  it("skips jobs with on_conflict set to discard when concurrency limits are reached", async () => {
    await assertJobCounts({ ready: 1 }, async () => {
      await DiscardableNonOverlappingJob.performLater(result, { name: "A" });
      await DiscardableNonOverlappingJob.performLater(result, { name: "B" });
    });
  });

  it("skips jobs with on_conflict set to discard in the same concurrency group when concurrency limits are reached", async () => {
    await assertJobCounts({ ready: 1 }, async () => {
      let activeJob = (await DiscardableNonOverlappingGroupedJob1.performLater(result, {
        name: "A",
      })) as NonOverlappingJob;
      expect(activeJob.concurrencyLimit).toBe(1);
      expect(activeJob.concurrencyKey()).toBe(`DiscardingGroup/JobResult/${result.id}`);

      activeJob = (await DiscardableNonOverlappingGroupedJob2.performLater(result, {
        name: "B",
      })) as NonOverlappingJob;
      expect(activeJob.concurrencyLimit).toBe(1);
      expect(activeJob.concurrencyKey()).toBe(`DiscardingGroup/JobResult/${result.id}`);
    });
  });

  it("enqueue scheduled job with concurrency controls and on_conflict set to discard", async () => {
    await assertReady(() => DiscardableNonOverlappingJob.performLater(result, { name: "A" }));

    await assertScheduled(() =>
      DiscardableNonOverlappingJob.set({ wait: minutes(5) }).performLater(result, { name: "B" }),
    );

    const scheduledJob = (await Job.last()) as Job;

    travelTo(minutes(10).fromNow() as Time);

    expect(await ScheduledExecution.dispatchNextBatch(10)).toBe(0);
    expect(await Job.findBy({ id: scheduledJob.id })).toBeNull();
  });

  it("enqueues jobs in bulk with concurrency controls and some set to discard", async () => {
    const activeJobs = [
      new AddToBufferJob(2),
      new DiscardableNonOverlappingJob(result),
      new NonOverlappingJob(result),
      new AddToBufferJob(6).set({ wait: minutes(2) }),
      new NonOverlappingJob(result),
      new DiscardableNonOverlappingJob(result),
    ];
    const notEnqueued = activeJobs.at(-1)!;

    await assertJobCounts({ ready: 3, scheduled: 1, blocked: 1 }, () =>
      performAllLater(activeJobs),
    );

    const jobs = await Job.last(5);
    const enqueued = activeJobs.filter((activeJob) => activeJob !== notEnqueued);
    expect(enqueued.map((activeJob) => activeJob.providerJobId as number).sort()).toEqual(
      jobs.map((job) => job.id as number).sort(),
    );
    expect(enqueued.every((activeJob) => activeJob.isSuccessfullyEnqueued())).toBeTruthy();

    expect(notEnqueued.providerJobId).toBeNull();
    expect(notEnqueued.isSuccessfullyEnqueued()).toBeFalsy();
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
      () => assertJobCounts({ blocked: -1 }, () => blockedJob.discard()),
    );
  });

  it("try to discard claimed job", async () => {
    const oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
    await StoreResultJob.performLater(42, { pause: 2 });
    const job = (await Job.last()) as Job;

    const worker = new Worker({ queues: "background" });
    await worker.start();
    await new Promise((resolve) => setTimeout(resolve, 200));

    try {
      await assertNoDifference([() => Job.count(), () => ClaimedExecution.count()], null, () =>
        expect(job.discard()).rejects.toThrow(UndiscardableError),
      );
    } finally {
      await worker.stop();
      await Process.destroyAll();
      setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
    }
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

    expect(await readyJob.isReady()).toBeTruthy();
    expect(await blockedJob.isBlocked()).toBeTruthy();

    travelTo(minutes(10).fromNow() as Time);

    await assertChanges(
      async () => (await semaphore.reload()).expires_at.toI(),
      null,
      {},
      () => assertJobCounts({ blocked: -1 }, () => readyJob.discard()),
    );

    expect(await (await blockedJob.reload()).isReady()).toBeTruthy();
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

    await assertJobCounts({ blocked: -2 }, () => BlockedExecution.discardAllFromJobs(Job.all()));

    await assertJobCounts({ ready: -5 }, () => ReadyExecution.discardAllFromJobs(Job.all()));

    await assertJobCounts({ scheduled: -2 }, () =>
      ScheduledExecution.discardAllFromJobs(Job.all()),
    );
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

  it("enqueue_all assigns scheduled_at if missing", async () => {
    freezeTime();
    const activeJobs = [new AddToBufferJob(1), new AddToBufferJob(2).set({ wait: minutes(5) })];

    await performAllLater(activeJobs);

    const jobs = await Job.where({ active_job_id: activeJobs.map((job) => job.jobId) })
      .order("id")
      .toArray();

    expect(jobs[0].scheduled_at).toEqualRuby(Time.current());
    expect(jobs[1].scheduled_at).toEqualRuby(minutes(5).fromNow());
  });
});
