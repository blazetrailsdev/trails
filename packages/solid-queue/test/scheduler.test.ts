import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Time } from "@blazetrails/date";
import { travelBack, travelTo } from "@blazetrails/activesupport/testing/time-helpers";
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

  it("recurring schedule (only static)", async () => {
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

  it("recurring schedule (only dynamic)", async () => {
    await RecurringTask.create({
      key: "dynamic_task",
      static: false,
      class_name: "AddToBufferJob",
      schedule: "every second",
      arguments: [42],
    });
    const scheduler = new Scheduler({ recurringTasks: {}, dynamicTasksEnabled: true });
    try {
      await scheduler.start();

      await waitForRegisteredProcesses(1, { timeout: 1 });

      const process = (await Process.first()) as Process;
      expect(process.kind).toBe("Scheduler");

      assertMetadata(process, { recurring_schedule: ["dynamic_task"] });
    } finally {
      await scheduler.stop();
    }
  });

  it("recurring schedule (static + dynamic)", async () => {
    await RecurringTask.create({
      key: "dynamic_task",
      static: false,
      class_name: "AddToBufferJob",
      schedule: "every second",
      arguments: [42],
    });

    const recurringTasks = {
      static_task: { class: "AddToBufferJob", schedule: "every hour", args: 42 },
    };

    const scheduler = new Scheduler({ recurringTasks: recurringTasks, dynamicTasksEnabled: true });
    try {
      await scheduler.start();

      await waitForRegisteredProcesses(1, { timeout: 1 });

      const process = (await Process.first()) as Process;
      expect(process.kind).toBe("Scheduler");

      assertMetadata(process, { recurring_schedule: ["static_task", "dynamic_task"] });
    } finally {
      await scheduler.stop();
    }
  });

  it("dynamic tasks in DB are ignored when dynamic_tasks_enabled is false", async () => {
    await RecurringTask.createBang({
      key: "ignored_task",
      static: false,
      class_name: "AddToBufferJob",
      schedule: "every second",
      arguments: [42],
    });

    const recurringTasks = {
      static_task: { class: "AddToBufferJob", schedule: "every hour", args: 42 },
    };
    const scheduler = new Scheduler({ recurringTasks: recurringTasks });
    try {
      await scheduler.start();

      await waitForRegisteredProcesses(1, { timeout: 1 });

      const process = (await Process.first()) as Process;
      assertMetadata(process, { recurring_schedule: ["static_task"] });
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

  it("dynamic task actually enqueues jobs", async () => {
    await RecurringTask.createBang({
      key: "dynamic_enqueue_task",
      static: false,
      class_name: "AddToBufferJob",
      schedule: "every second",
      arguments: [42],
    });

    const scheduler = new Scheduler({
      recurringTasks: {},
      dynamicTasksEnabled: true,
      pollingInterval: 0.1,
    });
    try {
      await scheduler.start();

      await waitForRegisteredProcesses(1, { timeout: 1 });
      await waitWhileWithTimeout(3, async () => (await Job.count()) < 1);

      expect(await Job.count()).toBeGreaterThanOrEqual(1);
      expect(await Job.count()).toBe(await RecurringExecution.count());
    } finally {
      await scheduler.stop();
    }
  });

  it("updates metadata after adding dynamic task post-start", async () => {
    const scheduler = new Scheduler({
      recurringTasks: {},
      dynamicTasksEnabled: true,
      pollingInterval: 0.1,
    });
    try {
      await scheduler.start();

      await waitForRegisteredProcesses(1, { timeout: 1 });

      const process = (await Process.first()) as Process;
      expect(process.metadata.isEmpty()).toBe(true);

      await RecurringTask.createBang({
        key: "new_dynamic_task",
        static: false,
        class_name: "AddToBufferJob",
        schedule: "every second",
        arguments: [42],
      });

      await waitWhileWithTimeout(3, async () => (await process.reload()).metadata.isEmpty());
      assertMetadata(process, { recurring_schedule: ["new_dynamic_task"] });
    } finally {
      await scheduler.stop();
    }
  });

  it("updates metadata after removing dynamic task post-start", async () => {
    const oldDynamicTask = await RecurringTask.createBang({
      key: "old_dynamic_task",
      static: false,
      class_name: "AddToBufferJob",
      schedule: "every second",
      arguments: [42],
    });

    const scheduler = new Scheduler({
      recurringTasks: {},
      dynamicTasksEnabled: true,
      pollingInterval: 0.1,
    });
    try {
      await scheduler.start();

      await waitForRegisteredProcesses(1, { timeout: 1 });

      const process = (await Process.first()) as Process;
      assertMetadata(process, { recurring_schedule: ["old_dynamic_task"] });

      await oldDynamicTask.destroy();

      await waitWhileWithTimeout(3, async () => !(await process.reload()).metadata.isEmpty());
      expect(process.metadata.isEmpty()).toBe(true);
    } finally {
      await scheduler.stop();
    }
  });

  it("does not reschedule a dynamic task updated in place", async () => {
    let recurringSchedule: InstanceType<typeof Scheduler.RecurringSchedule> | null = null;
    travelTo(Time.utc(2026, 8, 25, 10, 15));
    try {
      const task = await RecurringTask.createBang({
        key: "dynamic_task",
        static: false,
        class_name: "AddToBufferJob",
        schedule: "every hour",
        arguments: [42],
      });
      recurringSchedule = new Scheduler.RecurringSchedule({}, { dynamicTasksEnabled: true });
      await recurringSchedule.scheduleTasks();
      const scheduledTask = recurringSchedule.scheduledTasks.get(task.id);

      await task.updateBang({ schedule: "every day" });
      await recurringSchedule.rescheduleDynamicTasks();

      expect(recurringSchedule.scheduledTasks.get(task.id)).toBe(scheduledTask);
    } finally {
      travelBack();
      await recurringSchedule?.unscheduleTasks();
    }
  });
});
