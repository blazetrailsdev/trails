import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { TestCase } from "@blazetrails/activesupport/test-case";
import type { Time } from "@blazetrails/date";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import {
  Job,
  Process,
  RecurringExecution,
  RecurringTask,
  Scheduler,
  SolidQueueAdapter,
} from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import "./support/add-to-buffer-job.js";
import { loadAppSchema } from "./support/queue-schema.js";
import {
  sleep,
  waitWhileWithTimeout,
  waitForRegisteredProcesses,
  assertMetadata,
} from "./support/processes-test-helper.js";

class SchedulerTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "SchedulerTest", SchedulerTest);

describe("SchedulerTest", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    const pool = RecurringTask.connectionPool();
    await pool.schemaReflection.loadAllBang(pool);
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  afterEach(async () => {
    await Job.destroyAll();
    await Process.destroyAll();
    await RecurringTask.deleteAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("recurring schedule", async () => {
    const recurringTasks = new Map([
      ["example_task", { class: "AddToBufferJob", schedule: "every hour", args: 42 }],
    ]);
    const scheduler = new Scheduler({ recurringTasks: recurringTasks });
    try {
      await scheduler.start();

      await waitForRegisteredProcesses(1, { timeout: 1 });

      const process = (await Process.first()) as Process;
      expect(process.kind).toBe("Scheduler");

      assertMetadata(process, { recurring_schedule: ["example_task"] });
    } finally {
      await scheduler.stop();
    }
  });

  it("run more than one instance of the scheduler with recurring tasks", async () => {
    const recurringTasks = new Map([
      ["example_task", { class: "AddToBufferJob", schedule: "every second", args: 42 }],
    ]);
    const schedulers = Array.from(
      { length: 2 },
      () => new Scheduler({ recurringTasks: recurringTasks }),
    );

    for (const scheduler of schedulers) await scheduler.start();
    await sleep(2);
    for (const scheduler of schedulers) await scheduler.stop();
    let counts = "";
    await waitWhileWithTimeout(1, async () => {
      const previous = counts;
      counts = `${await Job.count()}/${await RecurringExecution.count()}`;
      return counts !== previous;
    });

    expect(await Job.count()).toBe(await RecurringExecution.count());
    const runAtTimes = (await RecurringExecution.all().toArray())
      .map((execution) => (execution.run_at as Time).toF())
      .sort((a, b) => a - b);
    for (let i = 0; i <= runAtTimes.length - 2; i++) {
      expect(runAtTimes[i + 1] - runAtTimes[i]).toBe(1);
    }
  });
});
