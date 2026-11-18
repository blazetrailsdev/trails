import type {} from "@blazetrails/vitest-matchers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import { TopLevel, camelize } from "@blazetrails/activesupport";
import { SystemExit, type Hash } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { Configuration, RecurringTask } from "../lib/index.js";
import { Cli } from "../lib/cli.js";
import { loadAppSchema } from "./support/queue-schema.js";
import "./support/job-result.js";
import { captureIo, configFilePath, withEnv } from "./support/configuration-test-helper.js";

const dummyRoot = `${import.meta.dirname}/support/dummy`;

function configurationFromCli(cliOptions: { [key: string]: unknown } = {}): Configuration {
  const cli = new Cli([], cliOptions) as unknown as { options: Hash<string, unknown> };
  const options = Object.fromEntries(
    cli.options
      .toA()
      .filter(([, value]) => value != null)
      .map(([key, value]) => [camelize(key, false), value]),
  );

  return new Configuration(options);
}

const start = (args: string[]) => (Cli as unknown as ThorClass).start(args);

async function captureCheckRun(...args: string[]): Promise<[string, string, number | null]> {
  let status: number | null = null;
  const [out, err] = await captureIo(async () => {
    try {
      await start(["check", ...args]);
    } catch (e) {
      if (!(e instanceof SystemExit)) throw e;
      status = e.status;
    }
  });
  return [out, err, status];
}

describe("CliTest", () => {
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

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "The application loader is Zeitwerk" — framework packages are ES modules, so no Zeitwerk eager load decides whether `cli.ts` loads.
  it.skip("eager loading leaves the CLI to bin/jobs", () => {});

  it("mode defaults to fork when no env var or option", async () => {
    await withEnv({ SOLID_QUEUE_SUPERVISOR_MODE: undefined }, async () => {
      const config = configurationFromCli();

      expect(config.mode().isFork()).toBeTruthy();
    });
  });

  it("mode respects SOLID_QUEUE_SUPERVISOR_MODE env var", async () => {
    await withEnv({ SOLID_QUEUE_SUPERVISOR_MODE: "async" }, async () => {
      const config = configurationFromCli();

      expect(config.mode().isAsync()).toBeTruthy();
    });
  });

  it("mode option overrides env var", async () => {
    await withEnv({ SOLID_QUEUE_SUPERVISOR_MODE: "async" }, async () => {
      const config = configurationFromCli({ mode: "fork" });

      expect(config.mode().isFork()).toBeTruthy();
    });
  });

  it("mode option works without env var", async () => {
    await withEnv({ SOLID_QUEUE_SUPERVISOR_MODE: undefined }, async () => {
      const config = configurationFromCli({ mode: "async" });

      expect(config.mode().isAsync()).toBeTruthy();
    });
  });

  it("only_recurring option runs just the scheduler", async () => {
    const config = configurationFromCli({ only_recurring: true });

    expect((await config.configuredProcesses()).length).toBe(1);
    expect((await config.configuredProcesses())[0].kind).toBe("scheduler");
  });

  it("only_recurring respects SOLID_QUEUE_ONLY_RECURRING env var", async () => {
    await withEnv({ SOLID_QUEUE_ONLY_RECURRING: "true" }, async () => {
      const config = configurationFromCli();

      expect((await config.configuredProcesses()).length).toBe(1);
      expect((await config.configuredProcesses())[0].kind).toBe("scheduler");
    });
  });

  it("check exits 0 and prints OK message for a valid configuration", async () => {
    const [out, err] = await captureIo(async () => {
      await expect(start(["check", "--skip-recurring"])).resolves.not.toThrow();
    });

    expect(out).toMatch("Solid Queue configuration is valid.");
    expect(err).toBeEmpty();
  });

  it("check exits 1 and prints invalid recurring task errors", async () => {
    const [out, err, exitStatus] = await captureCheckRun(
      "--recurring_schedule_file",
      configFilePath("recurring_with_invalid"),
    );

    expect(exitStatus).toBe(1);
    expect(err).toMatch("Solid Queue configuration is invalid");
    expect(err).toMatch("periodic_invalid_class");
    expect(err).toMatch("periodic_incorrect_schedule");
    expect(out).toBeEmpty();
  });
});
