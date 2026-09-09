import { describe, expect, it } from "vitest";
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
});
