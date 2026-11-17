import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import {
  assertDifference,
  assertNoDifference,
} from "@blazetrails/activesupport/testing/assertions";
import type { Relation } from "@blazetrails/activerecord";
import {
  BlockedExecution,
  ClaimedExecution,
  Job,
  Queue,
  ReadyExecution,
  Semaphore,
  SolidQueueAdapter,
} from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import { JobResult } from "./support/job-result.js";
import { loadAppSchema } from "./support/queue-schema.js";
import { ThrottledUpdateResultJob } from "./support/throttled-update-result-job.js";
import { AddToBufferJob } from "./support/add-to-buffer-job.js";
import { Pause } from "../lib/pause.js";

describe("SolidQueue::ReadyExecutionTest", () => {
  let jobs: Relation<Job>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
  });

  beforeEach(async () => {
    for (let i = 0; i < 5; i++) {
      await (
        AddToBufferJob.set({
          queue: "backend",
          priority: 5 - i,
        }) as unknown as typeof AddToBufferJob
      ).performLater(i);
    }

    jobs = Job.where({ queue_name: "backend" }).order("priority");
  });

  afterEach(async () => {
    await Job.destroyAll();
    await Semaphore.deleteAll();
    await Pause.deleteAll();
    await JobResult.deleteAll();
  });

  async function assertClaimedJobs(count: number, block: () => Promise<unknown>): Promise<void> {
    await assertDifference(
      new Map([
        [() => ClaimedExecution.count(), +count],
        [() => ReadyExecution.count(), -count],
      ]),
      null,
      block,
    );
  }

  async function reloaded(): Promise<Job[]> {
    return await jobs.toArray();
  }

  it("claim all jobs for existing queue", async () => {
    const count = await jobs.count();
    await assertClaimedJobs(count, () => ReadyExecution.claim("backend", count + 1, 42));

    const records = await reloaded();
    expect(
      (await Promise.all(records.map((job) => job.isReady()))).every((value) => !value),
    ).toBeTruthy();
    expect((await Promise.all(records.map((job) => job.isClaimed()))).every(Boolean)).toBeTruthy();
  });

  it("claim jobs for queue without jobs at the moment", async () => {
    await assertNoDifference(
      [() => ReadyExecution.count(), () => ClaimedExecution.count()],
      null,
      () => ReadyExecution.claim("some_non_existing_queue", 10, 42),
    );
  });

  it("claim some jobs for existing queue", async () => {
    await assertClaimedJobs(2, () => ReadyExecution.claim("backend", 2, 42));

    const records = await reloaded();
    for (const job of records.slice(0, 2)) {
      expect(await job.isReady()).toBeFalsy();
      expect(await job.isClaimed()).toBeTruthy();
    }

    for (const job of records.slice(2)) {
      expect(await job.isReady()).toBeTruthy();
      expect(await job.isClaimed()).toBeFalsy();
    }
  });

  it("claim jobs using a list of queues", async () => {
    await AddToBufferJob.performLater("hey");

    await assertClaimedJobs(6, async () =>
      ReadyExecution.claim(["backend", "background"], (await Job.count()) + 1, 42),
    );
  });

  it("claim jobs using a wildcard", async () => {
    await AddToBufferJob.performLater("hey");

    await assertClaimedJobs(6, async () => ReadyExecution.claim("*", (await Job.count()) + 1, 42));
  });

  it("claim jobs using queue prefixes", async () => {
    await AddToBufferJob.performLater("hey");

    await assertClaimedJobs(1, async () =>
      ReadyExecution.claim("backgr*", (await Job.count()) + 1, 42),
    );

    expect(
      (await Promise.all((await reloaded()).map((job) => job.isClaimed()))).every(
        (value) => !value,
      ),
    ).toBeTruthy();
  });

  it("claim jobs using a wildcard and having paused queues", async () => {
    await AddToBufferJob.performLater("hey");

    await Queue.findByName("backend").pause();

    await assertClaimedJobs(1, async () => ReadyExecution.claim("*", (await Job.count()) + 1, 42));

    expect(
      (await Promise.all((await reloaded()).map((job) => job.isClaimed()))).every(
        (value) => !value,
      ),
    ).toBeTruthy();
  });

  it("claim jobs using both exact names and a prefix", async () => {
    await AddToBufferJob.performLater("hey");

    await assertClaimedJobs(6, async () =>
      ReadyExecution.claim(["backe*", "background"], (await Job.count()) + 1, 42),
    );
  });

  it("claim jobs for queue without jobs at the moment using prefixes", async () => {
    await AddToBufferJob.performLater("hey");

    await assertClaimedJobs(0, async () =>
      ReadyExecution.claim(["none*"], (await Job.count()) + 1, 42),
    );
  });

  it("priority order is used when claiming jobs using a wildcard", async () => {
    await (AddToBufferJob.set({ priority: 1 }) as unknown as typeof AddToBufferJob).performLater(
      "hey",
    );
    const job = (await Job.last()) as Job;

    await assertClaimedJobs(3, () => ReadyExecution.claim("*", 3, 42));

    expect(await (await job.reload()).isClaimed()).toBeTruthy();
    for (const job of (await reloaded()).slice(0, 2)) {
      expect(await job.isReady()).toBeFalsy();
      expect(await job.isClaimed()).toBeTruthy();
    }
  });

  it("queue order and then priority is respected when using a list of queues", async () => {
    await AddToBufferJob.performLater("hey");
    const job = (await Job.last()) as Job;
    expect(job.queue_name).toBe("background");

    await assertClaimedJobs(3, () => ReadyExecution.claim(["background", "backend"], 3, 42));

    expect(await (await job.reload()).isClaimed()).toBeTruthy();
    for (const job of (await reloaded()).slice(0, 2)) {
      expect(await job.isReady()).toBeFalsy();
      expect(await job.isClaimed()).toBeTruthy();
    }
  });

  it("queue order is respected when using prefixes", async () => {
    for (const queueName of [
      "queue_b1",
      "queue_b2",
      "queue_a2",
      "queue_a1",
      "queue_b1",
      "queue_a2",
      "queue_b2",
      "queue_a1",
    ]) {
      await (
        AddToBufferJob.set({ queue: queueName }) as unknown as typeof AddToBufferJob
      ).performLater(1);
    }

    let claimedJobs: Job[] = [];
    for (let i = 0; i < 4; i++) {
      await assertClaimedJobs(2, () => ReadyExecution.claim(["queue_b*", "queue_a*"], 2, 42));

      const last = await ClaimedExecution.order("id").last(2);
      for (const execution of last) claimedJobs = [...claimedJobs, await execution.job];
    }

    expect(claimedJobs.map((job) => job.queue_name)).toEqual([
      "queue_b1",
      "queue_b1",
      "queue_b2",
      "queue_b2",
      "queue_a1",
      "queue_a1",
      "queue_a2",
      "queue_a2",
    ]);
  });

  it("queue order is respected when mixing exact names with prefixes", async () => {
    for (const queueName of [
      "queue_b1",
      "queue_b2",
      "queue_a2",
      "queue_c2",
      "queue_a1",
      "queue_c1",
      "queue_b1",
      "queue_a2",
      "queue_b2",
      "queue_a1",
    ]) {
      await (
        AddToBufferJob.set({ queue: queueName }) as unknown as typeof AddToBufferJob
      ).performLater(1);
    }

    let claimedJobs: Job[] = [];
    for (let i = 0; i < 5; i++) {
      await assertClaimedJobs(2, () =>
        ReadyExecution.claim(["queue_a2", "queue_c1", "queue_b*", "queue_c2", "queue_a*"], 2, 42),
      );

      const last = await ClaimedExecution.order("id").last(2);
      for (const execution of last) claimedJobs = [...claimedJobs, await execution.job];
    }

    expect(claimedJobs.map((job) => job.queue_name)).toEqual([
      "queue_a2",
      "queue_a2",
      "queue_c1",
      "queue_b1",
      "queue_b1",
      "queue_b2",
      "queue_b2",
      "queue_c2",
      "queue_a1",
      "queue_a1",
    ]);
  });

  it("discard all", async () => {
    for (let i = 0; i < 3; i++) await AddToBufferJob.performLater(i);

    await assertDifference([() => ReadyExecution.count(), () => Job.count()], -8, null, () =>
      ReadyExecution.discardAllInBatches(),
    );
  });

  it("discard all by queue", async () => {
    for (let i = 0; i < 3; i++) await AddToBufferJob.performLater(i);

    await assertDifference([() => ReadyExecution.count(), () => Job.count()], -5, null, () =>
      (
        ReadyExecution.queuedAs("backend") as unknown as typeof ReadyExecution
      ).discardAllInBatches(),
    );

    await assertNoDifference([() => ReadyExecution.count(), () => Job.count()], null, () =>
      (
        ReadyExecution.queuedAs("backend") as unknown as typeof ReadyExecution
      ).discardAllInBatches(),
    );
  });

  it("bulk discard unblocks one job for each released concurrency slot", async () => {
    const result = await JobResult.createBang({});
    for (let i = 0; i < 7; i++) {
      await ThrottledUpdateResultJob.performLater(result, { name: String(i) });
    }
    const throttledJobs = await Job.where({ class_name: "ThrottledUpdateResultJob" })
      .order("id")
      .toArray();

    expect(await BlockedExecution.count()).toEqual(4);

    await assertDifference(
      new Map([
        [() => Job.count(), -2],
        [() => BlockedExecution.count(), -2],
      ]),
      null,
      () => ReadyExecution.discardAllFromJobs(throttledJobs.slice(0, 2)),
    );

    expect(
      await ReadyExecution.where({ job_id: throttledJobs.map((job) => job.id) })
        .order("job_id")
        .pluck("job_id"),
    ).toEqual(throttledJobs.slice(2, 5).map((job) => job.id));
    let allBlocked = true;
    for (const job of throttledJobs.slice(-2)) {
      if (!(await (await job.reload()).isBlocked())) allBlocked = false;
    }
    expect(allBlocked).toBeTruthy();
    expect((await Semaphore.findByBang({ key: throttledJobs[0].concurrency_key })).value).toEqual(
      0,
    );
  });
});
