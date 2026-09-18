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

  it("logs an unrescued reap() failure and stops ticking that frequency, matching a Rails reaper thread dying", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      let attempts = 0;
      const flakyPool: ReapablePool = {
        reap: async () => {
          attempts++;
          if (attempts === 1) throw new Error("boom");
        },
        isDiscarded: () => false,
      };
      new Reaper(flakyPool, FREQUENCY).run();
      expect(reaperInternals()._timers.has(FREQUENCY)).toBe(true);

      await vi.advanceTimersByTimeAsync(FREQUENCY * 1000);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("boom"));
      expect(reaperInternals()._timers.has(FREQUENCY)).toBe(false);

      new Reaper(flakyPool, FREQUENCY).run();
      expect(reaperInternals()._timers.has(FREQUENCY)).toBe(true);

      await vi.advanceTimersByTimeAsync(FREQUENCY * 1000);
      expect(attempts).toBe(2);
      expect(reaperInternals()._timers.has(FREQUENCY)).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
