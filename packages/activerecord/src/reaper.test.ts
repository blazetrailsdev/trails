import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { Reaper } from "./connection-adapters/abstract/connection-pool/reaper.js";
import { assertNothingRaised } from "@blazetrails/activesupport";
import type { ReapablePool } from "./connection-adapters/abstract/connection-pool/reaper.js";
import { Thread } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import type { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";

function makePool(): ReapablePool & {
  reaped: boolean;
  flushed: boolean;
  _discarded: boolean;
} {
  return {
    reaped: false,
    flushed: false,
    _discarded: false,
    async reap() {
      this.reaped = true;
    },
    async flush() {
      this.flushed = true;
    },
    isDiscarded() {
      return this._discarded;
    },
  };
}

function duplicatedPoolConfig(mergeConfigOptions: Record<string, unknown> = {}): PoolConfig {
  const oldConfig = {
    ...Base.connectionPool().dbConfig.configurationHash,
    ...mergeConfigOptions,
  };
  const dbConfig = new HashConfig("arunit", "primary", { ...oldConfig });
  return new PoolConfig(Base, dbConfig, "writing", "default");
}

async function newConnInThread(pool: ConnectionPool): Promise<[AbstractAdapter, Thread]> {
  let set!: () => void;
  const event = new Promise<void>((resolve) => (set = resolve));
  let conn!: AbstractAdapter;

  const child = new Thread(async () => {
    conn = await pool.checkout();
    await conn.query("SELECT 1");
    set();
    await new Promise(() => {});
  });

  await event;
  return [conn, child];
}

async function waitForConnIdle(conn: AbstractAdapter, timeout = 5): Promise<void> {
  const start = performance.now();
  while (conn.inUse && performance.now() - start < timeout * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
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

  it("pool has reaper", async () => {
    const config = Base.configurations().configsFor({ envName: "arunit", name: "primary" })!;
    const poolConfig = new PoolConfig(Base, config, "writing", "default");
    const pool = new ConnectionPool(poolConfig);
    try {
      expect(pool.reaper).toBeTruthy();
    } finally {
      await pool.discardBang();
    }
  });

  it("reaping frequency configuration", async () => {
    const poolConfig = duplicatedPoolConfig({ reapingFrequency: "10.01" });
    const pool = new ConnectionPool(poolConfig);
    try {
      expect(pool.reaper.frequency).toBe(10.01);
    } finally {
      await pool.discardBang();
    }
  });

  it("connection pool starts reaper", async () => {
    vi.useRealTimers();
    const poolConfig = duplicatedPoolConfig({ reapingFrequency: "0.0001" });
    const pool = new ConnectionPool(poolConfig);
    try {
      const [conn, child] = await newConnInThread(pool);

      expect(conn.inUse).toBeTruthy();

      child.exit();

      await waitForConnIdle(conn);
      expect(conn.inUse).toBeFalsy();
    } finally {
      await pool.discardBang();
    }
  });

  it("reaper works after pool discard", async () => {
    vi.useRealTimers();
    const poolConfig = duplicatedPoolConfig({ reapingFrequency: "0.0001" });

    for (let i = 0; i < 2; i++) {
      const pool = new ConnectionPool(poolConfig);

      const [conn, child] = await newConnInThread(pool);

      expect(conn.inUse).toBeTruthy();

      child.exit();

      await waitForConnIdle(conn);
      expect(conn.inUse).toBeFalsy();

      await pool.discardBang();
    }
  });

  it("reap flush on discarded pool", async () => {
    const poolConfig = duplicatedPoolConfig();
    const pool = new ConnectionPool(poolConfig);

    await pool.discardBang();
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
