import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Base as ARBase } from "@blazetrails/activerecord";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { ActiveSupport, Executor, Logger, minutes, seconds } from "@blazetrails/activesupport";
import { RuntimeError, StringIO, registerConstant } from "@blazetrails/ruby-compat";
import {
  Job,
  Process,
  ReadyExecution,
  Semaphore,
  SolidQueue,
  SolidQueueAdapter,
  Worker,
} from "./index.js";
import { ApplicationJob } from "./test-helpers/application-job.js";
import { AddToBufferJob, JobBuffer } from "./test-helpers/add-to-buffer-job.js";
import { JobResult, StoreResultJob } from "./test-helpers/job-result.js";
import { loadAppSchema, loadQueueSchema } from "./test-helpers/queue-schema.js";

class ExpectedTestError extends RuntimeError {
  static toString(): string {
    return "ExpectedTestError";
  }
}
registerConstant("ExpectedTestError", ExpectedTestError);

class RaisingJob extends ApplicationJob {
  static toString(): string {
    return "RaisingJob";
  }

  static {
    this.queueAs("background");
  }

  perform(raising: new (message: string) => Error, _identifier: string): void {
    throw new raising(`This is a ${String(raising)} exception`);
  }
}

registerConstant("RaisingJob", RaisingJob);

class ErrorBuffer {
  errors: [Error, unknown][] = [];

  report(error: Error, options: unknown): void {
    this.errors.push([error, options]);
  }

  get messages(): string[] {
    return this.errors.map((error) => error[0].message);
  }
}

const sleep = (s: number) => new Promise((resolve) => setTimeout(resolve, s * 1000));

async function waitWhileWithTimeout(timeout: number, block: () => Promise<boolean>) {
  const end = Date.now() + timeout * 1000;
  while (Date.now() < end && (await block())) await sleep(0.05);
}

async function waitForRegisteredProcesses(count: number, { timeout = 1 } = {}) {
  await waitWhileWithTimeout(timeout, async () => (await Process.count()) !== count);
}

async function waitForJobsToFinishFor(timeout = 1) {
  await waitWhileWithTimeout(timeout, () => Job.where({ finished_at: null }).isAny());
}

describe("WorkerTest", () => {
  let worker: Worker;
  let originalOnThreadError: typeof SolidQueue.onThreadError;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadQueueSchema();
    await loadAppSchema();
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
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

  it("worker is registered as process", async () => {
    await worker.start();
    await waitForRegisteredProcesses(1, { timeout: 1 });

    const process = (await Process.first()) as Process;
    expect(process.kind).toBe("Worker");
    expect(process.metadata.get("queues")).toBe("background");
    expect(process.metadata.get("polling_interval")).toBe(0.2);
    expect(process.metadata.get("thread_pool_size")).toBe(3);
  });

  it("errors on polling are passed to on_thread_error and re-raised", async () => {
    const errors: string[] = [];
    SolidQueue.onThreadError = (error) => {
      errors.push((error as Error).message);
    };

    vi.spyOn(ReadyExecution, "claim").mockRejectedValue(
      new ExpectedTestError("everything is broken"),
    );

    await AddToBufferJob.performLater("hey!");

    const worker = new Worker({ queues: "background", threads: 3, pollingInterval: 0.2 });
    await worker.start();
    await sleep(1);

    await expect(worker.stop()).rejects.toThrow(ExpectedTestError);

    expect(errors).toEqual(["everything is broken"]);
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
      expect(subscriber.messages[0]).toBe("This is a ExpectedTestError exception");
    } finally {
      ActiveSupport.errorReporter.unsubscribe(subscriber);
      SolidQueue.appExecutor = null;
    }
  });

  it("claim and process more enqueued jobs than the pool size allows to process at once", async () => {
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
    expect(await Process.isNone()).toBe(true);
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

      expect(worker.pool.isShutdown()).toBe(false);

      const process = (await Process.first()) as Process;
      expect(process.kind).toBe("Worker");

      await process.deregister();

      await waitWhileWithTimeout(2, async () => !worker.pool.isShutdown());
      expect(worker.pool.isShutdown()).toBe(true);
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
