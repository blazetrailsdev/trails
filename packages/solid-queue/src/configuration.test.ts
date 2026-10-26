import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./test-helpers/dummy-application.js";
import { TopLevel } from "@blazetrails/activesupport";
import { Configuration, RecurringTask, type Scheduler } from "./index.js";
import { loadAppSchema } from "./test-helpers/queue-schema.js";
import "./test-helpers/job-result.js";

const dummyRoot = `${import.meta.dirname}/test-helpers/dummy`;

function configFilePath(name: string): string {
  return `${dummyRoot}/config/${name}.yml`;
}

async function assertProcesses(
  configuration: Configuration,
  kind: string,
  count: number,
  attributes: { [attr: string]: unknown } = {},
) {
  const processes = (await configuration.configuredProcesses()).filter((p) => p.kind === kind);
  expect(processes.length).toBe(count);

  for (const [attr, expectedValue] of Object.entries(attributes)) {
    let value: unknown = processes.map((p) => p.attributes[attr]);
    if (!Array.isArray(expectedValue)) value = (value as unknown[])[0];

    if (expectedValue == null) expect(value ?? null).toBeNull();
    else expect(value).toEqual(expectedValue);
  }
}

function assertHasRecurringTask(
  scheduler: Scheduler,
  { key, ...attributes }: { key: string; [attr: string]: unknown },
) {
  expect(scheduler.recurringSchedule.configuredTasks.length).toBe(1);
  const task = scheduler.recurringSchedule.configuredTasks.find((t) => t.key === key)!;

  for (const [attr, value] of Object.entries(attributes)) {
    expect((task as unknown as Record<string, unknown>)[attr]).toEqual(value);
  }
}

