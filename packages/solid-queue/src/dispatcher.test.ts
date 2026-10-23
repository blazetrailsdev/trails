import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Base as ARBase } from "@blazetrails/activerecord";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { Logger, seconds } from "@blazetrails/activesupport";
import { StringIO } from "@blazetrails/ruby-compat";
import {
  Dispatcher,
  Job,
  Process,
  ReadyExecution,
  ScheduledExecution,
  SolidQueue,
  SolidQueueAdapter,
} from "./index.js";
import { ApplicationJob } from "./test-helpers/application-job.js";
import { AddToBufferJob } from "./test-helpers/add-to-buffer-job.js";
import { loadAppSchema, loadQueueSchema } from "./test-helpers/queue-schema.js";

const sleep = (s: number) => new Promise((resolve) => setTimeout(resolve, s * 1000));

async function waitWhileWithTimeout(timeout: number, block: () => Promise<boolean>) {
  const end = Date.now() + timeout * 1000;
  while (Date.now() < end && (await block())) await sleep(0.05);
}

async function waitForRegisteredProcesses(count: number, { timeout = 1 } = {}) {
  await waitWhileWithTimeout(timeout, async () => (await Process.count()) !== count);
}

function assertMetadata(process: Process, metadata: Record<string, unknown>) {
  for (const [attr, value] of Object.entries(metadata)) {
    expect(process.metadata.get(attr)).toBe(value);
  }
}

describe("DispatcherTest", () => {
  let dispatcher: Dispatcher;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadQueueSchema();
    await loadAppSchema();
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(() => {
    dispatcher = new Dispatcher({ pollingInterval: 0.1, batchSize: 10 });
  });

  afterEach(async () => {
    await dispatcher.stop();
    vi.restoreAllMocks();
    await Job.destroyAll();
    await Process.destroyAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("dispatcher is registered as process", async () => {
    await dispatcher.start();
    await waitForRegisteredProcesses(1, { timeout: 1 });

    const process = (await Process.first()) as Process;
    expect(process.kind).toBe("Dispatcher");
    assertMetadata(process, {
      polling_interval: 0.1,
      batch_size: 10,
      concurrency_maintenance_interval: 600,
    });
  });

  it("concurrency maintenance is optional", async () => {
    const noConcurrencyMaintenanceDispatcher = new Dispatcher({
      pollingInterval: 0.1,
      batchSize: 10,
      concurrencyMaintenance: false,
    });
    try {
      await noConcurrencyMaintenanceDispatcher.start();

      await waitForRegisteredProcesses(1, { timeout: 1 });

      const process = (await Process.first()) as Process;
      expect(process.kind).toBe("Dispatcher");
      assertMetadata(process, { polling_interval: 0.1, batch_size: 10 });
    } finally {
      await noConcurrencyMaintenanceDispatcher.stop();
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
        await dispatcher.start();
        await sleep(0.2);
      }),
    );

    expect(log.string()).toMatch(/SELECT .* FROM .solid_queue_scheduled_executions. WHERE/);
  });

  it("polling queries can be silenced", async () => {
    const log = new StringIO();
    await withActiveRecordLogger(new Logger(log), () =>
      withPolling(true, async () => {
        await dispatcher.start();
        await sleep(0.2);
      }),
    );

    expect(log.string()).not.toMatch(/SELECT .* FROM .solid_queue_scheduled_executions. WHERE/);
  });

  it("silencing polling queries when there's no Active Record logger", async () => {
    await withActiveRecordLogger(null, () =>
      withPolling(true, async () => {
        await dispatcher.start();
        await sleep(0.2);
      }),
    );

    await dispatcher.stop();
    await waitForRegisteredProcesses(0, { timeout: 1 });
    expect(await Process.isNone()).toBe(true);
  });

  it("run more than one instance of the dispatcher", async () => {
    let anotherDispatcher: Dispatcher | undefined;
    try {
      for (let i = 0; i < 15; i++) {
        await AddToBufferJob.set({ wait: seconds(0.2) }).performLater("I'm scheduled");
      }
      expect(await ScheduledExecution.count()).toBe(15);

      anotherDispatcher = new Dispatcher({ pollingInterval: 0.1, batchSize: 10 });

      await dispatcher.start();
      await anotherDispatcher.start();

      await waitWhileWithTimeout(1, () => ScheduledExecution.isAny());

      expect(await ScheduledExecution.count()).toBe(0);
      expect(await ReadyExecution.count()).toBe(15);
    } finally {
      await anotherDispatcher?.stop();
    }
  });

  it("sleeps `0.seconds` between polls if there are ready to dispatch jobs", async () => {
    const dispatcher = new Dispatcher({ pollingInterval: 10, batchSize: 1 });
    const interruptibleSleep = vi
      .spyOn(dispatcher, "interruptibleSleep")
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(null), 10)));
    const handleThreadError = vi.spyOn(dispatcher, "handleThreadError");

    for (let i = 0; i < 3; i++) {
      await AddToBufferJob.set({ wait: seconds(0.1) }).performLater("I'm scheduled");
    }
    expect(await ScheduledExecution.count()).toBe(3);
    await sleep(0.1);

    try {
      await dispatcher.start();
      await waitWhileWithTimeout(1, () => ScheduledExecution.isAny());

      expect(await ScheduledExecution.count()).toBe(0);
      expect(await ReadyExecution.count()).toBe(3);
      await sleep(0.1);

      expect(
        interruptibleSleep.mock.calls.filter(([delay]) => Number(delay) === 0).length,
      ).toBeGreaterThanOrEqual(3);
      expect(interruptibleSleep).toHaveBeenCalledWith(dispatcher.pollingInterval);
      expect(handleThreadError).not.toHaveBeenCalled();
    } finally {
      await dispatcher.stop();
    }
  });

  it("sleeps `polling_interval` between polls if there are no un-dispatched jobs", async () => {
    const dispatcher = new Dispatcher({ pollingInterval: 10, batchSize: 1 });
    const interruptibleSleep = vi
      .spyOn(dispatcher, "interruptibleSleep")
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(null), 10)));
    const handleThreadError = vi.spyOn(dispatcher, "handleThreadError");

    try {
      await dispatcher.start();
      await waitWhileWithTimeout(1, async () => !(await ScheduledExecution.isExists()));

      expect(interruptibleSleep).not.toHaveBeenCalledWith(seconds(0));
      expect(interruptibleSleep).toHaveBeenCalledWith(dispatcher.pollingInterval);
      expect(handleThreadError).not.toHaveBeenCalled();
    } finally {
      await dispatcher.stop();
    }
  });
});
