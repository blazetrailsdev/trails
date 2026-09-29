import { describe, expect, it } from "vitest";

import { ArgumentError } from "./argument-error.js";
import { Queue, SizedQueue } from "./queue.js";
import { ThreadError } from "./thread-error.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Thread::Queue", () => {
  it("pop returns pushed objects in order", async () => {
    const q = new Queue<number>();
    await q.push(1);
    await q.push(2);
    expect(await q.pop()).toBe(1);
    expect(await q.pop()).toBe(2);
  });

  it("pop waits for a later push", async () => {
    const q = new Queue<string>();
    let popped: string | undefined;
    const pending = q.pop().then((v) => (popped = v));
    await tick();
    expect(popped).toBeUndefined();
    void q.push("x");
    await pending;
    expect(popped).toBe("x");
  });

  it("pop(true) answers at once, or raises ThreadError when empty", () => {
    const q = new Queue<number>();
    void q.push(1);
    expect(q.pop(true)).toBe(1);
    expect(() => q.pop(true)).toThrow(ThreadError);
    expect(() => q.pop(true)).toThrow("queue empty");
  });

  it("clear removes all objects", async () => {
    const q = new Queue<number>();
    void q.push(1);
    q.clear();
    void q.push(2);
    expect(await q.pop()).toBe(2);
  });
});

describe("Thread::SizedQueue", () => {
  it("rejects a non-positive max", () => {
    expect(() => new SizedQueue(0)).toThrow(ArgumentError);
    expect(() => new SizedQueue(0)).toThrow("queue size must be positive");
  });

  it("push waits while the queue is full, and keeps arrival order", async () => {
    const q = new SizedQueue<number>(1);
    expect(q.max).toBe(1);
    let pushedTwo = false;
    void q.push(1);
    void q.push(2).then(() => (pushedTwo = true));
    void q.push(3);
    await tick();
    expect(pushedTwo).toBe(false);
    expect(await q.pop()).toBe(1);
    expect(await q.pop()).toBe(2);
    expect(pushedTwo).toBe(true);
    expect(await q.pop()).toBe(3);
  });

  it("a push arriving after sleeping pushers are woken does not overtake them", async () => {
    const q = new SizedQueue<number>(1);
    void q.push(1);
    void q.push(2);
    await tick();
    q.clear();
    void q.push(3);
    expect(await q.pop()).toBe(2);
    expect(await q.pop()).toBe(3);
  });
});
