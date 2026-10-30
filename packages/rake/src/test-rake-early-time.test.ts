import { describe, expect, it } from "vitest";
import { cmp } from "@blazetrails/ruby-compat";
import { EARLY, EarlyTime } from "./early-time.js";

describe("TestRakeEarlyTime", () => {
  it("create", () => {
    const early = EarlyTime.instance;
    const now = new Date();
    expect(early.lessThanOrEqual(now)).toBeTruthy();
    expect(early.lessThan(now)).toBeTruthy();
    expect(!early.equals(now)).toBeTruthy();
    expect(cmp(now, early)! > 0).toBeTruthy();
    expect(cmp(now, early)! >= 0).toBeTruthy();
    expect(cmp(now, early) !== 0).toBeTruthy();
  });

  it("equality", () => {
    const early = EarlyTime.instance;
    expect(early).toEqual(early);
  });

  it("original time compare is not messed up", () => {
    const t1 = new Date(1970, 0, 1, 0, 0, 0);
    const t2 = new Date();
    expect(cmp(t1, t2) < 0).toBeTruthy();
    expect(cmp(t2, t1)! > 0).toBeTruthy();
    expect(cmp(t1, t1) === 0).toBeTruthy();
    expect(cmp(t2, t2) === 0).toBeTruthy();
  });

  it("to s", () => {
    expect(EARLY.toString()).toBe("<EARLY TIME>");
  });
});
