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
});
