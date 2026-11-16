import { describe, expect, it } from "vitest";

import { Kernel } from "../lib/index.js";
import { kernelRand, kernelSrand } from "../lib/kernel-rand.js";

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

  it("reproduces MRI's MT19937 sequence after srand", () => {
    kernelSrand(1234);
    expect([kernelRand(), kernelRand(), kernelRand(10), kernelRand(1000)]).toEqual([
      0.1915194503788923, 0.6221087710398319, 4, 664,
    ]);
    expect(kernelRand(2n ** 40n)).toBe(1072796827279n);
    expect(kernelRand(2n ** 70n)).toBe(908918905716530488553n);
    expect(kernelSrand(5)).toBe(1234n);
    for (const [seed, value] of [
      [2n ** 32n, 15576833789872009150n],
      [2n ** 100n + 7n, 7674613204002597521n],
      [-99n, 12401350425397713955n],
    ]) {
      kernelSrand(seed);
      expect(kernelRand(2n ** 64n)).toBe(value);
    }
  });
});
