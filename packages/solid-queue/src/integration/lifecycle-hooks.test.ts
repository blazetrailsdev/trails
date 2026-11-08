import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../test-helpers/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { Hash, RuntimeError, tally } from "@blazetrails/ruby-compat";
import {
  Dispatcher,
  Job,
  Process,
  Record,
  Scheduler,
  SolidQueue,
  SolidQueueAdapter,
  Supervisor,
  Worker,
} from "../index.js";
import { ApplicationJob } from "../test-helpers/application-job.js";
import { JobResult } from "../test-helpers/job-result.js";
import { loadAppSchema } from "../test-helpers/queue-schema.js";
import {
  runSupervisor,
  waitForRegisteredProcesses,
} from "../test-helpers/processes-test-helper.js";

describe("LifecycleHooksTest", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Job.destroyAll();
    await Process.destroyAll();
    await JobResult.deleteAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it.skip("run lifecycle hooks", async () => {
    try {
      SolidQueue.onStart(() => JobResult.createBang({ status: "hook_called", value: "start" }));
      SolidQueue.onStop(() => JobResult.createBang({ status: "hook_called", value: "stop" }));

      SolidQueue.onWorkerStart(() =>
        JobResult.createBang({ status: "hook_called", value: "worker_start" }),
      );
      SolidQueue.onWorkerStop(() =>
        JobResult.createBang({ status: "hook_called", value: "worker_stop" }),
      );

      SolidQueue.onDispatcherStart(() =>
        JobResult.createBang({ status: "hook_called", value: "dispatcher_start" }),
      );
      SolidQueue.onDispatcherStop(() =>
        JobResult.createBang({ status: "hook_called", value: "dispatcher_stop" }),
      );

      SolidQueue.onSchedulerStart(() =>
        JobResult.createBang({ status: "hook_called", value: "scheduler_start" }),
      );
      SolidQueue.onSchedulerStop(() =>
        JobResult.createBang({ status: "hook_called", value: "scheduler_stop" }),
      );

      const run = runSupervisor({
        workers: [{ queues: "*" }],
        dispatchers: [{ batchSize: 100 }],
        skipRecurring: false,
      });
      await waitForRegisteredProcesses(4);

      await run.terminate();
      await waitForRegisteredProcesses(0);

      const results = await Record.uncached(async () => {
        expect(await JobResult.count()).toBe(8);
        return await JobResult.last(8);
      });

      expect(
        Object.fromEntries(tally(results.map((r) => r.status)) as Hash<unknown, number>),
      ).toEqual({ hook_called: 8 });
      expect(results.map((r) => r.value).sort()).toEqual(
        [
          "start",
          "stop",
          "worker_start",
          "worker_stop",
          "dispatcher_start",
          "dispatcher_stop",
          "scheduler_start",
          "scheduler_stop",
        ].sort(),
      );
    } finally {
      Supervisor.clearHooks();
      Worker.clearHooks();
      Dispatcher.clearHooks();
      Scheduler.clearHooks();
    }
  });

  it("handle errors on lifecycle hooks", async () => {
    const previousOnThreadError = SolidQueue.onThreadError;
    try {
      SolidQueue.onThreadError = (error) =>
        JobResult.createBang({ status: "error", value: (error as Error).message });
      SolidQueue.onStart(() => {
        throw new RuntimeError("everything is broken");
      });

      const run = runSupervisor();
      await waitForRegisteredProcesses(4);

      await run.terminate();
      await waitForRegisteredProcesses(0);

      const result = (await Record.uncached(() => JobResult.last()))!;

      expect(result.status).toBe("error");
      expect(result.value).toBe("everything is broken");
    } finally {
      SolidQueue.onThreadError = previousOnThreadError;
      Supervisor.clearHooks();
      Worker.clearHooks();
      Dispatcher.clearHooks();
      Scheduler.clearHooks();
    }
  });
});
