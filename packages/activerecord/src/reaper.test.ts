import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { Reaper } from "./connection-adapters/abstract/connection-pool/reaper.js";
import { assertNothingRaised } from "@blazetrails/activesupport";
import type { ReapablePool } from "./connection-adapters/abstract/connection-pool/reaper.js";

function makePool(): ReapablePool & {
  reaped: boolean;
  flushed: boolean;
  inUse: boolean;
  _discarded: boolean;
} {
  return {
    reaped: false,
    flushed: false,
    inUse: true,
    _discarded: false,
    async reap() {
      this.reaped = true;
      this.inUse = false;
    },
    async flush() {
      this.flushed = true;
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
    const fp = makePool();
    expect(fp.reaped).toBeFalsy();
    const reaper = new Reaper(fp, 0);
    reaper.run();
    expect(fp.reaped).toBeFalsy();
  });

  it("some time", async () => {
    const fp = makePool();
    expect(fp.reaped).toBeFalsy();

    const reaper = new Reaper(fp, 60);
    reaper.run();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fp.reaped).toBeTruthy();
    expect(fp.flushed).toBeTruthy();
  });

  it("pool has reaper", () => {
    const pool = makePool();
    const reaper = new Reaper(pool, 60);
    expect(reaper).toBeTruthy();
  });

  it("reaping frequency configuration", () => {
    const pool = makePool();
    const reaper = new Reaper(pool, 10.01);
    expect(reaper.frequency).toBe(10.01);
  });

  it("connection pool starts reaper", async () => {
    const conn = makePool();
    new Reaper(conn, 60).run();

    expect(conn.inUse).toBeTruthy();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(conn.inUse).toBeFalsy();
  });

  it("reaper works after pool discard", async () => {
    const conn = makePool();
    new Reaper(conn, 60).run();

    expect(conn.inUse).toBeTruthy();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(conn.inUse).toBeFalsy();

    conn._discarded = true;
  });

  it("reap flush on discarded pool", async () => {
    const pool = makePool();
    pool._discarded = true;
    await assertNothingRaised(async () => {
      await pool.reap();
      await pool.flush();
    });
  });

  it.skip("connection pool starts reaper in fork", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — fork
  });

  it("reaper does not reap discarded connection pools", async () => {
    const discardedPool = makePool();
    discardedPool._discarded = true;
    const pool = makePool();

    new Reaper(discardedPool, 60).run();
    new Reaper(pool, 60).run();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(discardedPool.reaped).toBeFalsy();
    expect(pool.reaped).toBeTruthy();
  });
});
