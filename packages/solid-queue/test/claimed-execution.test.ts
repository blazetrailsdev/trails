import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { Callbacks } from "@blazetrails/activejob/callbacks";
import {
  ActiveSupport,
  Reloader,
  type ClassMethods as CallbacksClassMethods,
} from "@blazetrails/activesupport";
import { assertDifference } from "@blazetrails/activesupport/testing/assertions";
import { StatementInvalid } from "@blazetrails/activerecord";
import { Time } from "@blazetrails/date";
import { RuntimeError, block, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import { randomUUID } from "node:crypto";
import {
  ClaimedExecution,
  FailedExecution,
  Job,
  Process,
  BlockedExecution,
  ReadyExecution,
  Semaphore,
  SolidQueueAdapter,
} from "../lib/index.js";
import { UndiscardableError } from "../lib/execution.js";
import { JobResult } from "./support/job-result.js";
import { NonOverlappingUpdateResultJob } from "./support/non-overlapping-update-result-job.js";
import { ProviderJobIdJob } from "./support/provider-job-id-job.js";
import { ApplicationJob } from "./support/application-job.js";
import { AddToBufferJob, JobBuffer } from "./support/add-to-buffer-job.js";
import { ErrorBuffer } from "./support/error-buffer.js";
import { RaisingJob } from "./support/raising-job.js";
import { loadAppSchema } from "./support/queue-schema.js";

describe("SolidQueue::ClaimedExecutionTest", () => {
  let process: Process;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(async () => {
    process = await Process.register({
      kind: "Worker",
      pid: 42,
      name: "worker-123",
      metadata: { queue: "background" },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    JobBuffer.clear();
    await Job.destroyAll();
    await Semaphore.deleteAll();
    await Process.destroyAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  async function prepareAndClaimJob(
    activeJob: unknown,
    { process: claimingProcess = process }: { process?: Process } = {},
  ): Promise<ClaimedExecution> {
    const job = (await Job.findBy({ active_job_id: (activeJob as ApplicationJob).jobId })) as Job;

    await job.prepareForExecution();
    await assertDifference(
      () => ClaimedExecution.count(),
      +1,
      null,
      () => ReadyExecution.claim(job.queue_name, 1, claimingProcess.id),
    );

    return (await ClaimedExecution.last()) as ClaimedExecution;
  }

  async function createJobWithMissingClass({
    concurrencyKey = null,
  }: { concurrencyKey?: string | null } = {}): Promise<Job> {
    return await Job.createBang({
      queue_name: "background",
      class_name: "RemovedJobClass",
      active_job_id: randomUUID(),
      arguments: { job_class: "RemovedJobClass", arguments: [] },
      concurrency_key: concurrencyKey,
      scheduled_at: Time.current(),
    });
  }

  async function claimJob(
    job: Job,
    { process: claimingProcess = process }: { process?: Process } = {},
  ): Promise<ClaimedExecution> {
    await assertDifference(
      () => ClaimedExecution.count(),
      +1,
      null,
      () => ReadyExecution.claim(job.queue_name, 1, claimingProcess.id),
    );

    return (await ClaimedExecution.last()) as ClaimedExecution;
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

  it("perform job successfully", async () => {
    const claimedExecution = await prepareAndClaimJob(await AddToBufferJob.performLater(42));
    const job = await claimedExecution.job;
    expect(job.isFinished()).toBeFalsy();

    await assertDifference(
      () => ClaimedExecution.count(),
      -1,
      null,
      () => claimedExecution.perform(),
    );

    expect((await job.reload()).isFinished()).toBeTruthy();
  });

  it("raises FinalizationError when finishing fails while the claim remains", async () => {
    const claimedExecution = await prepareAndClaimJob(await AddToBufferJob.performLater(42));

    vi.spyOn(ClaimedExecution.prototype as never, "finished").mockRejectedValue(
      new StatementInvalid("transient DB glitch"),
    );

    let error: Error | null = null;
    await expect(
      claimedExecution.perform().catch((e: Error) => {
        error = e;
        throw e;
      }),
    ).rejects.toThrow(ClaimedExecution.FinalizationError);

    expect(error!.message).toMatch(/transient DB glitch/);
    expect((error!.cause as Error).constructor).toEqual(StatementInvalid);
    expect(await ClaimedExecution.isExists(claimedExecution.id)).toBeTruthy();
    expect((await (await claimedExecution.job).reload()).isFinished()).toBeFalsy();
  });

  it("raises FinalizationError when failing the job fails while the claim remains", async () => {
    const claimedExecution = await prepareAndClaimJob(
      await RaisingJob.performLater(RuntimeError, "A"),
    );

    vi.spyOn(ClaimedExecution.prototype, "failedWith").mockRejectedValue(
      new StatementInvalid("transient DB glitch"),
    );

    let error: Error | null = null;
    await expect(
      claimedExecution.perform().catch((e: Error) => {
        error = e;
        throw e;
      }),
    ).rejects.toThrow(ClaimedExecution.FinalizationError);

    expect(error!.message).toMatch(/transient DB glitch/);
    expect(await ClaimedExecution.isExists(claimedExecution.id)).toBeTruthy();
    expect(await (await (await claimedExecution.job).reload()).isFailed()).toBeFalsy();
  });

  it("stale performer cannot release a concurrency lock after its claim is pruned", async () => {
    const jobResult = await JobResult.createBang({ queue_name: "default", status: "" });
    const firstActiveJob = await NonOverlappingUpdateResultJob.performLater(jobResult, {
      name: "A",
    });
    await NonOverlappingUpdateResultJob.performLater(jobResult, { name: "B" });
    await NonOverlappingUpdateResultJob.performLater(jobResult, { name: "C" });

    const firstJob = await Job.findByBang({
      active_job_id: (firstActiveJob as ApplicationJob).jobId,
    });
    const claimedExecution = await claimJob(firstJob);
    await process.prune();

    expect(await (await firstJob.reload()).isFailed()).toBeTruthy();
    expect(await ReadyExecution.count()).toEqual(1);
    expect(await BlockedExecution.count()).toEqual(1);

    await claimedExecution.perform();

    expect((await firstJob.reload()).isFinished()).toBeFalsy();
    expect(await firstJob.isFailed()).toBeTruthy();
    expect(await ReadyExecution.count()).toEqual(1);
    expect(await BlockedExecution.count()).toEqual(1);
    expect((await Semaphore.findByBang({ key: firstJob.concurrency_key })).value).toEqual(0);
  });

  it("perform job that fails", async () => {
    const claimedExecution = await prepareAndClaimJob(
      await RaisingJob.performLater(RuntimeError, "A"),
    );
    const job = await claimedExecution.job;

    await assertDifference(
      new Map([
        [() => ClaimedExecution.count(), -1],
        [() => FailedExecution.count(), 1],
      ]),
      null,
      () => expect(claimedExecution.perform()).rejects.toThrow(RuntimeError),
    );

    expect((await job.reload()).isFinished()).toBeFalsy();
    expect(await job.isFailed()).toBeTruthy();
    const failedExecution = (await job.failedExecution) as FailedExecution;
    expect(failedExecution.exceptionClass()).toBe("RuntimeError");
    expect(failedExecution.message()).toBe("This is a RuntimeError exception");
    expect((failedExecution.backtrace() as string[])[0]).toMatch(/\/support\/raising-job\.ts:\d+/);

    expect((await claimedExecution.process)?.id).toEqual(process.id);
  });

  it("job failures are reported via Rails error subscriber", async () => {
    const subscriber = new ErrorBuffer();
    const executeCallbacks = rbObjSingletonClass(Callbacks) as unknown as CallbacksClassMethods;
    const reloader = class extends Reloader {};
    const reloaderHook = block((_: unknown, inner: () => unknown) => reloader.wrap(() => inner()));
    executeCallbacks.setCallback("execute", "around", { prepend: true }, reloaderHook);

    try {
      await expect(
        withErrorSubscriber(subscriber, async () => {
          const claimedExecution = await prepareAndClaimJob(
            await RaisingJob.performLater(RuntimeError, "B"),
          );

          await claimedExecution.perform();
        }),
      ).rejects.toThrow(RuntimeError);
    } finally {
      executeCallbacks.skipCallback("execute", "around", reloaderHook);
    }

    expect(subscriber.errors.length).toBe(1);
    expect(subscriber.messages()[0]).toBe("This is a RuntimeError exception");
  });

  it("release", async () => {
    const claimedExecution = await prepareAndClaimJob(await AddToBufferJob.performLater(42));
    const job = await claimedExecution.job;

    await assertDifference(
      new Map([
        [() => ClaimedExecution.count(), -1],
        [() => ReadyExecution.count(), 1],
      ]),
      null,
      () => claimedExecution.release(),
    );

    expect(await (await job.reload()).isReady()).toBeTruthy();
  });

  it("fail with error", async () => {
    const claimedExecution = await prepareAndClaimJob(await AddToBufferJob.performLater(42));
    const job = await claimedExecution.job;

    await assertDifference(
      new Map([
        [() => ClaimedExecution.count(), -1],
        [() => FailedExecution.count(), 1],
      ]),
      null,
      () => claimedExecution.failedWith(new RuntimeError()),
    );

    expect(await (await job.reload()).isFailed()).toBeTruthy();
  });

  it("fail with error when a failed execution already exists updates the existing one", async () => {
    const claimedExecution = await prepareAndClaimJob(await AddToBufferJob.performLater(42));
    const job = await claimedExecution.job;

    await FailedExecution.createBang({ job_id: job.id, exception: new RuntimeError("old error") });

    await assertDifference(
      () => FailedExecution.count(),
      0,
      null,
      () =>
        assertDifference(
          () => ClaimedExecution.count(),
          -1,
          null,
          () => claimedExecution.failedWith(new RuntimeError("new error")),
        ),
    );

    expect(((await (await job.reload()).failedExecution) as FailedExecution).message()).toEqual(
      "new error",
    );
  });

  it("perform job with missing class fails gracefully", async () => {
    const job = await createJobWithMissingClass();
    const claimedExecution = await claimJob(job);

    await assertDifference(
      new Map([
        [() => ClaimedExecution.count(), -1],
        [() => FailedExecution.count(), 1],
      ]),
      null,
      () => expect(claimedExecution.perform()).rejects.toThrow(Job.ClassMissingError),
    );

    expect(await (await job.reload()).isFailed()).toBeTruthy();
  });

  it("perform concurrency-controlled job with missing class fails gracefully", async () => {
    const job = await createJobWithMissingClass({ concurrencyKey: "test_key" });
    const claimedExecution = await claimJob(job);

    await assertDifference(
      new Map([
        [() => ClaimedExecution.count(), -1],
        [() => FailedExecution.count(), 1],
      ]),
      null,
      () => expect(claimedExecution.perform()).rejects.toThrow(Job.ClassMissingError),
    );

    expect(await (await job.reload()).isFailed()).toBeTruthy();
  });

  it("dispatch job with missing class and concurrency key skips concurrency controls", async () => {
    const job = await createJobWithMissingClass({ concurrencyKey: "test_key" });

    expect(job.jobClass()).toBeNull();

    await job.prepareForExecution();

    expect(await (await job.reload()).isReady()).toBeTruthy();
    expect(await BlockedExecution.where({ job_id: job.id }).count()).toEqual(0);
    expect(await Semaphore.where({ key: "test_key" }).count()).toEqual(0);
  });

  it("provider_job_id is available within job execution", async () => {
    const job = (await ProviderJobIdJob.performLater()) as ApplicationJob;
    const claimedExecution = await prepareAndClaimJob(job);
    await claimedExecution.perform();

    expect(JobBuffer.lastValue()).toEqual(`provider_job_id: ${job.providerJobId}`);
  });

  it("discarding claimed executions in bulk raises UndiscardableError", async () => {
    await expect(ClaimedExecution.discardAllInBatches()).rejects.toThrow(UndiscardableError);

    await expect(ClaimedExecution.discardAllFromJobs([])).rejects.toThrow(UndiscardableError);
  });
});
