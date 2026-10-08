import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import type { Thread } from "@blazetrails/ruby-compat";
import { Reaper } from "./connection-adapters/abstract/connection-pool/reaper.js";
import type { ReapablePool } from "./connection-adapters/abstract/connection-pool/reaper.js";

const FREQUENCY = 91.37;

interface ReaperInternals {
  threads: Map<number, Thread>;
  pools: Map<number, WeakRef<ReapablePool>[]>;
}

function reaperInternals(): ReaperInternals {
  return Reaper as unknown as ReaperInternals;
}

describe("Reaper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    reaperInternals().threads.clear();
    reaperInternals().pools.clear();
    vi.useRealTimers();
  });

  it("a reap() failure kills the reaper thread, and a later registerPool spawns a fresh one", async () => {
    let attempts = 0;
    const flakyPool: ReapablePool = {
      reap: async () => {
        attempts++;
        if (attempts === 1) throw new Error("boom");
      },
      flush: async () => {},
      isDiscarded: () => false,
    };
    void new Reaper(flakyPool, FREQUENCY).run();
    const thread = reaperInternals().threads.get(FREQUENCY)!;
    expect(thread.isAlive()).toBe(true);
    expect(thread.name).toBe("AR Pool Reaper");
    expect(thread.threadVariableGet("fork_safe")).toBe(true);

    await vi.advanceTimersByTimeAsync(FREQUENCY * 1000);
    expect(thread.isAlive()).toBe(false);

    void new Reaper(flakyPool, FREQUENCY).run();
    expect(reaperInternals().threads.get(FREQUENCY)).not.toBe(thread);

    await vi.advanceTimersByTimeAsync(FREQUENCY * 1000);
    expect(attempts).toBe(3);
    expect(reaperInternals().threads.get(FREQUENCY)!.isAlive()).toBe(true);
  });

  it("registerPool waits for a reap in flight, as register_pool's @mutex.synchronize does", async () => {
    let finishReap!: () => void;
    const pool: ReapablePool = {
      reap: () => new Promise((resolve) => (finishReap = resolve)),
      flush: async () => {},
      isDiscarded: () => false,
    };
    const pools = Reaper.registerPool(pool, FREQUENCY) as WeakRef<ReapablePool>[];
    await vi.advanceTimersByTimeAsync(FREQUENCY * 1000);

    const registered = Reaper.registerPool(pool, FREQUENCY);
    expect(registered).toBeInstanceOf(Promise);
    expect(pools).toHaveLength(1);
    finishReap();
    expect(await registered).toHaveLength(2);
  });

  it("registerPool appends unconditionally and the thread tears down once every pool is discarded", async () => {
    let discarded = false;
    const pool: ReapablePool = {
      reap: async () => {},
      flush: async () => {},
      isDiscarded: () => discarded,
    };
    void Reaper.registerPool(pool, FREQUENCY);
    expect(Reaper.registerPool(pool, FREQUENCY)).toHaveLength(2);

    discarded = true;
    await vi.advanceTimersByTimeAsync(FREQUENCY * 1000);
    expect(reaperInternals().pools.has(FREQUENCY)).toBe(false);
    expect(reaperInternals().threads.has(FREQUENCY)).toBe(false);
  });
});
