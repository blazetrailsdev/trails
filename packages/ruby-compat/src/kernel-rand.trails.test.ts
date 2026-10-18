import { describe, expect, it } from "vitest";

import { Kernel } from "./index.js";
import { kernelRand } from "./kernel-rand.js";

describe("Kernel.rand", () => {
  it("answers a Float in [0, 1) with no argument or a zero max", () => {
    for (const value of [kernelRand(), kernelRand(null), kernelRand(0), kernelRand(0n)]) {
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

  it("draws over the magnitude of a negative max", () => {
    for (let i = 0; i < 200; i++) {
      const value = kernelRand(-10) as number;
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

describe("Kernel module rand", () => {
  it("Kernel.rand is rb_f_rand", () => {
    const value = Kernel.rand(10) as number;
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(10);
    expect(Kernel.rand()).toBeLessThan(1);
  });

  it("a stub of Kernel.rand replaces it for its callers", () => {
    const original = Object.getOwnPropertyDescriptor(Kernel, "rand")!;
    Object.defineProperty(Kernel, "rand", {
      configurable: true,
      writable: true,
      value: () => 0.25,
    });
    try {
      expect(Kernel.rand()).toBe(0.25);
    } finally {
      Object.defineProperty(Kernel, "rand", original);
    }
    expect(Kernel.rand()).not.toBe(0.25);
  });
});
