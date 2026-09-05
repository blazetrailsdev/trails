import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { Process } from "./process.js";
import { getProcessAdapter } from "./process-adapter.js";

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

  it("clock_gettime truncates on every Integer unit", () => {
    for (const unit of [":nanosecond", ":microsecond", ":millisecond", ":second"]) {
      expect(Number.isInteger(Process.clockGettime(Process.CLOCK_MONOTONIC, unit))).toBe(true);
    }
  });

  it("clock_gettime raises ArgumentError for an unexpected unit", () => {
    expect(() => Process.clockGettime(Process.CLOCK_MONOTONIC, ":bad")).toThrow(ArgumentError);
    expect(() => Process.clockGettime(Process.CLOCK_MONOTONIC, ":bad")).toThrow(
      "unexpected unit: bad",
    );
  });

  it("clock_gettime raises EINVAL for a clock id the host has no reading for", () => {
    expect(() => Process.clockGettime(":CLOCK_PROCESS_CPUTIME_ID")).toThrow(
      "Invalid argument - clock_gettime(:CLOCK_PROCESS_CPUTIME_ID)",
    );
  });

  it("pid answers the running process id", () => {
    expect(Process.pid).toBe(getProcessAdapter().pid());
    expect(Number.isInteger(Process.pid)).toBe(true);
    expect(Process.pid).toBeGreaterThan(0);
  });

  it("carries the clock ids Rails names", () => {
    expect(Process.CLOCK_MONOTONIC).toBe(":CLOCK_MONOTONIC");
    expect(Process.CLOCK_THREAD_CPUTIME_ID).toBe(":CLOCK_THREAD_CPUTIME_ID");
  });
});
