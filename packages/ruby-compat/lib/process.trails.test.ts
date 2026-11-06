import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { Process } from "./process.js";
import { getProcessAdapter } from "./process-adapter.js";
import { Errno } from "./errno.js";

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

  it("kill reads a signal name with or without SIG, and raises Errno::ESRCH for no such process", () => {
    const calls: [number, number | string][] = [];
    const adapter = getProcessAdapter();
    const original = adapter.kill;
    adapter.kill = (pid, signal) => void calls.push([pid, signal]);
    try {
      expect(Process.kill("TERM", 10, 11)).toBe(2);
      expect(Process.kill(":SIGINT", 12)).toBe(1);
      expect(Process.kill(-15, 13)).toBe(1);
      expect(Process.kill("-TERM", 14)).toBe(1);
    } finally {
      adapter.kill = original;
    }
    expect(calls).toEqual([
      [10, "SIGTERM"],
      [11, "SIGTERM"],
      [12, "SIGINT"],
      [-13, 15],
      [-14, "SIGTERM"],
    ]);

    expect(Process.kill(0, Process.pid)).toBe(1);
    expect(() => Process.kill(0, 4194305)).toThrow(Errno.ESRCH);
  });
});
