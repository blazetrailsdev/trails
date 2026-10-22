import { describe, expect, it } from "vitest";
import { Thread } from "./thread.js";
import { ThreadPoolExecutor } from "./thread-pool-executor.js";

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
});
