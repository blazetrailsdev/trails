import { afterEach, describe, expect, it, vi } from "vitest";
import "./test-helpers/dummy-application.js";
import { TopLevel } from "@blazetrails/activesupport";
import { Configuration } from "./configuration.js";
import { RecurringTask } from "./recurring-task.js";

describe("Configuration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads RecurringTask's schema before it builds a task", async () => {
    const order: string[] = [];
    const loadSchema = RecurringTask.loadSchema.bind(RecurringTask);
    vi.spyOn(RecurringTask, "loadSchema").mockImplementation(async () => {
      order.push("loadSchema");
      return await loadSchema();
    });
    const fromConfiguration = RecurringTask.fromConfiguration.bind(RecurringTask);
    vi.spyOn(RecurringTask, "fromConfiguration").mockImplementation((key, options) => {
      order.push("fromConfiguration");
      return fromConfiguration(key, options);
    });

    vi.spyOn(TopLevel.Trails!, "root").mockReturnValue(`${import.meta.dirname}/test-helpers/dummy`);
    const configuration = new Configuration({ dispatchers: [] });
    const processes = await configuration.configuredProcesses();

    expect(processes.map((process) => process.kind)).toContain("scheduler");
    expect(order.slice(0, 2)).toEqual(["loadSchema", "fromConfiguration"]);
  });
});
