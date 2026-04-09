import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { Reaper } from "./connection-adapters/abstract/connection-pool/reaper.js";
import type { ReapablePool } from "./connection-adapters/abstract/connection-pool/reaper.js";

function makePool(): ReapablePool & {
  reaped: number;
  flushed: number;
  _discarded: boolean;
} {
  return {
    reaped: 0,
    flushed: 0,
    _discarded: false,
    reap() {
      this.reaped++;
    },
    flush() {
      this.flushed++;
    },
    isDiscarded() {
      return this._discarded;
    },
  };
}

function clearReaperState() {
  (Reaper as any)._timers.forEach((timer: any) => clearInterval(timer));
  (Reaper as any)._timers.clear();
  (Reaper as any)._pools.clear();
}

describe("ReaperTest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearReaperState();
    vi.useRealTimers();
  });

  it("nil time", () => {
    const pool = makePool();
    const reaper = new Reaper(pool, 0);
    reaper.run();
    expect((Reaper as any)._pools.size).toBe(0);
    expect((Reaper as any)._timers.size).toBe(0);
  });

  it("some time", () => {
    const pool = makePool();
    const reaper = new Reaper(pool, 60);
    expect(reaper.frequency).toBe(60);
    expect(reaper.pool).toBe(pool);
  });

  it("pool has reaper", () => {
    const pool = makePool();
    const reaper = new Reaper(pool, 60);
    expect(reaper.pool).toBe(pool);
  });

  it("reaping frequency configuration", () => {
    const pool = makePool();
    const reaper = new Reaper(pool, 100);
    expect(reaper.frequency).toBe(100);
  });

  it("connection pool starts reaper", () => {
    const pool = makePool();
    const reaper = new Reaper(pool, 60);
    reaper.run();
    expect((Reaper as any)._pools.size).toBe(1);

    vi.advanceTimersByTime(60_000);
    expect(pool.reaped).toBe(1);
    expect(pool.flushed).toBe(1);

    vi.advanceTimersByTime(60_000);
    expect(pool.reaped).toBe(2);
    expect(pool.flushed).toBe(2);
  });

  it("reaper works after pool discard", () => {
    const pool1 = makePool();
    const pool2 = makePool();

    new Reaper(pool1, 60).run();
    new Reaper(pool2, 60).run();

    vi.advanceTimersByTime(60_000);
    expect(pool1.reaped).toBe(1);
    expect(pool2.reaped).toBe(1);

    pool1._discarded = true;

    vi.advanceTimersByTime(60_000);
    expect(pool1.reaped).toBe(1);
    expect(pool2.reaped).toBe(2);
  });

  it("reap flush on discarded pool", () => {
    const pool = makePool();
    pool._discarded = true;
    const reaper = new Reaper(pool, 60);
    reaper.run();

    vi.advanceTimersByTime(60_000);
    expect(pool.reaped).toBe(0);
    expect(pool.flushed).toBe(0);
  });

  it.skip("connection pool starts reaper in fork", () => {
    // N/A: Node.js does not fork processes the way Ruby does
  });

  it("reaper does not reap discarded connection pools", () => {
    const pool = makePool();
    const reaper = new Reaper(pool, 60);
    reaper.run();

    pool._discarded = true;

    vi.advanceTimersByTime(60_000);
    expect(pool.reaped).toBe(0);
    expect(pool.flushed).toBe(0);
  });
});
