import { describe, it, expect, vi } from "vitest";
import { AbstractAdapter } from "./abstract-adapter.js";
import { ConnectionNotEstablished, ConnectionNotDefined } from "../errors.js";

describe("AbstractAdapter connection lifecycle privates", () => {
  it("verifiedBang sets _verified and _lastActivity", () => {
    const a = new AbstractAdapter();
    a.verifiedBang();
    expect((a as any)._verified).toBe(true);
    expect((a as any)._lastActivity).toBeGreaterThan(0);
  });

  it("retryable error predicates match Rails semantics", () => {
    const a = new AbstractAdapter();
    const named = (n: string) => Object.assign(new Error(""), { name: n });
    expect(a.isRetryableConnectionError(new ConnectionNotEstablished("x"))).toBe(true);
    expect(a.isRetryableConnectionError(new ConnectionNotDefined("x"))).toBe(false);
    expect(a.isRetryableConnectionError(named("ConnectionFailed"))).toBe(true);
    expect(a.isRetryableQueryError(named("Deadlocked"))).toBe(true);
    expect(a.isRetryableQueryError(named("LockWaitTimeout"))).toBe(true);
    expect(a.isRetryableQueryError(new Error("other"))).toBe(false);
  });

  it("backoff sleeps proportionally to counter", async () => {
    vi.useFakeTimers();
    try {
      const a = new AbstractAdapter();
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
    const a = new AbstractAdapter();
    expect(a.extendedTypeMapKey()).toBeNull();
    (a as any)._config.defaultTimezone = "utc";
    expect(a.extendedTypeMapKey()).toEqual({ defaultTimezone: "utc" });
    expect(a.typeMap).toBeInstanceOf(Map);
  });

  it("withRawConnection serializes concurrent calls and yields the connection", async () => {
    const a = new AbstractAdapter();
    const order: number[] = [];
    const p1 = a.withRawConnection(async () => {
      order.push(1);
      await new Promise((r) => setTimeout(r, 10));
      order.push(2);
      return "a";
    });
    const p2 = a.withRawConnection(async () => {
      order.push(3);
      return "b";
    });
    expect(await Promise.all([p1, p2])).toEqual(["a", "b"]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("configureConnection invokes checkVersion", () => {
    const a = new AbstractAdapter();
    let called = 0;
    a.checkVersion = () => void (called += 1);
    a.configureConnection();
    expect(called).toBe(1);
  });
});
