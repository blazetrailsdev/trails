import { describe, expect, it } from "vitest";
import { Mutex } from "./mutex.js";
import { ThreadError } from "./thread-error.js";
import { Thread } from "./thread.js";

describe("Mutex", () => {
  it("queues distinct flows so only one holds the lock at a time", async () => {
    const mutex = new Mutex();
    const order: string[] = [];

    const first = mutex.synchronize(async () => {
      order.push("a-in");
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("a-out");
    });
    const second = mutex.synchronize(async () => {
      order.push("b-in");
      order.push("b-out");
    });

    await Promise.all([first, second]);

    expect(order).toEqual(["a-in", "a-out", "b-in", "b-out"]);
  });

  it("raises ThreadError on recursive locking", async () => {
    const mutex = new Mutex();

    await expect(
      mutex.synchronize(async () => {
        await mutex.synchronize(async () => "unreachable");
      }),
    ).rejects.toThrow("deadlock; recursive locking");
  });

  it("releases the lock after a raise inside the block", async () => {
    const mutex = new Mutex();

    await expect(
      mutex.synchronize(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await mutex.synchronize(async () => "ok")).toBe("ok");
  });
});

describe("Mutex#try_lock / #unlock", () => {
  it("try_lock takes a free mutex once and fails while it is held", () => {
    const mutex = new Mutex();
    expect(mutex.tryLock()).toBe(true);
    expect(mutex.tryLock()).toBe(false);
    mutex.unlock();
    expect(mutex.tryLock()).toBe(true);
    mutex.unlock();
  });

  it("unlock raises ThreadError on a mutex that is not locked", () => {
    const mutex = new Mutex();
    expect(() => mutex.unlock()).toThrow(ThreadError);
    expect(() => mutex.unlock()).toThrow("Attempt to unlock a mutex which is not locked");
  });

  it("synchronize waits for a try_lock holder to unlock", async () => {
    const mutex = new Mutex();
    const order: string[] = [];
    expect(mutex.tryLock()).toBe(true);
    const waiting = mutex.synchronize(() => void order.push("synchronize"));
    await Promise.resolve();
    order.push("unlock");
    mutex.unlock();
    await waiting;
    expect(order).toEqual(["unlock", "synchronize"]);
  });

  it("unlock raises ThreadError when another thread holds the mutex", () => {
    const mutex = new Mutex();
    expect(mutex.tryLock()).toBe(true);
    expect(() => new Thread(() => mutex.unlock()).value()).toThrow(
      "Attempt to unlock a mutex which is locked by another thread/fiber",
    );
    mutex.unlock();
  });

  it("unlock releases a mutex taken by synchronize", async () => {
    const mutex = new Mutex();
    await mutex.synchronize(() => void mutex.unlock());
    expect(mutex.tryLock()).toBe(true);
    mutex.unlock();
  });
});
