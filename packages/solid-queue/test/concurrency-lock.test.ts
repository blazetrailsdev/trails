import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { minutes } from "@blazetrails/activesupport";
import { travelBack, travelTo } from "@blazetrails/activesupport/testing/time-helpers";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { performAllLater } from "@blazetrails/activejob";
import type { Time } from "@blazetrails/date";
import { constGet, constSet, rbModName } from "@blazetrails/ruby-compat";
import { randomUUID } from "node:crypto";
import {
  ClaimedExecution,
  FailedExecution,
  Job,
  Process,
  ReadyExecution,
  Semaphore,
  SolidQueueAdapter,
} from "../lib/index.js";
import { ConcurrencyControls } from "../lib/job/concurrency-controls.js";
import { AddToBufferJob } from "./support/add-to-buffer-job.js";
import { ApplicationJob } from "./support/application-job.js";
import { ExpectedTestError } from "./support/expected-test-error.js";
import { loadAppSchema } from "./support/queue-schema.js";

class NonOverlappingJob extends ApplicationJob {
  static {
    this.limitsConcurrency({ key: "concurrency-lock-test", duration: minutes(1) });
  }

  perform(_name: string): void {}
}

class TwoAtATimeJob extends ApplicationJob {
  static {
    this.limitsConcurrency({ to: 2, key: "concurrency-lock-test", duration: minutes(1) });
  }

  perform(_name: string): void {}
}

class ConcurrencyLockTest extends TestCase {}
constSet(constGet(Object, "SolidQueue") as object, "ConcurrencyLockTest", ConcurrencyLockTest);
for (const klass of [NonOverlappingJob, TwoAtATimeJob]) {
  constSet(ConcurrencyLockTest, klass.name, klass);
}

