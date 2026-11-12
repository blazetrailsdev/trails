import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import {
  Job,
  Process,
  Record,
  RecurringTask,
  Scheduler,
  SolidQueueAdapter,
} from "../../lib/index.js";
import { ApplicationJob } from "../support/application-job.js";
import { JobResult } from "../support/job-result.js";
import "../support/add-to-buffer-job.js";
import { loadAppSchema } from "../support/queue-schema.js";
import {
  runSupervisor,
  sleep,
  waitForRegisteredProcesses,
} from "../support/processes-test-helper.js";
import { waitForJobsToBeEnqueued, waitForJobsToFinishFor } from "../support/jobs-test-helper.js";

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

describe.skip("RecurringTasksTest", { timeout: 15_000 }, () => {
  let run: ReturnType<typeof runSupervisor>;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(async () => {
    run = runSupervisor({ skipRecurring: false });
    await waitForRegisteredProcesses(5, { timeout: 3 });
  });

  afterEach(async () => {
    await run.terminate();
    vi.restoreAllMocks();

    await Process.destroyAll();
    await Job.destroyAll();
    await RecurringTask.deleteAll();
    await JobResult.deleteAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("enqueue and process periodic tasks", async () => {
    await waitForJobsToBeEnqueued(2, { timeout: 2.5 });
    await waitForJobsToFinishFor(2.5);

    await run.terminate();

    await Record.uncached(async () => {
      expect((await Job.count()) >= 2).toBeTruthy();
      for (const job of await Job.all().toArray()) {
        expect((await job.recurringExecution)!.task_key).toBe("periodic_store_result");
        expect(job.class_name).toBe("StoreResultJob");
      }

      expect((await JobResult.count()) >= 2).toBeTruthy();
      for (const result of await JobResult.all().toArray()) {
        expect(result.status).toBe("custom_status");
        expect(result.value).toBe("42");
      }
    });
  });

  it("persist and delete configured tasks", async () => {
    const configuredTask = {
      periodic_store_result: { class: "StoreResultJob", schedule: "every second" },
    };
    await sleep(0.5);

    await assertRecurringTasks(configuredTask);
    await run.terminate();

    const task = (await RecurringTask.findBy({ key: "periodic_store_result" }))!;
    await task.updateBang({
      class_name: "StoreResultJob",
      schedule: "every minute",
      arguments: [42],
    });

    run = runSupervisor({ skipRecurring: false });
    await waitForRegisteredProcesses(5, { timeout: 3 });

    await sleep(0.5);

    await assertRecurringTasks(configuredTask);

    const anotherTask = {
      example_task: { class: "AddToBufferJob", schedule: "every hour", args: [42] },
    };
    const scheduler1 = new Scheduler({ recurringTasks: anotherTask });
    await scheduler1.start();
    await waitForRegisteredProcesses(6, { timeout: 1 });

    await assertRecurringTasks(anotherTask);

    const updatedTask = { example_task: { class: "AddToBufferJob", schedule: "every minute" } };
    const scheduler2 = new Scheduler({ recurringTasks: updatedTask });
    await scheduler2.start();
    await waitForRegisteredProcesses(7, { timeout: 1 });

    await assertRecurringTasks(updatedTask);

    await run.terminate();
    await scheduler1.stop();
    await scheduler2.stop();
  });
});
