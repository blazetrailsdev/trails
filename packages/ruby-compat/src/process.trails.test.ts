import { describe, expect, it } from "vitest";
import { Process } from "./process.js";

describe("Process", () => {
  it("clock_gettime answers a non-decreasing float second reading", () => {
    const first = Process.clockGettime(Process.CLOCK_MONOTONIC);
    const second = Process.clockGettime(Process.CLOCK_MONOTONIC);
    expect(second).toBeGreaterThanOrEqual(first);
  });

  it("clock_gettime answers float milliseconds for :float_millisecond", () => {
    const seconds = Process.clockGettime(Process.CLOCK_MONOTONIC);
    const milliseconds = Process.clockGettime(Process.CLOCK_MONOTONIC, ":float_millisecond");
    expect(milliseconds / 1000).toBeCloseTo(seconds, 1);
  });

  it("carries the clock ids Rails names", () => {
    expect(Process.CLOCK_MONOTONIC).toBe(":CLOCK_MONOTONIC");
    expect(Process.CLOCK_THREAD_CPUTIME_ID).toBe(":CLOCK_THREAD_CPUTIME_ID");
  });
});
