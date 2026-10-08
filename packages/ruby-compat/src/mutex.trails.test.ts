import { describe, expect, it } from "vitest";
import { Fiber } from "./fiber.js";
import { Mutex } from "./mutex.js";

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

  it("try_lock fails while held and synchronize waits for unlock", async () => {
    const mutex = new Mutex();
    const order: string[] = [];

    expect(mutex.tryLock()).toBe(true);
    expect(mutex.tryLock()).toBe(false);
    const waiting = mutex.synchronize(() => order.push("sync"));
    await Promise.resolve();
    expect(order).toEqual([]);
    mutex.unlock();
    await waiting;

    expect(order).toEqual(["sync"]);
    expect(mutex.tryLock()).toBe(true);
    mutex.unlock();
  });

  it("unlock raises ThreadError when not locked", () => {
    expect(() => new Mutex().unlock()).toThrow("Attempt to unlock a mutex which is not locked");
  });

  it("unlock raises ThreadError when locked by another fiber", () => {
    const mutex = new Mutex();
    expect(mutex.tryLock()).toBe(true);

    expect(() => new Fiber(() => mutex.unlock()).resume()).toThrow(
      "Attempt to unlock a mutex which is locked by another thread/fiber",
    );
    mutex.unlock();
  });

  it("runs an uncontended block before synchronize returns and releases a plain answer at once", () => {
    const mutex = new Mutex();
    const order: string[] = [];

    expect(mutex.synchronize(() => order.push("a"))).toBe(1);
    expect(mutex.synchronize(() => order.push("b"))).toBe(2);

    expect(order).toEqual(["a", "b"]);
    expect(mutex.tryLock()).toBe(true);
    mutex.unlock();
  });

  it("raises a plain block's error from synchronize and releases the lock", () => {
    const mutex = new Mutex();

    expect(() =>
      mutex.synchronize(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(mutex.synchronize(() => "ok")).toBe("ok");
  });

  it("holds the lock until a block's promise settles", async () => {
    const mutex = new Mutex();
    const order: string[] = [];

    const first = mutex.synchronize(async () => {
      order.push("a-in");
      await Promise.resolve();
      order.push("a-out");
    });
    expect(order).toEqual(["a-in"]);
    expect(mutex.tryLock()).toBe(false);
    const second = mutex.synchronize(() => order.push("b"));
    expect(second).toBeInstanceOf(Promise);

    await Promise.all([first, second]);

    expect(order).toEqual(["a-in", "a-out", "b"]);
    expect(mutex.tryLock()).toBe(true);
    mutex.unlock();
  });
});
