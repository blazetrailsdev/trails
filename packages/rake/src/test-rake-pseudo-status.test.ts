import { describe, expect, it } from "vitest";
import { PseudoStatus } from "./pseudo-status.js";

describe("TestRakePseudoStatus", () => {
  it("with zero exit status", () => {
    const s = new PseudoStatus();
    expect(s.exitstatus()).toBe(0);
    expect(s.toI()).toBe(0);
    expect(s.bitwiseShiftRight(8)).toBe(0);
    expect(s.isStopped()).toBe(false);
    expect(s.isExited()).toBe(true);
  });

  it("with 99 exit status", () => {
    const s = new PseudoStatus(99);
    expect(s.exitstatus()).toBe(99);
    expect(s.toI()).toBe(25344);
    expect(s.bitwiseShiftRight(8)).toBe(99);
    expect(s.isStopped()).toBe(false);
    expect(s.isExited()).toBe(true);
  });
});
