import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { Reaper } from "./connection-adapters/abstract/connection-pool/reaper.js";
import type { ReapablePool } from "./connection-adapters/abstract/connection-pool/reaper.js";

const FREQUENCY = 91.37;

interface ReaperInternals {
  _timers: Map<number, ReturnType<typeof setTimeout>>;
  _pools: Map<number, unknown[]>;
}

function reaperInternals(): ReaperInternals {
  return Reaper as unknown as ReaperInternals;
}

function clearReaperState() {
  reaperInternals()._timers.forEach((timer) => clearTimeout(timer));
  reaperInternals()._timers.clear();
  reaperInternals()._pools.clear();
}

describe("Reaper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearReaperState();
    vi.useRealTimers();
  });

  it("keeps ticking after a reap() failure, logging it instead of raising it unhandled (interim shape, story reaper-tick-rescue-scope-too-broad)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      let attempt = 0;
      const flaky: ReapablePool = {
        reap: async () => {
          attempt++;
          if (attempt === 1) throw new Error("boom");
        },
        isDiscarded: () => false,
      };
      new Reaper(flaky, FREQUENCY).run();

      await vi.advanceTimersByTimeAsync(FREQUENCY * 1000);
      expect(attempt).toBe(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("boom"));

      await vi.advanceTimersByTimeAsync(FREQUENCY * 1000);
      expect(attempt).toBe(2);
    } finally {
      warn.mockRestore();
    }
  });
});
