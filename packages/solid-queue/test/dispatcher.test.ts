import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
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
} from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import { AddToBufferJob } from "./support/add-to-buffer-job.js";
import { loadAppSchema } from "./support/queue-schema.js";
import {
  sleep,
  waitWhileWithTimeout,
  waitForRegisteredProcesses,
  assertMetadata,
  assertNoRegisteredProcesses,
} from "./support/processes-test-helper.js";
import { TestCase } from "@blazetrails/activesupport/test-case";
import {
  assertDeprecated,
  assertNotDeprecated,
} from "@blazetrails/activesupport/testing/deprecation";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";

function assertCalledAtLeast(
  spy: { mock: { calls: unknown[][] } },
  times: number,
  matcher: (...args: unknown[]) => boolean,
) {
  const calls = spy.mock.calls.filter((args) => matcher(...args)).length;
  expect(calls, `expected at least ${times} matching calls, got ${calls}`).toBeGreaterThanOrEqual(
    times,
  );
}

class DispatcherTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "DispatcherTest", DispatcherTest);

describe("DispatcherTest", () => {
  let dispatcher: Dispatcher;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
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
      assertMetadata(process, { polling_interval: 0.1, batch_size: 10, batch_maintenance: true });
      expect(process.metadata.get("concurrency_maintenance_interval")).toBeUndefined();
    } finally {
      await noConcurrencyMaintenanceDispatcher.stop();
    }
  });

  it("batch maintenance is optional", async () => {
    const noBatchMaintenanceDispatcher = new Dispatcher({
      pollingInterval: 0.1,
      batchSize: 10,
      batchMaintenance: false,
    });
    try {
      await noBatchMaintenanceDispatcher.start();

      await waitForRegisteredProcesses(1, { timeout: 1 });

      const process = (await Process.first()) as Process;
      expect(process.kind).toBe("Dispatcher");
      assertMetadata(process, { concurrency_maintenance_interval: 600, batch_maintenance: false });
    } finally {
      await noBatchMaintenanceDispatcher.stop();
    }
  });

  it("batch maintenance is skipped with a deprecation warning until the batches schema is migrated", async () => {
    vi.spyOn(SolidQueue.Batch!, "isMigrated").mockResolvedValue(false);
    const sweepStalled = vi.spyOn(SolidQueue.Batch!, "sweepStalled");

    const maintenance = new Dispatcher.Maintenance(600, 10, { concurrency: false, batches: true });

    await assertDeprecated(/pending database migrations/, SolidQueue.deprecator(), async () => {
      await maintenance["sweepStalledBatches"]();
    });

    await assertNotDeprecated(SolidQueue.deprecator(), async () => {
      await maintenance["sweepStalledBatches"]();
    });
    expect(sweepStalled).not.toHaveBeenCalled();
  });

  it("ConcurrencyMaintenance remains constructible with its original signature", () => {
    const maintenance = new Dispatcher.ConcurrencyMaintenance(600, 100);

    expect(maintenance.interval).toBe(600);
    expect(maintenance.batchSize).toBe(100);
    expect(maintenance.isConcurrency()).toBeTruthy();
    expect(maintenance.isBatches()).toBeFalsy();
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
        await sleep(0.5);
      }),
    );

    expect(log.string()).not.toMatch(/SELECT .* FROM .solid_queue_scheduled_executions. WHERE/);
  });

  it("silencing polling queries when there's no Active Record logger", async () => {
    await withActiveRecordLogger(null, () =>
      withPolling(true, async () => {
        await dispatcher.start();
        await sleep(0.5);
      }),
    );

    await dispatcher.stop();
    await waitForRegisteredProcesses(0, { timeout: 1 });
    await assertNoRegisteredProcesses();
  });

  it("run more than one instance of the dispatcher", async () => {
    let anotherDispatcher: Dispatcher | undefined;
    try {
      for (let i = 0; i < 15; i++) {
        await AddToBufferJob.set({ wait: seconds(0.5) }).performLater("I'm scheduled");
      }
      await sleep(0.5);
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
      await AddToBufferJob.set({ wait: seconds(0.5) }).performLater("I'm scheduled");
    }
    await sleep(0.5);
    expect(await ScheduledExecution.count()).toBe(3);

    try {
      await dispatcher.start();
      await waitWhileWithTimeout(5, () => ScheduledExecution.isAny());

      expect(await ScheduledExecution.count()).toBe(0);
      expect(await ReadyExecution.count()).toBe(3);
      await sleep(0.1);

      assertCalledAtLeast(interruptibleSleep, 3, (delay) => Number(delay) === 0);
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
