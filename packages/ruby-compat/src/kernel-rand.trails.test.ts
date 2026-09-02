import { describe, expect, it } from "vitest";

import { kernelRand } from "./kernel-rand.js";

describe("Kernel.rand", () => {
  it("answers a Float in [0, 1) with no argument or a zero max", () => {
    for (const value of [kernelRand(), kernelRand(0), kernelRand(0n)]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(Number.isInteger(value)).toBe(false);
    }
  });

  it("answers an Integer in 0...max for a positive Integer max", () => {
    for (let i = 0; i < 200; i++) {
      const value = kernelRand(10) as number;
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    }
  });

  it("answers a BigInt when max is a BigInt, staying below the limit", () => {
    const limit = (1n << 128n) - 1n;
    for (let i = 0; i < 50; i++) {
      const value = kernelRand(limit) as bigint;
      expect(typeof value).toBe("bigint");
      expect(value).toBeGreaterThanOrEqual(0n);
      expect(value).toBeLessThan(limit);
    }
  });
});
