import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import {
  ClaimedExecution,
  Process,
  ReadyExecution,
  Record,
  SolidQueue,
  SolidQueueAdapter,
  Supervisor,
  Worker,
} from "../../lib/index.js";
import { ApplicationJob } from "../support/application-job.js";
import { JobResult, StoreResultJob } from "../support/job-result.js";
import { loadAppSchema } from "../support/queue-schema.js";
import {
  runSupervisor,
  signalProcess,
  waitForProcessTerminationWithTimeout,
  waitWhileWithTimeout,
} from "../support/processes-test-helper.js";
import { destroyRecords } from "../test-helper.js";

class SupervisorBootSignalTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "SupervisorBootSignalTest", SupervisorBootSignalTest);

async function resetHooks(
  process: typeof Supervisor | typeof Worker,
  block: () => Promise<void>,
): Promise<void> {
  const exitHooks = process.lifecycleHooks.exit;
  const startHooks = process.lifecycleHooks.start;
  const stopHooks = process.lifecycleHooks.stop;
  process.lifecycleHooks.exit = [];
  process.lifecycleHooks.start = [];
  process.lifecycleHooks.stop = [];
  try {
    await block();
  } finally {
    process.lifecycleHooks.exit = exitHooks;
    process.lifecycleHooks.start = startHooks;
    process.lifecycleHooks.stop = stopHooks;
  }
}

async function resettingHooks(block: () => Promise<void>): Promise<void> {
  await resetHooks(Supervisor, () => resetHooks(Worker, block));
}

describe("SupervisorBootSignalTest", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await destroyRecords();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("TERM during supervisor start hooks exits without starting workers", async () => {
    await resettingHooks(async () => {
      let marker = false;
      let release = false;

      SolidQueue.onStart(async () => {
        marker = true;
        await waitWhileWithTimeout(5, async () => !release);
      });

      SolidQueue.onWorkerStart(() =>
        JobResult.createBang({
          queue_name: "background",
          status: "hook_called",
          value: "worker_started",
        }),
      );

      for (let i = 0; i < 3; i++) {
        await (
          StoreResultJob.set({ queue: "background" }) as unknown as typeof StoreResultJob
        ).performLater(`should_not_run_${i}`);
      }

      const pid = runSupervisor({
        workers: [{ queues: "background", threads: 1, pollingInterval: 0.1 }],
        dispatchers: [],
      });

      await waitWhileWithTimeout(5, async () => !marker);
      await signalProcess(pid, "TERM");
      release = true;

      await waitForProcessTerminationWithTimeout(pid, {
        timeout: SolidQueue.shutdownTimeout.toF() + 5,
      });

      await Record.uncached(async () => {
        expect(await JobResult.where({ value: "worker_started" }).count()).toBe(0);
        expect(await JobResult.where({ status: "completed" }).count()).toBe(0);
        expect(await ClaimedExecution.count()).toBe(0);
        expect(await ReadyExecution.count()).toBe(3);
        expect(await Process.isNone()).toBeTruthy();
      });
    });
  });
});
