import { describe, it, expect, vi } from "vitest";
import { AbstractAdapter } from "./abstract-adapter.js";
import { TypeMap } from "../type/type-map.js";
import { ConnectionPool } from "./abstract/connection-pool.js";
import { ConnectionDescriptor } from "./abstract/connection-handler.js";
import { PoolConfig } from "./pool-config.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { withExecutionContext } from "./abstract/connection-pool/execution-context.js";

import {
  ConnectionNotEstablished,
  ConnectionNotDefined,
  ConnectionFailed,
  Deadlocked,
  LockWaitTimeout,
  NoDatabaseError,
} from "../errors.js";

async function pinnedPool(a: AbstractAdapter): Promise<ConnectionPool> {
  const dbConfig = new HashConfig("test", "primary", { adapter: "abstract" });
  const pool = new ConnectionPool(new PoolConfig(new ConnectionDescriptor("primary"), dbConfig));
  (pool as unknown as { _connections: AbstractAdapter[] })._connections.push(a);
  (pool as unknown as { _available: { add: (c: AbstractAdapter) => void } })._available.add(a);
  a.pool = pool;
  await pool.pinConnectionBang(true);
  return pool;
}

describe("AbstractAdapter connection lifecycle privates", () => {
  it("verifiedBang sets _verified and _lastActivity", () => {
    const a = new AbstractAdapter({});
    a.verifiedBang();
    expect((a as any)._verified).toBe(true);
    expect((a as any)._lastActivity).toBeGreaterThan(0);
  });

  it("retryable error predicates match Rails semantics", () => {
    const a = new AbstractAdapter({});
    expect(a.isRetryableConnectionError(new ConnectionNotEstablished("x"))).toBe(true);
    expect(a.isRetryableConnectionError(new ConnectionNotDefined("x"))).toBe(false);
    expect(a.isRetryableConnectionError(new ConnectionFailed("x"))).toBe(true);
    expect(a.isRetryableQueryError(new Deadlocked("x"))).toBe(true);
    expect(a.isRetryableQueryError(new LockWaitTimeout("x"))).toBe(true);
    expect(a.isRetryableQueryError(new Error("other"))).toBe(false);
  });

  it("backoff sleeps proportionally to counter", async () => {
    vi.useFakeTimers();
    try {
      const a = new AbstractAdapter({});
      let resolved = false;
      void a.backoff(2).then(() => (resolved = true));
      await vi.advanceTimersByTimeAsync(150);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(60);
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("extendedTypeMapKey + typeMap default behavior", () => {
    const a = new AbstractAdapter({});
    expect(a.extendedTypeMapKey()).toBeNull();
    (a as any)._defaultTimezone = "utc";
    expect(a.extendedTypeMapKey()).toEqual({ defaultTimezone: "utc" });
    expect(a.typeMap).toBeInstanceOf(TypeMap);
  });

  it("withRawConnection serializes concurrent calls and yields the connection", async () => {
    const a = new AbstractAdapter({});
    const pool = await pinnedPool(a);
    const order: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p1 = withExecutionContext(() =>
      pool.withConnection((conn) =>
        conn.withRawConnection({}, async () => {
          order.push(1);
          await gate;
          order.push(2);
          return "a";
        }),
      ),
    );
    const p2 = withExecutionContext(() =>
      pool.withConnection((conn) =>
        conn.withRawConnection({}, async () => {
          order.push(3);
          return "b";
        }),
      ),
    );
    await new Promise((r) => setTimeout(r, 0));
    release();
    expect(await Promise.all([p1, p2])).toEqual(["a", "b"]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("configureConnection invokes checkVersion", async () => {
    const a = new AbstractAdapter({});
    let called = 0;
    a.checkVersion = async () => void (called += 1);
    await a.configureConnection();
    expect(called).toBe(1);
  });
});

describe("AbstractAdapter#databaseExists", () => {
  it("proves the database by connecting, not by a cached handle", async () => {
    const a = new AbstractAdapter({});
    expect((a as any)._connection).toBe(null);
    expect(await a.databaseExists()).toBe(true);
  });

  it("returns false when connect! raises NoDatabaseError", async () => {
    const a = new AbstractAdapter({});
    a.connectBang = async () => {
      throw new NoDatabaseError("no such database");
    };
    (a as any)._connection = {};
    expect(await a.databaseExists()).toBe(false);
  });

  it("re-raises errors other than NoDatabaseError", async () => {
    const a = new AbstractAdapter({});
    a.connectBang = async () => {
      throw new ConnectionFailed("boom");
    };
    await expect(a.databaseExists()).rejects.toBeInstanceOf(ConnectionFailed);
  });
});

describe("AbstractAdapter connection lifecycle critical sections", () => {
  it("reconnectBang serializes concurrent callers", async () => {
    const a = new AbstractAdapter({});
    const pool = await pinnedPool(a);
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    (a as any).reconnect = async () => {
      events.push("enter");
      if (first) {
        first = false;
        await gate;
      }
      events.push("exit");
    };
    (a as any).attemptConfigureConnection = async () => {};
    (a as any).active = async () => true;

    const p1 = withExecutionContext(() => pool.withConnection((conn) => conn.reconnectBang()));
    const p2 = withExecutionContext(() => pool.withConnection((conn) => conn.reconnectBang()));
    await Promise.resolve();
    release();
    await Promise.all([p1, p2]);

    expect(events).toEqual(["enter", "exit", "enter", "exit"]);
  });

  it("verifyBang serializes concurrent callers and promotes the unconfigured connection once", async () => {
    const a = new AbstractAdapter({});
    const pool = await pinnedPool(a);
    const events: string[] = [];
    (a as any).active = async () => false;
    (a as any)._unconfiguredConnection = { handle: 1 };
    (a as any).attemptConfigureConnection = async () => {
      events.push("configure:enter");
      await Promise.resolve();
      events.push("configure:exit");
    };
    (a as any).reconnect = async () => {
      events.push("reconnect");
    };

    await Promise.all([
      withExecutionContext(() => pool.withConnection(() => undefined)),
      withExecutionContext(() => pool.withConnection(() => undefined)),
    ]);

    expect(events).toEqual([
      "configure:enter",
      "configure:exit",
      "reconnect",
      "configure:enter",
      "configure:exit",
    ]);
    expect((a as any)._connection).toEqual({ handle: 1 });
  });
});

describe("AbstractAdapter#initialize", () => {
  it("assigns ActiveRecord::Base.logger in both branches", async () => {
    const { Base } = await import("../base.js");
    const previous = Base.logger;
    const logger = { info() {} } as unknown as NonNullable<typeof Base.logger>;
    Base.logger = logger;
    try {
      expect(new AbstractAdapter({}).logger).toBe(logger);
      expect(new AbstractAdapter(null).logger).toBe(logger);
      const deprecated = { info() {} };
      expect(new AbstractAdapter(null, deprecated).logger).toBe(deprecated);
    } finally {
      Base.logger = previous;
    }
  });
});
