import type {} from "@blazetrails/vitest-matchers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import "./test-helper.js";
import { TopLevel } from "@blazetrails/activesupport";
import { Application, Rake, Task } from "@blazetrails/rake";
import { SystemExit, rbFLoad } from "@blazetrails/ruby-compat";
import { Configuration, RecurringTask } from "../lib/index.js";
import { loadAppSchema } from "./support/queue-schema.js";
import "./support/job-result.js";
import { captureIo } from "./support/configuration-test-helper.js";

const dummyRoot = `${import.meta.dirname}/support/dummy`;

describe("RakeTasksTest", () => {
  let previousRakeApplication: Application | undefined;
  let rake: Application;

  beforeAll(async () => {
    await loadAppSchema();
    const pool = RecurringTask.connectionPool();
    await pool.schemaReflection.loadAllBang(pool);
  });

  beforeEach(async () => {
    vi.spyOn(TopLevel.Trails!, "root").mockReturnValue(dummyRoot);
    previousRakeApplication = Rake.application;
    rake = new Application();
    Rake.application = rake;
    Task.defineTask("environment");
    await rbFLoad(`${import.meta.dirname}/../lib/tasks.ts`);
  });

  afterEach(() => {
    Rake.application = previousRakeApplication;
    vi.restoreAllMocks();
  });

  it("solid_queue:check exits 0 and prints OK message for a valid configuration", async () => {
    vi.spyOn(Configuration.prototype as never, "isSkipRecurringTasks").mockReturnValue(
      true as never,
    );

    const [out, err] = await captureIo(async () => {
      await expect((await rake.get("solid_queue:check")).invoke()).resolves.not.toThrow();
    });

    expect(out).toMatch("Solid Queue configuration is valid.");
    expect(err).toBeEmpty();
  });

  it("solid_queue:check exits 1 and prints errors for an invalid configuration", async () => {
    vi.spyOn(Configuration.prototype as never, "invalidTasks").mockResolvedValue([
      { key: "broken", errors: { fullMessages: ["is invalid"] } },
    ] as never);
    vi.spyOn(Configuration.prototype as never, "isSkipRecurringTasks").mockReturnValue(
      false as never,
    );

    let status: number | null = null;
    const [out, err] = await captureIo(async () => {
      try {
        await (await rake.get("solid_queue:check")).invoke();
      } catch (e) {
        if (!(e instanceof SystemExit)) throw e;
        status = e.status;
      }
    });

    expect(status).toBe(1);
    expect(out).toBeEmpty();
    expect(err).toMatch("Solid Queue configuration is invalid:");
    expect(err).toMatch("broken");
  });
});
