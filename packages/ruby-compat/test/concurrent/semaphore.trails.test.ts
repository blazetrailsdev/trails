import { describe, expect, it } from "vitest";
import { ArgumentError, Concurrent, RuntimeError, Thread, rbFSleep } from "../../lib/index.js";

describe("Concurrent::Semaphore", () => {
  it("release wakes waiters in FIFO order", async () => {
    const semaphore = new Concurrent.Semaphore(0);
    const order: string[] = [];
    const a = semaphore.acquire().then(() => order.push("a"));
    const b = semaphore.acquire().then(() => order.push("b"));
    semaphore.release();
    await a;
    expect(order).toEqual(["a"]);
    semaphore.release();
    await b;
    expect(order).toEqual(["a", "b"]);
    expect(semaphore.availablePermits()).toBe(0);
  });

  it("acquire with a block releases the permits afterwards", async () => {
    const semaphore = new Concurrent.Semaphore(2);
    const inside = await semaphore.acquire(2, () => semaphore.availablePermits());
    expect(inside).toBe(0);
    expect(semaphore.availablePermits()).toBe(2);
  });

  it("raises ArgumentError for a non-Integer count or a negative permit count", async () => {
    expect(() => new Concurrent.Semaphore(1.5)).toThrow(new ArgumentError("1.5 is not an Integer"));
    const semaphore = new Concurrent.Semaphore(0);
    await expect(semaphore.acquire(-1)).rejects.toThrow(new ArgumentError("-1 cannot be negative"));
    expect(() => semaphore.release(-1)).toThrow(new ArgumentError("-1 cannot be negative"));
  });
});

describe("Thread#raise", () => {
  class Stop extends Error {}

  it("interrupts a thread blocked in a semaphore acquire", async () => {
    const semaphore = new Concurrent.Semaphore(0);
    let raised: unknown = null;
    const th = new Thread(async () => {
      try {
        await semaphore.acquire();
      } catch (error) {
        raised = error;
      }
    });
    await Thread.pass();
    th.raise(Stop);
    await th.join();
    expect(raised).toBeInstanceOf(Stop);
    semaphore.release();
    expect(semaphore.availablePermits()).toBe(1);
  });

  it("raises a pending interrupt where the thread next blocks", async () => {
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => (resume = resolve));
    let raised: unknown = null;
    const th = new Thread(async () => {
      await gate;
      try {
        await rbFSleep(10);
      } catch (error) {
        raised = error;
      }
    });
    th.raise("stop");
    resume();
    await th.join();
    expect(raised).toEqual(new RuntimeError("stop"));
  });

  it("raises at once on the current thread", () => {
    expect(() => Thread.current().raise(Stop)).toThrow(Stop);
  });
});