describe("SolidQueue::ConcurrencyLockTest", () => {
  let process: Process;
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
    process = await Process.register({ kind: "Worker", pid: 42, name: "worker-123" });
  });

  afterEach(async () => {
    travelBack();
    await Job.destroyAll();
    await Semaphore.deleteAll();
    await Process.destroyAll();
  });

  async function semaphore(): Promise<Semaphore> {
    return await Semaphore.sole();
  }

  async function jobFor(activeJob: unknown): Promise<Job> {
    return await Job.findByBang({ active_job_id: (activeJob as ApplicationJob).jobId });
  }

  async function claim(activeJob: unknown): Promise<ClaimedExecution> {
    return await claimJob(await jobFor(activeJob));
  }

  async function claimJob(job: Job): Promise<ClaimedExecution> {
    await ReadyExecution.claim(job.queue_name, 1, process.id);
    return await ClaimedExecution.findByBang({ job_id: job.id });
  }

  it("a job that outlived its lock does not release the lock a later job acquired", async () => {
    const a = await claim(await NonOverlappingJob.performLater("A"));

    travelTo(minutes(2).fromNow() as Time);
    await Semaphore.expired().deleteAll();

    const b = await claim(await NonOverlappingJob.performLater("B"));
    const c = await jobFor(await NonOverlappingJob.performLater("C"));
    expect(await c.isBlocked()).toBe(true);

    await a.perform();

    expect(await (await (await b.job).reload()).isClaimed()).toBe(true);
    expect(await (await c.reload()).isBlocked()).toBe(true);
  });

  it("a job that outlived its lock does not leave the key over its limit", async () => {
    const a = await claim(await NonOverlappingJob.performLater("A"));

    travelTo(minutes(2).fromNow() as Time);
    await Semaphore.expired().deleteAll();

    const b = await claim(await NonOverlappingJob.performLater("B"));
    const c = await jobFor(await NonOverlappingJob.performLater("C"));
    const d = await jobFor(await NonOverlappingJob.performLater("D"));

    await a.perform();
    await b.perform();
    await claimJob(c);

    expect(await (await d.reload()).isBlocked()).toBe(true);
  });

  it("a job that got its slot gives it back even if its class is missing when it runs", async () => {
    let a = await claim(await NonOverlappingJob.performLater("A"));
    const b = await jobFor(await NonOverlappingJob.performLater("B"));
    expect(await b.isBlocked()).toBe(true);

    await (await a.job).updateColumn("class_name", "RemovedJobClass");
    a = await ClaimedExecution.find(a.id);

    await expect(a.perform()).rejects.toThrow(Job.ClassMissingError);

    expect(await (await b.reload()).isReady()).toBe(true);
    expect((await semaphore()).value).toEqual(0);
  });

  it("a job that skipped its limits because its class was missing doesn't give back a slot", async () => {
    const a = await claim(await NonOverlappingJob.performLater("A"));
    const b = await jobFor(await NonOverlappingJob.performLater("B"));

    const x = await Job.createBang({
      queue_name: "default",
      class_name: "RemovedJobClass",
      active_job_id: randomUUID(),
      arguments: { job_class: "RemovedJobClass", arguments: ["X"] },
      concurrency_key: (await a.job).concurrency_key,
    });
    expect(await x.isReady()).toBe(true);

    await x.updateColumns({
      class_name: rbModName(NonOverlappingJob),
      arguments: { ...x.arguments, job_class: rbModName(NonOverlappingJob) },
    });
    await (await claimJob(x)).perform();

    expect(await (await (await a.job).reload()).isClaimed()).toBe(true);
    expect(await (await b.reload()).isBlocked()).toBe(true);
  });

  it("a job dispatched before Solid Queue recorded its semaphore gives back its slot by key", async () => {
    let a = await claim(await NonOverlappingJob.performLater("A"));
    const b = await jobFor(await NonOverlappingJob.performLater("B"));
    const aJob = await a.job;
    const { [ConcurrencyControls.CONCURRENCY_LOCK_KEY]: _lock, ...argumentsWithoutLock } =
      aJob.arguments;
    await aJob.updateColumn("arguments", argumentsWithoutLock);
    a = await ClaimedExecution.find(a.id);

    await a.perform();

    expect(await (await b.reload()).isReady()).toBe(true);
  });

  it("a blocked job records the semaphore it gets when it's released", async () => {
    const a = await claim(await NonOverlappingJob.performLater("A"));
    const b = await jobFor(await NonOverlappingJob.performLater("B"));
    expect((await a.job).acquiredSemaphoreId()).not.toBeNull();
    expect(b.acquiredSemaphoreId()).toBeNull();

    await a.perform();

    expect(await (await b.reload()).isReady()).toBe(true);
    expect(b.acquiredSemaphoreId()).toEqual((await semaphore()).id);
    expect(b.acquiredConcurrencyLimit()).toEqual(1);
  });

  it("jobs enqueued in bulk record the semaphore they get", async () => {
    await performAllLater([new NonOverlappingJob("A"), new NonOverlappingJob("B")]);
    const [a, b] = await Job.where({ class_name: rbModName(NonOverlappingJob) })
      .order("id")
      .toArray();

    expect(await a.isReady()).toBe(true);
    expect(a.acquiredSemaphoreId()).toEqual((await semaphore()).id);
    expect(await b.isBlocked()).toBe(true);
    expect(b.acquiredSemaphoreId()).toBeNull();
  });

  it("jobs sharing a semaphore give their slots back to it", async () => {
    const a = await claim(await TwoAtATimeJob.performLater("A"));
    const b = await claim(await TwoAtATimeJob.performLater("B"));
    const c = await jobFor(await TwoAtATimeJob.performLater("C"));

    const semaphoreId = (await semaphore()).id;
    expect([(await a.job).acquiredSemaphoreId(), (await b.job).acquiredSemaphoreId()]).toEqual([
      semaphoreId,
      semaphoreId,
    ]);
    expect((await a.job).acquiredConcurrencyLimit()).toEqual(2);
    expect(await c.isBlocked()).toBe(true);

    await a.perform();

    expect(await (await c.reload()).isReady()).toBe(true);
    expect((await semaphore()).value).toEqual(0);
  });

  it("discarding a ready job gives its slot back", async () => {
    const a = await jobFor(await NonOverlappingJob.performLater("A"));
    const b = await jobFor(await NonOverlappingJob.performLater("B"));

    await a.discard();

    expect(await (await b.reload()).isReady()).toBe(true);
  });

  it("discarding ready jobs in bulk gives their slots back", async () => {
    const a = await jobFor(await NonOverlappingJob.performLater("A"));
    const b = await jobFor(await NonOverlappingJob.performLater("B"));

    await ReadyExecution.discardAllFromJobs([a]);

    expect(await (await b.reload()).isReady()).toBe(true);
  });

  it("a retried job records the semaphore it gets on the retry", async () => {
    const a = await claim(await NonOverlappingJob.performLater("A"));
    await a.failedWith(new ExpectedTestError());
    const firstSemaphoreId = (await (await a.job).reload()).acquiredSemaphoreId();

    travelTo(minutes(2).fromNow() as Time);
    await Semaphore.expired().deleteAll();

    await ((await (await a.job).failedExecution) as FailedExecution).retry();

    const job = await (await a.job).reload();
    expect(await job.isReady()).toBe(true);
    expect(job.acquiredSemaphoreId()).not.toEqual(firstSemaphoreId);
    expect(job.acquiredSemaphoreId()).toEqual((await semaphore()).id);
  });

  it("a job records the limit it got its slot with, even when its class doesn't set one", async () => {
    const a = await Job.createBang({
      queue_name: "default",
      class_name: rbModName(AddToBufferJob),
      active_job_id: randomUUID(),
      arguments: { job_class: rbModName(AddToBufferJob), arguments: [1] },
      concurrency_key: "concurrency-lock-test",
    });
    expect(a.acquiredConcurrencyLimit()).toEqual(1);

    await a.updateColumns({ class_name: "RemovedJobClass" });
    await expect((await claimJob(a)).perform()).rejects.toThrow(Job.ClassMissingError);

    expect((await semaphore()).value).toEqual(1);
  });
});
