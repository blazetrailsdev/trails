import type {} from "@blazetrails/vitest-matchers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import { IsolatedExecutionState, TopLevel } from "@blazetrails/activesupport";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { gemVersion } from "@blazetrails/activerecord";
import { Pathname, env, setEnv } from "@blazetrails/ruby-compat";
import { Configuration, RecurringTask, type Scheduler } from "../lib/index.js";
import { loadAppSchema } from "./support/queue-schema.js";
import "./support/job-result.js";

const dummyRoot = `${import.meta.dirname}/support/dummy`;

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

async function withExecutionIsolation(level: "thread" | "fiber", block: () => Promise<void>) {
  const previousLevel = IsolatedExecutionState.isolationLevel;
  IsolatedExecutionState.isolationLevel = level;
  try {
    await block();
  } finally {
    if (previousLevel != null) IsolatedExecutionState.isolationLevel = previousLevel;
  }
}

async function withEnv(vars: { [key: string]: string | undefined }, block: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, env[key]]));
  for (const [key, value] of Object.entries(vars)) setEnv(key, value);
  try {
    await block();
  } finally {
    for (const [key, value] of Object.entries(previous)) setEnv(key, value);
  }
}

async function captureIo(block: () => Promise<void>): Promise<[string, string]> {
  let err = "";
  const out = await capture("stdout", async () => {
    err = await capture("stderr", block);
  });
  return [out, err];
}

function isFiberWorkersReleaseConnectionsBetweenQueries(): boolean {
  return gemVersion().compare(Configuration.FIBER_QUERY_SCOPED_CONNECTIONS_VERSION)! >= 0;
}

