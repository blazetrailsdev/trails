import { describe, it, expect } from "vitest";
import { FloatDomainError } from "./float-domain-error.js";
import { NoMethodError } from "./no-method-error.js";
import { anybits, round, toI } from "./numeric.js";

describe("Float#round", () => {
  it("rounds to the given number of digits", () => {
    expect(round(1.25, 1)).toBe(1.3);
    expect(round(0, 1)).toBe(0);
  });

  it("rounds half away from zero, where Math.round rounds up", () => {
    expect(round(-0.5)).toBe(-1);
    expect(Math.round(-0.5)).toBe(-0);
  });

  it("rounds to an integer with no argument", () => {
    expect(round(10.4)).toBe(10);
    expect(round(10.5)).toBe(11);
  });
});

describe("anybits", () => {
  it("returns true if and only if any of the bits of the argument are set in the receiver", () => {
    expect(anybits(42, 42)).toBe(true);
    expect(anybits(0b1010_1010, 0b1000_0010)).toBe(true);
    expect(anybits(0b1010_1010, 0b1000_0001)).toBe(true);
    expect(anybits(0b1000_0010, 0b0010_1100)).toBe(false);
  });

  it("reads bits past the 32-bit window JS `&` truncates to", () => {
    expect(anybits(2 ** 40, 2 ** 40)).toBe(true);
    expect(anybits(2 ** 40, 2 ** 41)).toBe(false);
    expect(anybits(1n << 200n, 1n << 200n)).toBe(true);
  });

  it("handles negative values using two's complement notation", () => {
    expect(anybits(~42, 42)).toBe(false);
    expect(anybits(-42, -42)).toBe(true);
    expect(anybits(~0b100, ~0b1)).toBe(true);
  });
});

describe("#to_i", () => {
  it("dispatches on the receiver the way a Ruby send does", () => {
    expect(toI(null)).toBe(0);
    expect(toI(3.9)).toBe(3);
    expect(toI(-3.9)).toBe(-3);
    expect(toI("12abc")).toBe(12);
    expect(toI("abc")).toBe(0);
    expect(toI(2n ** 70n)).toBe(2n ** 70n);
    expect(toI({ toI: () => 7 })).toBe(7);
  });

  it("raises where Ruby raises", () => {
    expect(() => toI(NaN)).toThrow(FloatDomainError);
    expect(() => toI({})).toThrow(NoMethodError);
  });
});
