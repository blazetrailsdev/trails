import { rbFSleep as sleep } from "@blazetrails/ruby-compat";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import {
  Job,
  Record,
  RecurringTask,
  Scheduler,
  SolidQueue,
  SolidQueueAdapter,
} from "../../lib/index.js";
import { ApplicationJob } from "../support/application-job.js";
import { JobResult } from "../support/job-result.js";
import "../support/add-to-buffer-job.js";
import { loadAppSchema } from "../support/queue-schema.js";
import {
  isProcessExists,
  runSupervisorAsFork,
  terminateProcess,
  waitFor,
  waitForRegisteredProcesses,
  waitWhileWithTimeout,
} from "../support/processes-test-helper.js";
import { waitForJobsToBeEnqueued } from "../support/jobs-test-helper.js";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import "../test-helper.js";

type TaskAttrs = { class?: string; schedule?: string; args?: unknown[] };

async function assertRecurringTasks(expectedTasks: { [key: string]: TaskAttrs }) {
  await Record.uncached(async () => {
    expect(await RecurringTask.count()).toBe(Object.keys(expectedTasks).length);

    for (const [key, attrs] of Object.entries(expectedTasks)) {
      const task = await RecurringTask.findBy({ key });
      expect(task).toBeTruthy();

      if (attrs.schedule) expect(task!.schedule).toBe(attrs.schedule);
      if (attrs.class) expect(task!.class_name).toBe(attrs.class);
      if (attrs.args) expect(task!.arguments).toEqual(attrs.args);
    }
  });
}

async function runRecurringSupervisor(): Promise<number> {
  const pid = runSupervisorAsFork({ skipRecurring: false });
  await waitForRegisteredProcesses(5, { timeout: 3 });
  await sleep(1);
  return pid;
}

async function terminateGracefully(pid: number | null): Promise<void> {
  if (pid == null || !isProcessExists(pid)) return;

  await terminateProcess(pid);
  await waitForRegisteredProcesses(0, { timeout: SolidQueue.shutdownTimeout.toF() });
}

class RecurringTasksTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "RecurringTasksTest", RecurringTasksTest);

// BLOCKED: recurring-task-arguments-load-skips-deserialize
describe.skip("RecurringTasksTest", { timeout: 15_000 }, () => {
  let pid: number | null;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(async () => {
    pid = await runRecurringSupervisor();
  });

  afterEach(async () => {
    await terminateGracefully(pid);
    vi.restoreAllMocks();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("enqueue and process periodic tasks", async () => {
    await waitForJobsToBeEnqueued(2, { timeout: 5 });
    await waitWhileWithTimeout(
      5,
      async () => (await JobResult.where({ status: "custom_status", value: "42" }).count()) < 2,
    );

    await Record.uncached(async () => {
      expect((await Job.count()) >= 2).toBeTruthy();
      for (const job of await Job.all().toArray()) {
        expect((await job.recurringExecution)!.task_key).toBe("periodic_store_result");
        expect(job.class_name).toBe("StoreResultJob");
      }
    });

    const results = await Record.uncached(() =>
      JobResult.where({ status: "custom_status", value: "42" }).toArray(),
    );
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("persist and delete configured tasks", async () => {
    const configuredTask = {
      periodic_store_result: { class: "StoreResultJob", schedule: "every second" },
    };
    await assertRecurringTasks(configuredTask);
    const task = (await RecurringTask.findBy({ key: "periodic_store_result" }))!;
    await task.updateBang({
      class_name: "StoreResultJob",
      schedule: "every minute",
      arguments: [42],
    });

    await terminateGracefully(pid);

    pid = await runRecurringSupervisor();

    await assertRecurringTasks(configuredTask);

    const anotherTask = {
      example_task: { class: "AddToBufferJob", schedule: "every hour", args: [42] },
    };
    const scheduler1 = new Scheduler({ recurringTasks: anotherTask });
    await scheduler1.start();
    await waitForRegisteredProcesses(6, { timeout: 2 });
    await waitFor(
      undefined,
      async () => (await RecurringTask.findBy({ key: "example_task" })) != null,
    );

    await assertRecurringTasks(anotherTask);

    const updatedTask = { example_task: { class: "AddToBufferJob", schedule: "every minute" } };
    const scheduler2 = new Scheduler({ recurringTasks: updatedTask });
    await scheduler2.start();
    await waitForRegisteredProcesses(7, { timeout: 2 });
    await waitFor(
      undefined,
      async () =>
        (await RecurringTask.findBy({ key: "example_task" }))?.schedule === "every minute",
    );

    await assertRecurringTasks(updatedTask);

    await scheduler1.stop();
    await scheduler2.stop();
  });
});