async function assertHasRecurringTask(
  scheduler: Scheduler,
  { key, ...attributes }: { key: string; [attr: string]: unknown },
) {
  expect((await scheduler.recurringSchedule.configuredTasks()).length).toBe(1);
  const task = (await scheduler.recurringSchedule.configuredTasks()).find((t) => t.key === key)!;

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

  it("warns if provided configuration file does not exist", async () => {
    const configuration = new Configuration({ configFile: new Pathname("/path/to/nowhere.yml") });

    expect(await configuration.isValid()).toBeTruthy();
    expect(configuration.warnings.fullMessages).toContain(
      "Warning: provided configuration file '/path/to/nowhere.yml' does not exist. Falling back to default configuration.",
    );
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

  it("fibers configure workers to execute jobs in fibers", async () => {
    await withExecutionIsolation("fiber", async () => {
      const configuration = new Configuration({
        workers: [
          { queues: "llm*", fibers: 10 },
          { queues: "*", threads: 3 },
        ],
        dispatchers: [],
        skipRecurring: true,
      });

      expect(await configuration.isValid()).toBeTruthy();
      await assertProcesses(configuration, "worker", 2, {
        fibers: [10, undefined],
        threads: [undefined, 3],
      });
    });
  });

  it("workers reject threads and fibers together", async () => {
    await withExecutionIsolation("fiber", async () => {
      const configuration = new Configuration({
        workers: [{ queues: "llm*", threads: 1, fibers: 1 }],
        dispatchers: [],
        skipRecurring: true,
      });

      expect(await configuration.isValid()).toBeFalsy();
      expect(configuration.errors.fullMessages[0]).toMatch(/either `threads` or `fibers`/);
    });
  });

  it.skipIf(isFiberWorkersReleaseConnectionsBetweenQueries())(
    "fiber worker size inflates required database pool size on Rails 7.1",
    async () => {
      await withExecutionIsolation("fiber", async () => {
        const configuration = new Configuration({
          workers: [{ queues: "llm*", fibers: 1000 }],
          dispatchers: [],
          skipRecurring: true,
        });

        expect(await configuration.isValid()).toBeTruthy();
        expect(configuration.warnings.fullMessages[0]).toMatch(
          /needs at least 1002 database connections/,
        );
      });
    },
  );

  it.skipIf(!isFiberWorkersReleaseConnectionsBetweenQueries())(
    "fiber worker size does not inflate required database pool size on Rails 7.2+",
    async () => {
      await withExecutionIsolation("fiber", async () => {
        const configuration = new Configuration({
          workers: [{ queues: "llm*", fibers: 1000 }],
          dispatchers: [],
          skipRecurring: true,
        });

        expect(await configuration.isValid()).toBeTruthy();
        expect(configuration.warnings).toBeEmpty();
      });
    },
  );

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
    await assertHasRecurringTask(scheduler, {
      key: "periodic_store_result",
      class_name: "StoreResultJob",
      schedule: "every second",
    });
  });

  it("recurring tasks configuration adds a scheduler", async () => {
    const configuration = new Configuration({ dispatchers: [] });

    await assertProcesses(configuration, "scheduler", 1);

    const scheduler = (await configuration.configuredProcesses())[0].instantiate() as Scheduler;
    await assertHasRecurringTask(scheduler, {
      key: "periodic_store_result",
      class_name: "StoreResultJob",
      schedule: "every second",
    });
  });

  it("scheduler starts with dynamic_tasks_enabled even without static tasks", async () => {
    const configuration = new Configuration({
      recurringScheduleFile: configFilePath("empty_configuration"),
      scheduler: { dynamic_tasks_enabled: true },
    });

    await assertProcesses(configuration, "scheduler", 1, { dynamicTasksEnabled: true });
  });

  it("no scheduler without static tasks or dynamic_tasks_enabled", async () => {
    const configuration = new Configuration({
      recurringScheduleFile: configFilePath("empty_configuration"),
      scheduler: { dynamic_tasks_enabled: false },
    });

    await assertProcesses(configuration, "scheduler", 0);
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

  it("only_recurring runs just the scheduler process", async () => {
    const configuration = new Configuration({ onlyRecurring: true });

    expect((await configuration.configuredProcesses()).length).toBe(1);
    await assertProcesses(configuration, "scheduler", 1);
    await assertProcesses(configuration, "worker", 0);
    await assertProcesses(configuration, "dispatcher", 0);
    expect(await configuration.isValid()).toBeTruthy();
  });

  it("only_recurring ignores workers and dispatchers from the config file", async () => {
    const configuration = new Configuration({ onlyRecurring: true });

    await assertProcesses(configuration, "worker", 0);
    await assertProcesses(configuration, "dispatcher", 0);
    await assertProcesses(configuration, "scheduler", 1);

    const scheduler = (await configuration.configuredProcesses())[0].instantiate() as Scheduler;
    await assertHasRecurringTask(scheduler, {
      key: "periodic_store_result",
      class_name: "StoreResultJob",
      schedule: "every second",
    });
  });

  it("only_recurring when SOLID_QUEUE_ONLY_RECURRING environment variable is set", async () => {
    await withEnv({ SOLID_QUEUE_ONLY_RECURRING: "true" }, async () => {
      const configuration = new Configuration();

      expect((await configuration.configuredProcesses()).length).toBe(1);
      await assertProcesses(configuration, "scheduler", 1);
      await assertProcesses(configuration, "worker", 0);
      await assertProcesses(configuration, "dispatcher", 0);
    });
  });

  it("only_recurring with skip_recurring is invalid", async () => {
    const configuration = new Configuration({ onlyRecurring: true, skipRecurring: true });

    expect(await configuration.isValid()).toBeFalsy();
    expect(configuration.errors.fullMessages).toEqual(["No processes configured"]);
  });

  it("skip recurring tasks when SOLID_QUEUE_SKIP_RECURRING environment variable is set", async () => {
    await withEnv({ SOLID_QUEUE_SKIP_RECURRING: "true" }, async () => {
      const configuration = new Configuration({ dispatchers: [{ polling_interval: 0.1 }] });
      await assertProcesses(configuration, "dispatcher", 1, { pollingInterval: 0.1 });
      await assertProcesses(configuration, "scheduler", 0);
    });
  });

  it("include recurring tasks when SOLID_QUEUE_SKIP_RECURRING environment variable is false", async () => {
    await withEnv({ SOLID_QUEUE_SKIP_RECURRING: "false" }, async () => {
      const configuration = new Configuration({ dispatchers: [{ polling_interval: 0.1 }] });
      await assertProcesses(configuration, "dispatcher", 1, { pollingInterval: 0.1 });
      await assertProcesses(configuration, "scheduler", 1);
    });
  });

  it("include recurring tasks when SOLID_QUEUE_SKIP_RECURRING environment variable is not set", async () => {
    await withEnv({ SOLID_QUEUE_SKIP_RECURRING: undefined }, async () => {
      const configuration = new Configuration({ dispatchers: [{ polling_interval: 0.1 }] });
      await assertProcesses(configuration, "dispatcher", 1, { pollingInterval: 0.1 });
      await assertProcesses(configuration, "scheduler", 1);
    });
  });

  it("validate configuration", async () => {
    let configuration = new Configuration({
      recurringScheduleFile: configFilePath("recurring_with_invalid"),
    });
    expect(await configuration.isValid()).toBeFalsy();
    expect(configuration.errors.fullMessages.length === 1).toBeTruthy();
    const error = configuration.errors.fullMessages[0]!;

    expect(error.includes("Invalid recurring tasks")).toBeTruthy();
    expect(
      error.includes("periodic_invalid_class: Class name doesn't correspond to an existing class"),
    ).toBeTruthy();
    expect(
      error.includes("periodic_incorrect_schedule: Schedule is not a supported recurring schedule"),
    ).toBeTruthy();

    configuration = new Configuration({ recurringScheduleFile: configFilePath("empty_recurring") });
    expect(await configuration.isValid()).toBeTruthy();
    expect(configuration.warnings.fullMessages.join("")).toMatch(
      /provided configuration file '[^']+' does not exist\./,
    );

    expect(await new Configuration({ skipRecurring: true }).isValid()).toBeTruthy();

    configuration = new Configuration({
      recurringScheduleFile: configFilePath("recurring_with_production_only"),
    });
    expect(await configuration.isValid()).toBeTruthy();
    await assertProcesses(configuration, "scheduler", 0);

    configuration = new Configuration({
      recurringScheduleFile: configFilePath("recurring_with_empty"),
    });
    expect(await configuration.isValid()).toBeTruthy();
    await assertProcesses(configuration, "scheduler", 0);
    expect(configuration.warnings.fullMessages.join("")).toMatch(
      /provided configuration file '[^']+' does not exist\./,
    );

    configuration = new Configuration({ skipRecurring: true, dispatchers: [], workers: [] });
    expect(await configuration.isValid()).toBeFalsy();
    expect(configuration.errors.fullMessages).toEqual(["No processes configured"]);

    configuration = new Configuration({
      skipRecurring: true,
      dispatchers: [],
      workers: [{ fibers: 3 }],
    });
    expect(await configuration.isValid()).toBeFalsy();
    expect(configuration.errors.fullMessages[0]).toMatch(
      /require fiber-scoped isolated execution state/,
    );

    configuration = new Configuration({
      workers: [{ queues: "background", threads: 50, polling_interval: 10 }],
    });
    expect(await configuration.isValid()).toBeTruthy();
  });

  it("reports an undersized database pool as a warning rather than an error", async () => {
    const configuration = new Configuration({
      workers: [{ queues: "background", threads: 50, polling_interval: 10 }],
      skipRecurring: true,
    });

    expect(await configuration.isValid()).toBeTruthy();
    expect(configuration.warnings.size).toBe(1);
    expect(configuration.warnings.fullMessages[0]).toMatch(
      /Solid Queue needs at least \d+ database connections for the configured workers but the database connection pool is \d+\. Increase it in `config\/database.yml`/,
    );
  });

  it("has no warnings when the database connection pool is large enough", async () => {
    const configuration = new Configuration({
      workers: [{ queues: "background", threads: 1, polling_interval: 10 }],
      skipRecurring: true,
    });

    expect(await configuration.isValid()).toBeTruthy();
    expect(configuration.warnings).toBeEmpty();
  });

  it("does not duplicate warnings when validated more than once", async () => {
    const configuration = new Configuration({
      workers: [{ queues: "background", threads: 50, polling_interval: 10 }],
      skipRecurring: true,
    });

    for (let i = 0; i < 3; i++) await configuration.isValid();

    expect(configuration.warnings.size).toBe(1);
  });

  it("check prints a success message and returns true for a valid configuration", async () => {
    const [out, err] = await captureIo(async () => {
      expect(await new Configuration({ skipRecurring: true }).check()).toBeTruthy();
    });

    expect(out).toMatch("Solid Queue configuration is valid.");
    expect(err).toBeEmpty();
  });

  it("check prints warnings to stderr on the valid path", async () => {
    const [out, err] = await captureIo(async () => {
      expect(
        await new Configuration({
          workers: [{ queues: "background", threads: 50, polling_interval: 10 }],
          skipRecurring: true,
        }).check(),
      ).toBeTruthy();
    });

    expect(out).toMatch("Solid Queue configuration is valid.");
    expect(err).toMatch(
      /Solid Queue needs at least \d+ database connections for the configured workers but the database connection pool is \d+/,
    );
  });

  it("check prints errors to stderr and returns false for an invalid configuration", async () => {
    const [, err] = await captureIo(async () => {
      expect(
        await new Configuration({
          recurringScheduleFile: configFilePath("recurring_with_invalid"),
        }).check(),
      ).toBeFalsy();
    });

    expect(err).toMatch("Solid Queue configuration is invalid:");
    expect(err).toMatch("periodic_invalid_class");
  });
});
