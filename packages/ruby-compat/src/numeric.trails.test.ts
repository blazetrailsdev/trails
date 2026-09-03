import { describe, it, expect } from "vitest";
import { round } from "./numeric.js";

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
