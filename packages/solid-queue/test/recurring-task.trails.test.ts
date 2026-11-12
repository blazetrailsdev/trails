import { afterEach, describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import { freezeTime, travelBack } from "@blazetrails/activesupport/testing/time-helpers";
import { RecurringJob, RecurringTask } from "../lib/index.js";
import { JobBuffer } from "./support/add-to-buffer-job.js";

describe("RecurringTask (trails)", () => {
  afterEach(() => travelBack());

  it("delayFromNow is seconds until the next cron tick", () => {
    freezeTime();
    const task = new RecurringTask();
    task.schedule = "* * * * *";
    const delay = task.delayFromNow();
    expect(typeof delay).toBe("number");
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(60);
  });

  it("RecurringJob runs its command on every perform", async () => {
    const command = `${import.meta.dirname}/support/dummy/lib/from-a-command.ts`;
    const size = JobBuffer.values.length;
    await RecurringJob.performNow(command);
    await RecurringJob.performNow(command);
    expect(JobBuffer.values.slice(size)).toEqual(["from_a_command", "from_a_command"]);
  });
});
