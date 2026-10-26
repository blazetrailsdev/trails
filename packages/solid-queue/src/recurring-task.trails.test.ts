import { describe, expect, it } from "vitest";
import "./test-helpers/dummy-application.js";
import { RecurringJob, RecurringTask } from "./index.js";
import { JobBuffer } from "./test-helpers/add-to-buffer-job.js";

describe("RecurringTask (trails)", () => {
  it("delayFromNow is seconds until the next cron tick", () => {
    const task = new RecurringTask();
    task.schedule = "* * * * *";
    const delay = task.delayFromNow();
    expect(typeof delay).toBe("number");
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(60);
  });

  it("RecurringJob runs its command on every perform", async () => {
    const command = `${import.meta.dirname}/test-helpers/dummy/lib/from-a-command.ts`;
    const size = JobBuffer.values.length;
    await RecurringJob.performNow(command);
    await RecurringJob.performNow(command);
    expect(JobBuffer.values.slice(size)).toEqual(["from_a_command", "from_a_command"]);
  });
});
