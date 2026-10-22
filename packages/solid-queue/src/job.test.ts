import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertDifference, minutes } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { Job, ReadyExecution, ScheduledExecution, SolidQueueAdapter } from "./index.js";
import { AddToBufferJob } from "./test-helpers/add-to-buffer-job.js";
import { loadQueueSchema } from "./test-helpers/queue-schema.js";

describe("SolidQueue::JobTest", () => {
  beforeAll(async () => {
    await loadQueueSchema();
    AddToBufferJob.setQueueAdapter(new SolidQueueAdapter());
  });

  beforeEach(async () => {
    await Job.deleteAll();
  });

  async function assertJobCounts(
    { ready = 0, scheduled = 0 }: { ready?: number; scheduled?: number },
    block: () => Promise<unknown>,
  ): Promise<void> {
    await assertDifference(
      () => Job.count(),
      +(ready + scheduled),
      null,
      () =>
        assertDifference(
          () => ReadyExecution.count(),
          +ready,
          null,
          () => assertDifference(() => ScheduledExecution.count(), +scheduled, null, block),
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

  it("discard ready job", async () => {
    await AddToBufferJob.performLater(1);
    const job = (await Job.last()) as Job;

    await assertJobCounts({ ready: -1 }, () => job.discard());
  });

  it("discard scheduled job", async () => {
    await (
      AddToBufferJob.set({ wait: minutes(5) }) as unknown as typeof AddToBufferJob
    ).performLater();
    const job = (await Job.last()) as Job;

    await assertJobCounts({ scheduled: -1 }, () => job.discard());
  });
});
