import { describe, expect, it } from "vitest";
import { cmp } from "@blazetrails/ruby-compat";
import { EARLY, EarlyTime } from "./early-time.js";

describe("TestRakeEarlyTime", () => {
  it("create", () => {
    const early = EarlyTime.instance;
    const now = new Date();
    expect(early.lessThanOrEqual(now)).toBe(true);
    expect(early.lessThan(now)).toBe(true);
    expect(early.equals(now)).toBe(false);
    expect(cmp(now, early)).toBeGreaterThan(0);
    expect(cmp(now, early)).toBeGreaterThanOrEqual(0);
    expect(cmp(now, early)).not.toBe(0);
  });

  it("equality", () => {
    const early = EarlyTime.instance;
    expect(early).toBe(early);
    expect(early.equals(early)).toBe(true);
  });

  it("original time compare is not messed up", () => {
    const t1 = new Date(1970, 0, 1, 0, 0, 0);
    const t2 = new Date();
    expect(cmp(t1, t2)).toBeLessThan(0);
    expect(cmp(t2, t1)).toBeGreaterThan(0);
    expect(cmp(t1, t1)).toBe(0);
    expect(cmp(t2, t2)).toBe(0);
  });

  it("to s", () => {
    expect(EARLY.toString()).toBe("<EARLY TIME>");
  });
});
