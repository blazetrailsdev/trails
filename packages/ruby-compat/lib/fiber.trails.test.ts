import { describe, expect, it } from "vitest";
import { Fiber } from "./fiber.js";
import { FiberError } from "./fiber-error.js";
import { Thread } from "./thread.js";

describe("Fiber", () => {
  it("raises when resuming a terminated fiber", () => {
    const fiber = new Fiber(() => 1);
    expect(fiber.resume()).toBe(1);
    expect(fiber.isAlive()).toBe(false);
    expect(() => fiber.resume()).toThrow(new FiberError("attempt to resume a terminated fiber"));
  });

  it("raises when resuming the current fiber", () => {
    expect(() => Fiber.current().resume()).toThrow("attempt to resume the current fiber");
  });

  it("raises when resumed across threads", async () => {
    const fiber = new Fiber(() => 1);
    await expect(async () => new Thread(() => fiber.resume()).value()).rejects.toThrow(
      "fiber called across threads",
    );
  });

  it("stays alive until an async block settles", async () => {
    let release!: () => void;
    const fiber = new Fiber(() => new Promise<void>((r) => (release = r)));
    const done = fiber.resume();
    expect(fiber.isAlive()).toBe(true);
    release();
    await done;
    expect(fiber.isAlive()).toBe(false);
  });

  it("suspends an async block at Fiber.yield until the next resume", async () => {
    const log: string[] = [];
    const fiber = new Fiber(async () => {
      log.push("a");
      await Fiber.yield();
      log.push("b");
      return "done";
    });
    await fiber.resume();
    expect(log).toEqual(["a"]);
    expect(fiber.isAlive()).toBe(true);
    expect(await fiber.resume()).toBe("done");
    expect(log).toEqual(["a", "b"]);
    expect(fiber.isAlive()).toBe(false);
  });

  it("joins an async segment still in flight instead of resuming it twice", async () => {
    const fiber = new Fiber(async () => {
      await Fiber.yield();
      await Promise.resolve();
      await Fiber.yield();
    });
    await fiber.resume();
    void fiber.resume();
    await fiber.resume();
    expect(fiber.isAlive()).toBe(true);
    await fiber.resume();
    expect(fiber.isAlive()).toBe(false);
  });

  it("raises when yielding from the root fiber", () => {
    expect(() => Fiber.yield()).toThrow(new FiberError("attempt to yield on a not resumed fiber"));
  });

  it("rejects the resume when the async block raises after a yield", async () => {
    const fiber = new Fiber(async () => {
      await Fiber.yield();
      throw new Error("boom");
    });
    await fiber.resume();
    await expect(fiber.resume()).rejects.toThrow("boom");
    expect(fiber.isAlive()).toBe(false);
  });
});
