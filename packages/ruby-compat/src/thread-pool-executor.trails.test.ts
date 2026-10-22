import { describe, expect, it } from "vitest";
import { Thread } from "./thread.js";
import { Concurrent } from "./concurrent/map.js";
import {
  globalIoExecutor,
  RejectedExecutionError,
  ThreadPoolExecutor,
} from "./thread-pool-executor.js";

describe("ThreadPoolExecutor", () => {
  it("runs at most maxThreads tasks, queues up to maxQueue, then runs on the caller", async () => {
    const executor = new ThreadPoolExecutor({
      minThreads: 0,
      maxThreads: 2,
      maxQueue: 1,
      fallbackPolicy: "caller_runs",
    });
    let running = 0;
    let peak = 0;
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const task = (name: string) => async () => {
      running += 1;
      peak = Math.max(peak, running);
      order.push(name);
      await gate;
      running -= 1;
    };

    executor.post(task("a"));
    executor.post(task("b"));
    executor.post(task("c"));
    executor.post(task("d"));
    expect(order).toEqual(["d"]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(["d", "a", "b"]);
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(order).toEqual(["d", "a", "b", "c"]);
    expect(peak).toBe(3);
  });

  it("keeps an idle worker for idletime and hands it the next task", async () => {
    const executor = new ThreadPoolExecutor({
      minThreads: 0,
      maxThreads: 2,
      maxQueue: 0,
      fallbackPolicy: "caller_runs",
      idletime: 1,
    });
    const threads: Thread[] = [];
    const task = () => void threads.push(Thread.current());

    executor.post(task);
    await new Promise((resolve) => setTimeout(resolve, 5));
    executor.post(task);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(threads[1]).toBe(threads[0]);

    executor.shutdown();
    expect(await executor.waitForTermination(1)).toBe(true);
  });

  it("truncates idletime to whole seconds and retires an idle worker after it", async () => {
    const executor = new ThreadPoolExecutor({
      minThreads: 0,
      maxThreads: 2,
      maxQueue: 0,
      fallbackPolicy: "caller_runs",
      idletime: 0.9,
    });
    expect(executor.idletime).toBe(0);
    const threads: Thread[] = [];
    const task = () => void threads.push(Thread.current());

    executor.post(task);
    await new Promise((resolve) => setTimeout(resolve, 20));
    executor.post(task);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(threads[1]).not.toBe(threads[0]);

    executor.shutdown();
    expect(await executor.waitForTermination(1)).toBe(true);
  });

  it("keeps minThreads idle workers past idletime", async () => {
    const executor = new ThreadPoolExecutor({
      minThreads: 1,
      maxThreads: 2,
      maxQueue: 0,
      fallbackPolicy: "caller_runs",
      idletime: 0,
    });
    const threads: Thread[] = [];
    const task = () => void threads.push(Thread.current());

    executor.post(task);
    await new Promise((resolve) => setTimeout(resolve, 20));
    executor.post(task);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(threads[1]).toBe(threads[0]);

    executor.shutdown();
    expect(await executor.waitForTermination(1)).toBe(true);
  });

  it("grows the pool to minThreads before reusing an idle worker", async () => {
    const executor = new ThreadPoolExecutor({
      minThreads: 2,
      maxThreads: 2,
      maxQueue: 0,
      fallbackPolicy: "caller_runs",
      idletime: 1,
    });
    const threads: Thread[] = [];
    const task = () => void threads.push(Thread.current());

    executor.post(task);
    await new Promise((resolve) => setTimeout(resolve, 5));
    executor.post(task);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(threads[1]).not.toBe(threads[0]);

    executor.shutdown();
    expect(await executor.waitForTermination(1)).toBe(true);
  });

  it("validates its thread bounds as ns_initialize does", () => {
    const opts = { maxQueue: 0, fallbackPolicy: "caller_runs" as const };
    expect(() => new ThreadPoolExecutor({ ...opts, minThreads: 0, maxThreads: -1 })).toThrow(
      "`max_threads` cannot be less than 0",
    );
    expect(() => new ThreadPoolExecutor({ ...opts, minThreads: 2, maxThreads: 1 })).toThrow(
      "`min_threads` cannot be more than `max_threads`",
    );
  });

  it("queues a task it has no worker for when maxThreads is 0", async () => {
    const executor = new ThreadPoolExecutor({
      minThreads: 0,
      maxThreads: 0,
      maxQueue: 0,
      fallbackPolicy: "caller_runs",
    });
    let ran = false;
    expect(executor.post(() => (ran = true))).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(ran).toBe(false);
  });

  it("finishes posted tasks on shutdown, then rejects new ones under its default :abort", async () => {
    const executor = new ThreadPoolExecutor({
      name: "ActionCable",
      minThreads: 1,
      maxThreads: 2,
      maxQueue: 0,
    });
    expect(executor.name).toBe("ActionCable");
    expect(executor.fallbackPolicy).toBe("abort");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let ran = 0;
    executor.append(async () => {
      await gate;
      ran += 1;
    });
    executor.append(() => void (ran += 1)).append(() => void (ran += 1));
    await new Promise((resolve) => setTimeout(resolve, 5));

    executor.shutdown();
    expect(executor.isShuttingdown()).toBe(true);
    expect(executor.isShutdown()).toBe(false);
    expect(() => executor.post(() => null)).toThrow(RejectedExecutionError);

    release();
    expect(await executor.waitForTermination(1)).toBe(true);
    expect(ran).toBe(3);
    expect(executor.isShuttingdown()).toBe(false);
    expect(executor.isShutdown()).toBe(true);
    expect(executor.scheduledTaskCount).toBe(3);
    expect(executor.completedTaskCount).toBe(3);
  });

  it("counts a task that raised as completed", async () => {
    const executor = new ThreadPoolExecutor({ minThreads: 1, maxThreads: 1, maxQueue: 0 });
    executor.post(() => {
      throw new Error("boom");
    });
    executor.post(() => Promise.reject(new Error("boom")));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(executor.completedTaskCount).toBe(executor.scheduledTaskCount);
    executor.shutdown();
  });

  it("answers one global io executor", () => {
    expect(globalIoExecutor()).toBe(globalIoExecutor());
    expect(Concurrent.globalIoExecutor()).toBe(globalIoExecutor());
    expect(Concurrent.ThreadPoolExecutor).toBe(ThreadPoolExecutor);
  });
});
