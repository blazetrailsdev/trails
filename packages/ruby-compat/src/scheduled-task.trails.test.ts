import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { ImmediateExecutor } from "./immediate-executor.js";
import { ScheduledTask } from "./scheduled-task.js";
import { ThreadPoolExecutor } from "./thread-pool-executor.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pool = () =>
  new ThreadPoolExecutor({
    minThreads: 0,
    maxThreads: 2,
    maxQueue: 0,
    fallbackPolicy: "caller_runs",
  });

describe("ScheduledTask", () => {
  it("posts the task with its args to the executor after the delay", async () => {
    const performed: string[] = [];
    ScheduledTask.execute(
      0.05,
      { args: ["job"], executor: new ImmediateExecutor() },
      (job: string) => {
        performed.push(job);
      },
    );
    await sleep(20);
    expect(performed).toEqual([]);
    await sleep(60);
    expect(performed).toEqual(["job"]);
  });

  it("never runs once the executor it was scheduled on is shut down", async () => {
    const executor = pool();
    let ran = false;
    const scheduled = ScheduledTask.execute(0.05, { executor }, () => {
      ran = true;
    });
    expect(executor.scheduledTasks.size).toBe(1);
    executor.shutdown();
    expect(executor.scheduledTasks.size).toBe(0);
    await sleep(80);
    expect(ran).toBe(false);
    expect(scheduled.cancel()).toBe(false);
  });

  it("cancels a pending task, and not one that has run", async () => {
    let ran = 0;
    const executor = new ImmediateExecutor();
    const cancelled = ScheduledTask.execute(0.02, { executor }, () => void (ran += 1));
    expect(cancelled.cancel()).toBe(true);
    const run = ScheduledTask.execute(0.01, { executor }, () => void (ran += 1));
    await sleep(40);
    expect(ran).toBe(1);
    expect(run.cancel()).toBe(false);
  });

  it("raises on a negative delay", () => {
    expect(() => new ScheduledTask(-1, { executor: new ImmediateExecutor() }, () => {})).toThrow(
      new ArgumentError("seconds must be greater than zero"),
    );
  });
});

describe("ThreadPoolExecutor", () => {
  it("posts a task with its arguments and waits for termination", async () => {
    const executor = pool();
    const performed: string[] = [];
    executor.post("a", async (name: string) => {
      await sleep(10);
      performed.push(name);
    });
    executor.shutdown();
    expect(await executor.waitForTermination()).toBe(true);
    expect(performed).toEqual(["a"]);
    expect(await executor.waitForTermination()).toBe(true);
  });
});
