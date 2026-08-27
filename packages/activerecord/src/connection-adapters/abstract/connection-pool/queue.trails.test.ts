import { describe, it, expect, vi } from "vitest";
import { Queue, ConnectionLeasingQueue, BiasedConditionVariable, BiasableQueue } from "./queue.js";
import type { AbstractAdapter as DatabaseAdapter } from "../../abstract-adapter.js";
import { ConnectionTimeoutError } from "../../../errors.js";

function fakeConn(id = 1): DatabaseAdapter {
  return { id } as unknown as DatabaseAdapter;
}

describe("ConnectionPool::Queue", () => {
  it("add and poll without waiting", () => {
    const q = new Queue();
    const c1 = fakeConn(1);
    const c2 = fakeConn(2);

    q.add(c1);
    q.add(c2);
    expect(q.length).toBe(2);

    const out = q.poll();
    expect(out).toBe(c2);
    expect(q.length).toBe(1);
  });

  it("poll returns undefined when empty and no timeout", () => {
    const q = new Queue();
    expect(q.poll()).toBeUndefined();
  });

  it("poll with timeout waits for add", async () => {
    const q = new Queue();
    const c = fakeConn();

    const promise = q.poll(1) as Promise<DatabaseAdapter>;
    expect(q.isAnyWaiting()).toBe(true);
    expect(q.numWaiting()).toBe(1);

    q.add(c);
    const result = await promise;
    expect(result).toBe(c);
    expect(q.numWaiting()).toBe(0);
  });

  it("poll with timeout throws ConnectionTimeoutError", async () => {
    vi.useFakeTimers();
    try {
      const q = new Queue();
      const promise = q.poll(5) as Promise<DatabaseAdapter>;
      const rejection = expect(promise).rejects.toThrow(ConnectionTimeoutError);
      vi.advanceTimersByTime(5000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("fairness: no-wait poll blocked when waiters exist", async () => {
    const q = new Queue();
    const c = fakeConn();

    const promise = q.poll(1) as Promise<DatabaseAdapter>;
    expect(q.numWaiting()).toBe(1);

    q.add(c);
    expect(q.length).toBe(1);

    expect(q.poll()).toBeUndefined();

    await promise;
    expect(q.length).toBe(0);
  });

  it("delete removes and returns element", () => {
    const q = new Queue();
    const c1 = fakeConn(1);
    const c2 = fakeConn(2);

    q.add(c1);
    q.add(c2);

    expect(q.delete(c1)).toBe(c1);
    expect(q.length).toBe(1);
    expect(q.delete(fakeConn(99))).toBeUndefined();
  });

  it("delete removes every equal element", () => {
    const q = new Queue();
    const c1 = fakeConn(1);
    const c2 = fakeConn(2);

    q.add(c1);
    q.add(c2);
    q.add(c1);

    expect(q.delete(c1)).toBe(c1);
    expect(q.length).toBe(1);
    expect(q.poll()).toBe(c2);
  });

  it("clear empties queue", () => {
    const q = new Queue();
    q.add(fakeConn(1));
    q.add(fakeConn(2));

    q.clear();
    expect(q.length).toBe(0);
  });

  it("isAnyWaiting and numWaiting", async () => {
    const q = new Queue();
    expect(q.isAnyWaiting()).toBe(false);
    expect(q.numWaiting()).toBe(0);

    const p = q.poll(1) as Promise<DatabaseAdapter>;
    expect(q.isAnyWaiting()).toBe(true);
    expect(q.numWaiting()).toBe(1);

    q.add(fakeConn());
    await p;

    expect(q.isAnyWaiting()).toBe(false);
    expect(q.numWaiting()).toBe(0);
  });

  it("any reflects queue state", () => {
    const q = new Queue();
    expect(q.any).toBe(false);
    q.add(fakeConn());
    expect(q.any).toBe(true);
  });
});

describe("ConnectionPool::BiasedConditionVariable", () => {
  function newCond(): any {
    return (new Queue() as any)._cond;
  }

  function settled(promise: Promise<void>): Promise<boolean> {
    return Promise.race([promise.then(() => true), Promise.resolve().then(() => false)]);
  }

  it("signal wakes a waiter on the biased cond", async () => {
    const other = new BiasedConditionVariable(undefined, newCond(), "other");
    const cv = new BiasedConditionVariable({}, other, "thread-1");

    const p = cv.wait(1);
    cv.signal();

    expect(await settled(p)).toBe(true);
  });

  it("signal delegates to otherCond when no waiters are on the biased cond", async () => {
    const base = new BiasedConditionVariable(undefined, newCond(), "base");
    const cv = new BiasedConditionVariable(undefined, base, "thread-1");

    const p = base.wait(1);
    cv.signal();

    expect(await settled(p)).toBe(true);
  });

  it("broadcastOnBiased wakes every waiter on the biased cond", async () => {
    const other = new BiasedConditionVariable(undefined, newCond(), "other");
    const cv = new BiasedConditionVariable(undefined, other, "thread-1");

    const p1 = cv.wait(1);
    const p2 = cv.wait(1);
    cv.broadcastOnBiased();

    expect(await settled(p1)).toBe(true);
    expect(await settled(p2)).toBe(true);
  });

  it("broadcast propagates to otherCond", async () => {
    const base = new BiasedConditionVariable(undefined, newCond(), "base");
    const cv = new BiasedConditionVariable(undefined, base, "thread-1");

    const pBiased = cv.wait(1);
    const pOther = base.wait(1);
    cv.broadcast();

    expect(await settled(pBiased)).toBe(true);
    expect(await settled(pOther)).toBe(true);
  });

  it("broadcastOnBiased leaves otherCond waiters asleep", async () => {
    const base = new BiasedConditionVariable(undefined, newCond(), "base");
    const cv = new BiasedConditionVariable(undefined, base, "thread-1");

    const pOther = base.wait(1);
    cv.broadcastOnBiased();

    expect(await settled(pOther)).toBe(false);
    base.broadcast();
    await pOther;
  });
});

describe("ConnectionPool::BiasableQueue", () => {
  it("exposes BiasedConditionVariable", () => {
    expect(BiasableQueue.BiasedConditionVariable).toBe(BiasedConditionVariable);
  });

  it("withABiasFor restores cond and transfers orphaned waiters", async () => {
    const q = new ConnectionLeasingQueue();

    let innerCond: unknown;
    const outerCond = (q as any)._cond;

    q.withABiasFor("ctx", () => {
      innerCond = (q as any)._cond;
      expect(innerCond).not.toBe(outerCond);
    });

    expect((q as any)._cond).toBe(outerCond);
  });

  it("withABiasFor migrates pending waiters to restored cond", async () => {
    const q = new Queue();
    const c = fakeConn();

    let innerPromise: Promise<DatabaseAdapter>;
    BiasableQueue.withABiasFor.call(q as any, "ctx", () => {
      innerPromise = q.poll(5) as Promise<DatabaseAdapter>;
    });

    q.add(c);
    const result = await innerPromise!;
    expect(result).toBe(c);
  });

  it("timed-out migrated waiter does not consume future connections", async () => {
    vi.useFakeTimers();
    try {
      const q = new Queue();
      const c = fakeConn();

      let innerPromise: Promise<DatabaseAdapter>;
      BiasableQueue.withABiasFor.call(q as any, "ctx", () => {
        innerPromise = q.poll(5) as Promise<DatabaseAdapter>;
      });

      const rejection = expect(innerPromise!).rejects.toBeInstanceOf(ConnectionTimeoutError);
      await vi.advanceTimersByTimeAsync(6000);
      await rejection;

      q.add(c);
      expect(q.poll()).toBe(c);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ConnectionPool::ConnectionLeasingQueue", () => {
  it("withABiasFor delegates to BiasableQueue", () => {
    const q = new ConnectionLeasingQueue();
    let called = false;
    q.withABiasFor("ctx", () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it("poll calls lease on returned connection", () => {
    const q = new ConnectionLeasingQueue();
    let leased = false;
    const c = fakeConn();
    (c as any).lease = () => {
      leased = true;
    };
    q.add(c);
    q.poll();
    expect(leased).toBe(true);
  });

  it("async poll calls lease on returned connection", async () => {
    const q = new ConnectionLeasingQueue();
    let leased = false;
    const c = fakeConn();
    (c as any).lease = () => {
      leased = true;
    };

    const promise = q.poll(1) as Promise<DatabaseAdapter>;
    q.add(c);
    await promise;
    expect(leased).toBe(true);
  });

  it("leaseTo/unlease/leasedTo track leases", () => {
    const q = new ConnectionLeasingQueue();
    const c = fakeConn();

    q.leaseTo(c, "thread-1");
    expect(q.leasedTo(c)).toBe("thread-1");

    q.unlease(c);
    expect(q.leasedTo(c)).toBeUndefined();
  });
});

describe("Queue rejectAll", () => {
  it("rejects all pending waiters with the provided error", async () => {
    const q = new Queue();
    const p1 = q.poll(5) as Promise<DatabaseAdapter>;
    const p2 = q.poll(5) as Promise<DatabaseAdapter>;
    expect(q.numWaiting()).toBe(2);

    const error = new Error("pool discarded");
    q.rejectAll(error);

    await expect(p1).rejects.toThrow("pool discarded");
    await expect(p2).rejects.toThrow("pool discarded");
    expect(q.numWaiting()).toBe(0);
  });

  it("rejectAll is a no-op when no waiters exist", () => {
    const q = new Queue();
    expect(() => q.rejectAll(new Error("test"))).not.toThrow();
    expect(q.numWaiting()).toBe(0);
  });
});
