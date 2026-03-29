import { describe, it, expect } from "vitest";
import { NullLock } from "./null-lock.js";

describe("NullLockTest", () => {
  it("synchronize returns the block result", () => {
    const lock = new NullLock();
    const result = lock.synchronize(() => 42);
    expect(result).toBe(42);
  });

  it("synchronize propagates exceptions", () => {
    const lock = new NullLock();
    expect(() => {
      lock.synchronize(() => {
        throw new Error("boom");
      });
    }).toThrow("boom");
  });
});
