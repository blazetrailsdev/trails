import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import { Base as ARBase, StatementInvalid } from "@blazetrails/activerecord";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { ActiveSupport, Executor, Logger, minutes, seconds } from "@blazetrails/activesupport";
import { StringIO } from "@blazetrails/ruby-compat";
import {
  ClaimedExecution,
  Job,
  Process,
  ReadyExecution,
  Semaphore,
  SolidQueue,
  SolidQueueAdapter,
  Worker,
} from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import { RaisingJob } from "./support/raising-job.js";
import { ExpectedTestError } from "./support/expected-test-error.js";
import { ErrorBuffer } from "./support/error-buffer.js";
import { AddToBufferJob, JobBuffer } from "./support/add-to-buffer-job.js";
import { JobResult, StoreResultJob } from "./support/job-result.js";
import { loadAppSchema } from "./support/queue-schema.js";
import {
  assertMetadata,
  sleep,
  waitWhileWithTimeout,
  waitForRegisteredProcesses,
  assertNoRegisteredProcesses,
} from "./support/processes-test-helper.js";

async function waitForJobsToFinishFor(timeout = 1) {
  await waitWhileWithTimeout(timeout, () => Job.where({ finished_at: null }).isAny());
}

describe("WorkerTest", () => {
  let worker: Worker;
  let originalOnThreadError: typeof SolidQueue.onThreadError;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(() => {
    originalOnThreadError = SolidQueue.onThreadError;
    SolidQueue.onThreadError = (error) => {
      if (!(error instanceof ExpectedTestError)) originalOnThreadError?.(error);
    };
    worker = new Worker({ queues: "background", threads: 3, pollingInterval: 0.2 });
  });

  afterEach(async () => {
    await worker.stop();
    vi.restoreAllMocks();
    SolidQueue.onThreadError = originalOnThreadError;
    JobBuffer.values.length = 0;
    await Job.destroyAll();
    await Process.destroyAll();
    await Semaphore.deleteAll();
    await JobResult.deleteAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
    SolidQueue.appExecutor = null;
  });

  it("worker is registered as process in thread mode", async () => {
    await worker.start();
    await waitForRegisteredProcesses(1, { timeout: 1 });

    const process = (await Process.first()) as Process;
    expect(process.kind).toBe("Worker");
    assertMetadata(process, {
      queues: "background",
      polling_interval: 0.2,
      pool_type: "thread",
      pool_size: 3,
    });
  });

  it("errors on polling are passed to on_thread_error and re-raised", async () => {
    const errors: string[] = [];
    SolidQueue.onThreadError = (error) => {
      errors.push((error as Error).message);
    };

    const claim = vi
      .spyOn(ReadyExecution, "claim")
      .mockRejectedValue(new ExpectedTestError("everything is broken"));

    await AddToBufferJob.performLater("hey!");

    const worker = new Worker({ queues: "background", threads: 3, pollingInterval: 0.2 });
    await worker.start();
    await sleep(1);

    await expect(worker.stop()).rejects.toThrow(ExpectedTestError);

    expect(errors).toEqual(["everything is broken"]);
    expect(claim).toHaveBeenCalled();
  });

  it("errors on claimed executions are reported via Rails error subscriber regardless of on_thread_error setting", async () => {
    const originalOnThreadError = SolidQueue.onThreadError;
    SolidQueue.onThreadError = null;

    const subscriber = new ErrorBuffer();
    ActiveSupport.errorReporter.subscribe(subscriber);

    try {
      const result = vi.spyOn(ClaimedExecution, "Result").mockImplementation(() => {
        throw new ExpectedTestError("everything is broken");
      });

      await AddToBufferJob.performLater("hey!");

      await worker.start();

      await waitForJobsToFinishFor(1);
      await worker.wakeUp();

      expect(result).toHaveBeenCalled();
      expect(subscriber.errors.length).toBe(1);
      expect(subscriber.messages()[0]).toBe("everything is broken");
    } finally {
      ActiveSupport.errorReporter.unsubscribe(subscriber);
      SolidQueue.onThreadError = originalOnThreadError;
    }
  });

  it("errors on claimed executions are reported via Rails error subscriber", async () => {
    SolidQueue.appExecutor = Executor;
    const subscriber = new ErrorBuffer();
    ActiveSupport.errorReporter.subscribe(subscriber);

    try {
      await RaisingJob.performLater(ExpectedTestError, "B");

      await worker.start();

      await waitForJobsToFinishFor(1);
      await worker.wakeUp();

      expect(subscriber.errors.length).toBe(1);
      expect(subscriber.messages()[0]).toBe("This is a ExpectedTestError exception");
    } finally {
      ActiveSupport.errorReporter.unsubscribe(subscriber);
      SolidQueue.appExecutor = null;
    }
  });

  it("claim and process more enqueued jobs than the pool size allows to process at once in thread mode", async () => {
    for (let i = 0; i < 5; i++) {
      await StoreResultJob.performLater("paused", { pause: 0.1 });
    }

    for (let i = 0; i < 3; i++) {
      await StoreResultJob.performLater("immediate");
    }

    await worker.start();

    await waitForJobsToFinishFor(2);
    await worker.wakeUp();

    expect(
      await JobResult.where({
        queue_name: "background",
        status: "completed",
        value: "paused",
      }).count(),
    ).toBe(5);
    expect(
      await JobResult.where({
        queue_name: "background",
        status: "completed",
        value: "immediate",
      }).count(),
    ).toBe(3);
  });

  it("defaults thread workers to the configured thread pool size", async () => {
    const defaultWorker = new Worker({ queues: "background", pollingInterval: 0.2 });
    try {
      await defaultWorker.start();
      await waitForRegisteredProcesses(1, { timeout: 1 });

      expect(defaultWorker.pool.size).toEqual(3);
      assertMetadata((await Process.first()) as Process, { pool_type: "thread", pool_size: 3 });
    } finally {
      await defaultWorker.stop();
      await waitForRegisteredProcesses(0, { timeout: 1 });
    }
  });

  it("worker stops and releases the claim when finishing a job fails", async () => {
    SolidQueue.onThreadError = () => {};

    vi.spyOn(ClaimedExecution.prototype as never, "finished").mockRejectedValue(
      new StatementInvalid("transient DB glitch"),
    );

    await AddToBufferJob.performLater("hey!");

    await worker.start();

    await waitWhileWithTimeout(2, async () => !worker.pool.isShutdown());
    expect(worker.pool.isShutdown()).toBe(true);

    await waitForRegisteredProcesses(0, { timeout: 1 });
    await assertNoRegisteredProcesses();

    expect(await ClaimedExecution.count()).toEqual(0);
    expect(await (await ((await Job.last()) as Job).reload()).isReady()).toBe(true);
  });

  it("worker keeps running after a regular job failure", async () => {
    await RaisingJob.performLater(ExpectedTestError, "B");
    await AddToBufferJob.performLater("ok");

    await worker.start();

    await waitForJobsToFinishFor(2);
    await worker.wakeUp();

    expect(worker.pool.isShutdown()).toBe(false);
    expect(JobBuffer.values).toContain("ok");
    expect(await ClaimedExecution.count()).toEqual(0);
  });

  it("terminate when heartbeats have been failing for longer than the alive threshold", async () => {
    const oldHeartbeatInterval = SolidQueue.processHeartbeatInterval;
    const oldAliveThreshold = SolidQueue.processAliveThreshold;
    SolidQueue.processHeartbeatInterval = seconds(0.2);
    SolidQueue.processAliveThreshold = seconds(0.5);
    try {
      vi.spyOn(Process.prototype, "heartbeat").mockRejectedValue(
        new StatementInvalid("connection lost"),
      );

      await worker.start();
      await waitForRegisteredProcesses(1, { timeout: 1 });

      expect(worker.pool.isShutdown()).toBe(false);

      await waitWhileWithTimeout(3, async () => !worker.pool.isShutdown());
      expect(worker.pool.isShutdown()).toBe(true);
    } finally {
      SolidQueue.processHeartbeatInterval = oldHeartbeatInterval;
      SolidQueue.processAliveThreshold = oldAliveThreshold;
    }
  });

  async function withPolling(silence: boolean, block: () => Promise<void>) {
    const oldSilencePolling = SolidQueue.silencePolling;
    SolidQueue.silencePolling = silence;
    try {
      await block();
    } finally {
      SolidQueue.silencePolling = oldSilencePolling;
    }
  }

  async function withActiveRecordLogger(logger: Logger | null, block: () => Promise<void>) {
    const oldLogger = ARBase.logger;
    ARBase.logger = logger as typeof ARBase.logger;
    try {
      await block();
    } finally {
      ARBase.logger = oldLogger;
    }
  }

  it("polling queries are logged", async () => {
    const log = new StringIO();
    await withActiveRecordLogger(new Logger(log), () =>
      withPolling(false, async () => {
        await worker.start();
        await sleep(0.2);
      }),
    );

    expect(log.string()).toMatch(
      /SELECT .* FROM .solid_queue_ready_executions. WHERE .solid_queue_ready_executions...queue_name./,
    );
  });

  it("polling queries can be silenced", async () => {
    const log = new StringIO();
    await withActiveRecordLogger(new Logger(log), () =>
      withPolling(true, async () => {
        await worker.start();
        await sleep(0.2);
      }),
    );

    expect(log.string()).not.toMatch(
      /SELECT .* FROM .solid_queue_ready_executions. WHERE .solid_queue_ready_executions...queue_name./,
    );
  });

  it("silencing polling queries when there's no Active Record logger", async () => {
    await withActiveRecordLogger(null, () =>
      withPolling(true, async () => {
        await worker.start();
        await sleep(0.2);
      }),
    );

    await worker.stop();
    await waitForRegisteredProcesses(0, { timeout: 1 });
    await assertNoRegisteredProcesses();
  });

  it("run inline", async () => {
    const worker = new Worker({ queues: "*", threads: 3, pollingInterval: 0.2 });
    worker.mode = "inline";

    for (let i = 0; i < 5; i++) await StoreResultJob.performLater("immediate");

    await worker.start();

    expect(
      await JobResult.where({
        queue_name: "background",
        status: "completed",
        value: "immediate",
      }).count(),
    ).toBe(5);
  });

  it("terminate on heartbeat when unregistered", async () => {
    const oldHeartbeatInterval = SolidQueue.processHeartbeatInterval;
    SolidQueue.processHeartbeatInterval = seconds(1);
    try {
      await worker.start();
      await waitForRegisteredProcesses(1, { timeout: 1 });

      expect(worker.pool.isShutdown()).toBeFalsy();

      const process = (await Process.first()) as Process;
      expect(process.kind).toBe("Worker");

      await process.deregister();

      await waitWhileWithTimeout(2, async () => !worker.pool.isShutdown());
      expect(worker.pool.isShutdown()).toBeTruthy();
    } finally {
      SolidQueue.processHeartbeatInterval = oldHeartbeatInterval;
    }
  });

  it("sleeps `10.minutes` if at capacity", async () => {
    for (let i = 0; i < 3; i++) await StoreResultJob.performLater(i, { pause: 1 });

    const interruptibleSleep = vi
      .spyOn(worker, "interruptibleSleep")
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(null), 10)));
    const handleThreadError = vi.spyOn(worker, "handleThreadError");

    await worker.start();
    await sleep(1);

    expect(interruptibleSleep).toHaveBeenCalledWith(minutes(10));
    expect(interruptibleSleep).not.toHaveBeenCalledWith(worker.pollingInterval);
    expect(handleThreadError).not.toHaveBeenCalled();
  });

  it("sleeps `polling_interval` if worker not at capacity", async () => {
    for (let i = 0; i < 2; i++) await StoreResultJob.performLater(i, { pause: 1 });

    const interruptibleSleep = vi
      .spyOn(worker, "interruptibleSleep")
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(null), 10)));
    const handleThreadError = vi.spyOn(worker, "handleThreadError");

    await worker.start();
    await sleep(1);

    expect(interruptibleSleep).toHaveBeenCalledWith(worker.pollingInterval);
    expect(interruptibleSleep).not.toHaveBeenCalledWith(minutes(10));
    expect(handleThreadError).not.toHaveBeenCalled();
  });
});
