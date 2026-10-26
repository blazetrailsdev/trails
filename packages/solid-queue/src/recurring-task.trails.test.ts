import { describe, expect, it } from "vitest";
import "./test-helpers/dummy-application.js";
import { RecurringTask } from "./index.js";

describe("RecurringTask (trails)", () => {
  it("delayFromNow is seconds until the next cron tick", () => {
    const task = new RecurringTask();
    task.schedule = "* * * * *";
    const delay = task.delayFromNow();
    expect(typeof delay).toBe("number");
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(60);
  });
});
