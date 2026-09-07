import { describe, it, expect } from "vitest";
import { NullLock } from "./null-lock.js";

describe("NullLockTest", () => {
  it("synchronize returns the block result", async () => {
    const lock = NullLock;
    const result = await lock.synchronize(() => 42);
    expect(result).toBe(42);
  });

  it("synchronize propagates exceptions", async () => {
    const lock = NullLock;
    await expect(
      lock.synchronize(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