describe("ConfigurationTest", () => {
  beforeAll(async () => {
    await loadAppSchema();
    const pool = RecurringTask.connectionPool();
    await pool.schemaReflection.loadAllBang(pool);
  });

  beforeEach(() => {
    vi.spyOn(TopLevel.Trails!, "root").mockReturnValue(dummyRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("default configuration to process all queues and dispatch", async () => {
    const configuration = new Configuration({ configFile: null });

    expect((await configuration.configuredProcesses()).length).toBe(3);
    await assertProcesses(configuration, "worker", 1, { queues: "*" });
    await assertProcesses(configuration, "dispatcher", 1, {
      batchSize: Configuration.DISPATCHER_DEFAULTS.batchSize,
    });
    await assertProcesses(configuration, "scheduler", 1);
  });

  it("default configuration when config given doesn't include any configuration", async () => {
    const configuration = new Configuration({
      configFile: configFilePath("invalid_configuration"),
      skipRecurring: true,
    });

    expect((await configuration.configuredProcesses()).length).toBe(2);
    await assertProcesses(configuration, "worker", 1, { queues: "*" });
    await assertProcesses(configuration, "dispatcher", 1, {
      batchSize: Configuration.DISPATCHER_DEFAULTS.batchSize,
    });
  });

  it("default configuration when config given is empty", async () => {
    const configuration = new Configuration({
      configFile: configFilePath("empty_configuration"),
      recurringScheduleFile: configFilePath("empty_configuration"),
    });

    expect((await configuration.configuredProcesses()).length).toBe(2);
    await assertProcesses(configuration, "worker", 1, { queues: "*" });
    await assertProcesses(configuration, "dispatcher", 1, {
      batchSize: Configuration.DISPATCHER_DEFAULTS.batchSize,
    });
  });

  it("read configuration from default file", async () => {
    const configuration = new Configuration();
    expect((await configuration.configuredProcesses()).length).toBeTruthy();
    await assertProcesses(configuration, "worker", 2);
    await assertProcesses(configuration, "dispatcher", 1);
  });

  it("read configuration from provided file", async () => {
    const configuration = new Configuration({
      configFile: configFilePath("alternative_configuration"),
      onlyWork: true,
    });

    expect((await configuration.configuredProcesses()).length).toBeTruthy();
    await assertProcesses(configuration, "worker", 3, {
      processes: 1,
      pollingInterval: 0.1,
      queues: ["queue_1", "queue_2", "queue_3"],
      threads: [1, 2, 3],
    });
  });

  it("provide configuration as a hash and fill defaults", async () => {
    const backgroundWorker = { queues: "background", polling_interval: 10 };
    const dispatcher = { batch_size: 100 };
    let configuration = new Configuration({
      workers: [backgroundWorker, backgroundWorker],
      dispatchers: [dispatcher],
    });

    await assertProcesses(configuration, "dispatcher", 1, {
      pollingInterval: Configuration.DISPATCHER_DEFAULTS.pollingInterval,
      batchSize: 100,
    });
    await assertProcesses(configuration, "worker", 2, {
      queues: "background",
      pollingInterval: 10,
    });

    configuration = new Configuration({
      workers: [backgroundWorker, backgroundWorker],
      skipRecurring: true,
    });

    await assertProcesses(configuration, "dispatcher", 0);
    await assertProcesses(configuration, "worker", 2);
  });

  it("mulitple workers with the same configuration", async () => {
    const backgroundWorker = { queues: "background", polling_interval: 10, processes: 3 };
    const configuration = new Configuration({ workers: [backgroundWorker] });

    await assertProcesses(configuration, "worker", 3, {
      queues: "background",
      pollingInterval: 10,
    });
  });

  it("recurring tasks configuration with one dispatcher", async () => {
    const configuration = new Configuration({ dispatchers: [{ polling_interval: 0.1 }] });

    await assertProcesses(configuration, "dispatcher", 1, { pollingInterval: 0.1 });
    await assertProcesses(configuration, "scheduler", 1);

    const scheduler = (await configuration.configuredProcesses())[1].instantiate() as Scheduler;
    assertHasRecurringTask(scheduler, {
      key: "periodic_store_result",
      class_name: "StoreResultJob",
      schedule: "every second",
    });
  });

  it("recurring tasks configuration adds a scheduler", async () => {
    const configuration = new Configuration({ dispatchers: [] });

    await assertProcesses(configuration, "scheduler", 1);

    const scheduler = (await configuration.configuredProcesses())[0].instantiate() as Scheduler;
    assertHasRecurringTask(scheduler, {
      key: "periodic_store_result",
      class_name: "StoreResultJob",
      schedule: "every second",
    });
  });

  it("no recurring tasks configuration when explicitly excluded", async () => {
    const configuration = new Configuration({
      dispatchers: [{ polling_interval: 0.1 }],
      skipRecurring: true,
    });
    await assertProcesses(configuration, "dispatcher", 1, {
      pollingInterval: 0.1,
      recurringTasks: null,
    });
  });

  it("validate configuration", async () => {
    let configuration = new Configuration({
      recurringScheduleFile: configFilePath("recurring_with_invalid"),
    });
    expect(await configuration.isValid()).toBe(false);
    expect(configuration.errors.fullMessages.length).toBe(1);
    const error = configuration.errors.fullMessages[0];

    expect(error).toContain("Invalid recurring tasks");
    expect(error).toContain(
      "periodic_invalid_class: Class name doesn't correspond to an existing class",
    );
    expect(error).toContain(
      "periodic_incorrect_schedule: Schedule is not a supported recurring schedule",
    );

    expect(await new Configuration({ skipRecurring: true }).isValid()).toBe(true);

    configuration = new Configuration({
      recurringScheduleFile: configFilePath("recurring_with_production_only"),
    });
    expect(await configuration.isValid()).toBe(true);
    await assertProcesses(configuration, "scheduler", 0);

    configuration = new Configuration({ skipRecurring: true, dispatchers: [], workers: [] });
    expect(await configuration.isValid()).toBe(false);
    expect(configuration.errors.fullMessages).toEqual(["No processes configured"]);

    configuration = new Configuration({
      workers: [{ queues: "background", threads: 50, polling_interval: 10 }],
    });
    expect(await configuration.isValid()).toBe(false);
    expect(configuration.errors.fullMessages[0]).toMatch(
      /Solid Queue is configured to use \d+ threads but the database connection pool is \d+. Increase it in `config\/database.yml`/,
    );
  });
});
