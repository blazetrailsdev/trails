import { describe, it, expect, vi } from "vitest";
import { Queue, ConnectionLeasingQueue, BiasedConditionVariable, BiasableQueue } from "./queue.js";
import type { DatabaseAdapter } from "../../../adapter.js";
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

    // poll without timeout returns LIFO (pop)
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

    // add resolves the waiting poll via signal
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

    // Start a waiter
    const promise = q.poll(1) as Promise<DatabaseAdapter>;
    expect(q.numWaiting()).toBe(1);

    // Add a connection — it goes to the waiter, not the queue
    q.add(c);
    expect(q.length).toBe(0);

    // A no-wait poll should get nothing
    expect(q.poll()).toBeUndefined();

    await promise;
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

  it("clear empties queue and returns elements", () => {
    const q = new Queue();
    q.add(fakeConn(1));
    q.add(fakeConn(2));

    const cleared = q.clear();
    expect(cleared).toHaveLength(2);
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
  it("constructor accepts lock, otherCond, preferredThread", () => {
    const cv = new BiasedConditionVariable({}, null, "thread-1");
    expect(cv.waitingCount).toBe(0);
  });

  it("signal resolves a waiter", async () => {
    const cv = new BiasedConditionVariable();
    const p = cv.wait(1);
    expect(cv.waitingCount).toBe(1);

    const c = fakeConn();
    expect(cv.signal(c)).toBe(true);
    expect(cv.waitingCount).toBe(0);

    const result = await p;
    expect(result).toBe(c);
  });

  it("signal returns false when no waiters", () => {
    const cv = new BiasedConditionVariable();
    expect(cv.signal(fakeConn())).toBe(false);
  });

  it("broadcastOnBiased resolves local waiters and returns remainder", async () => {
    const cv = new BiasedConditionVariable();
    const p1 = cv.wait(1);
    const p2 = cv.wait(1);

    const c1 = fakeConn(1);
    const c2 = fakeConn(2);
    const c3 = fakeConn(3);
    const remaining = cv.broadcastOnBiased([c1, c2, c3]);

    expect(await p1).toBe(c1);
    expect(await p2).toBe(c2);
    expect(remaining).toEqual([c3]);
  });

  it("broadcast does not double-deliver connections", async () => {
    const other = new BiasedConditionVariable();
    const biased = new BiasedConditionVariable(undefined, other);

    const pBiased = biased.wait(1);
    const pOther = other.wait(1);

    const c1 = fakeConn(1);
    const c2 = fakeConn(2);
    biased.broadcast([c1, c2]);

    // c1 goes to biased, c2 goes to other — no double-delivery
    expect(await pBiased).toBe(c1);
    expect(await pOther).toBe(c2);
  });

  it("signal delegates to otherCond when no local waiters", async () => {
    const other = new BiasedConditionVariable();
    const biased = new BiasedConditionVariable(undefined, other);

    const p = other.wait(1);
    const c = fakeConn();
    expect(biased.signal(c)).toBe(true);
    expect(await p).toBe(c);
  });

  it("signal prefers local waiters over otherCond", async () => {
    const other = new BiasedConditionVariable();
    const biased = new BiasedConditionVariable(undefined, other);

    const pBiased = biased.wait(1);
    const pOther = other.wait(1);

    const c1 = fakeConn(1);
    const c2 = fakeConn(2);
    expect(biased.signal(c1)).toBe(true);
    expect(biased.signal(c2)).toBe(true);

    expect(await pBiased).toBe(c1);
    expect(await pOther).toBe(c2);
  });

  it("broadcast propagates to otherCond", async () => {
    const other = new BiasedConditionVariable();
    const biased = new BiasedConditionVariable(undefined, other);

    const pOther = other.wait(1);
    const c = fakeConn();
    biased.broadcast([c]);

    expect(await pOther).toBe(c);
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
      // innerCond is the temporary biased cond
      expect(innerCond).not.toBe(outerCond);
    });

    // After withABiasFor, cond should be restored to the original
    expect((q as any)._cond).toBe(outerCond);
  });

  it("withABiasFor migrates pending waiters to restored cond", async () => {
    const q = new Queue();
    const c = fakeConn();

    let innerPromise: Promise<DatabaseAdapter>;
    BiasableQueue.withABiasFor.call(q as any, "ctx", () => {
      innerPromise = q.poll(5) as Promise<DatabaseAdapter>;
    });

    // The waiter was on the biased cond, but should have been
    // transferred to the restored cond. An add() should reach it.
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

      // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
      const rejection = expect(innerPromise!).rejects.toBeInstanceOf(ConnectionTimeoutError);
      await vi.advanceTimersByTimeAsync(6000);
      await rejection;

      // A subsequent add should go to the queue, not a stale waiter
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
