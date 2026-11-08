import { describe, expect, it } from "vitest";
import { cmp } from "@blazetrails/ruby-compat";
import { LATE } from "./late-time.js";

describe("TestRakeLateTime", () => {
  it("late time comparisons", () => {
    const late = LATE;
    const now = new Date();
    expect(late).toEqual(late);
    expect(late.greaterThanOrEqual(now)).toBeTruthy();
    expect(late.greaterThan(now)).toBeTruthy();
    expect(!late.equals(now)).toBeTruthy();
    expect(cmp(now, late)! < 0).toBeTruthy();
    expect(cmp(now, late)! <= 0).toBeTruthy();
    expect(cmp(now, late)! !== 0).toBeTruthy();
  });

  it("to s", () => {
    expect(LATE.toString()).toEqual("<LATE TIME>");
  });
});
