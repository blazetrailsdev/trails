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

  it("runs on the caller when its caller_runs pool was shut down before it fired", async () => {
    const executor = pool();
    let ran = false;
    ScheduledTask.execute(0.03, { executor }, () => void (ran = true));
    executor.shutdown();
    await sleep(60);
    expect(ran).toBe(true);
  });

  it("posts at once when the delay is at most 0.01", () => {
    let ran = false;
    ScheduledTask.execute(0.01, { executor: new ImmediateExecutor() }, () => void (ran = true));
    expect(ran).toBe(true);
  });

  it("re-arms a delay past setTimeout's 2^31-1 ms ceiling instead of firing", async () => {
    let ran = false;
    const scheduled = ScheduledTask.execute(
      30 * 86400,
      { executor: new ImmediateExecutor() },
      () => void (ran = true),
    );
    await sleep(20);
    expect(ran).toBe(false);
    expect(scheduled.cancel()).toBe(true);
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
  it("posts a task with its arguments and terminates once shut down and drained", async () => {
    const executor = pool();
    const performed: string[] = [];
    executor.post("a", async (name: string) => {
      await sleep(20);
      performed.push(name);
    });
    expect(await executor.waitForTermination(0.005)).toBe(false);
    executor.shutdown();
    expect(await executor.waitForTermination()).toBe(true);
    expect(performed).toEqual(["a"]);
    executor.post("b", (name: string) => void performed.push(name));
    expect(performed).toEqual(["a", "b"]);
    expect(await executor.waitForTermination()).toBe(true);
  });

  it("raises without a block", () => {
    const post = pool().post as (...args: unknown[]) => unknown;
    expect(() => post.call(pool(), 1)).toThrow(new ArgumentError("no block given"));
  });
});
