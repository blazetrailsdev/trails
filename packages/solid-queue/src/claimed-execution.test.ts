import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "./test-helpers/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { Callbacks } from "@blazetrails/activejob/callbacks";
import {
  ActiveSupport,
  Executor,
  assertDifference,
  type ClassMethods as CallbacksClassMethods,
} from "@blazetrails/activesupport";
import { RuntimeError, block, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import {
  ClaimedExecution,
  FailedExecution,
  Job,
  Process,
  ReadyExecution,
  SolidQueueAdapter,
} from "./index.js";
import { ApplicationJob } from "./test-helpers/application-job.js";
import { AddToBufferJob, JobBuffer } from "./test-helpers/add-to-buffer-job.js";
import { ErrorBuffer } from "./test-helpers/error-buffer.js";
import { RaisingJob } from "./test-helpers/raising-job.js";
import { loadAppSchema } from "./test-helpers/queue-schema.js";

describe("SolidQueue::ClaimedExecutionTest", () => {
  let process: Process;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
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
    JobBuffer.clear();
    await Job.destroyAll();
    await Process.destroyAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  async function prepareAndClaimJob(
    activeJob: { jobId: string },
    { process: claimingProcess = process }: { process?: Process } = {},
  ): Promise<ClaimedExecution> {
    const job = (await Job.findBy({ active_job_id: activeJob.jobId })) as Job;

    await job.prepareForExecution();
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
    expect((failedExecution.backtrace() as string[])[0]).toMatch(
      /\/test-helpers\/raising-job\.ts:\d+/,
    );

    expect((await claimedExecution.process)?.id).toEqual(process.id);
  });

  it("job failures are reported via Rails error subscriber", async () => {
    const subscriber = new ErrorBuffer();
    const executeCallbacks = rbObjSingletonClass(Callbacks) as unknown as CallbacksClassMethods;
    const reloaderHook = block((_: unknown, inner: () => unknown) => Executor.wrap(() => inner()));
    executeCallbacks.setCallback("execute", "around", { prepend: true }, reloaderHook);

    await expect(
      withErrorSubscriber(subscriber, async () => {
        const claimedExecution = await prepareAndClaimJob(
          await RaisingJob.performLater(RuntimeError, "B"),
        );

        await claimedExecution.perform();
      }),
    ).rejects.toThrow(RuntimeError);
    executeCallbacks.skipCallback("execute", "around", reloaderHook);

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
});
