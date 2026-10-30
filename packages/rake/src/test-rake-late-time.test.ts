import { describe, expect, it } from "vitest";
import { cmp } from "@blazetrails/ruby-compat";
import { LATE } from "./late-time.js";

describe("TestRakeLateTime", () => {
  it("late time comparisons", () => {
    const late = LATE;
    const now = new Date();
    expect(late).toBe(late);
    expect(late.greaterThanOrEqual(now)).toBe(true);
    expect(late.greaterThan(now)).toBe(true);
    expect(late.equals(now)).toBe(false);
    expect(cmp(now, late)).toBeLessThan(0);
    expect(cmp(now, late)).toBeLessThanOrEqual(0);
    expect(cmp(now, late)).not.toBe(0);
  });

  it("to s", () => {
    expect(LATE.toString()).toBe("<LATE TIME>");
  });
});
