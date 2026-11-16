import { describe, expect, it } from "vitest";

import { ArgumentError } from "../lib/argument-error.js";
import { Queue, SizedQueue } from "../lib/queue.js";
import { Thread } from "../lib/thread.js";
import { ThreadError } from "../lib/thread-error.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Thread::Queue", () => {
  it("a push wakes a live waiter when the first waiter was killed", async () => {
    const q = new Queue<number>();
    const killed = new Thread(async () => await q.pop());
    let received: number | null = null;
    await tick();
    const live = new Thread(async () => (received = await q.pop()));
    await tick();
    killed.kill();
    await q.push(1);
    await live.join();
    expect(received).toBe(1);
  });

  it("a thread killed while it waits in pop never resumes", async () => {
    const q = new Queue<number>();
    let resumed = false;
    const th = new Thread(async () => {
      await q.pop();
      resumed = true;
    });
    await tick();
    th.kill();
    await q.push(1);
    await tick();
    expect(resumed).toBe(false);
  });

  it("pop returns pushed objects in order", async () => {
    const q = new Queue<number>();
    await q.push(1);
    await q.push(2);
    expect(await q.pop()).toBe(1);
    expect(await q.pop()).toBe(2);
  });

  it("pop with a timeout answers null once it expires, and a later push still queues", async () => {
    const q = new Queue<number>();
    expect(await q.pop(false, { timeout: 0 })).toBeNull();
    expect(await q.pop(false, { timeout: 0.02 })).toBeNull();
    await q.push(1);
    expect(await q.pop()).toBe(1);
    const waiting = q.pop(false, { timeout: 1 });
    await q.push(2);
    expect(await waiting).toBe(2);
    expect(() => q.pop(true as false, { timeout: 1 })).toThrow(ArgumentError);
  });

  it("pop waits for a later push", async () => {
    const q = new Queue<string>();
    let popped: string | undefined;
    const pending = q.pop().then((v) => (popped = v));
    await tick();
    expect(popped).toBeUndefined();
    await q.push("x");
    await pending;
    expect(popped).toBe("x");
  });

  it("pop(true) answers at once, or raises ThreadError when empty", async () => {
    const q = new Queue<number>();
    await q.push(1);
    expect(q.pop(true)).toBe(1);
    expect(() => q.pop(true)).toThrow(ThreadError);
    expect(() => q.pop(true)).toThrow("queue empty");
  });

  it("clear removes all objects", async () => {
    const q = new Queue<number>();
    await q.push(1);
    q.clear();
    await q.push(2);
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
    const pushes = [q.push(1), q.push(2).then(() => (pushedTwo = true)), q.push(3)];
    await tick();
    expect(pushedTwo).toBe(false);
    expect(await q.pop()).toBe(1);
    expect(await q.pop()).toBe(2);
    expect(pushedTwo).toBe(true);
    expect(await q.pop()).toBe(3);
    await Promise.all(pushes);
  });

  it("pop(true) finds the object of a pusher it woke", async () => {
    const q = new SizedQueue<number>(1);
    const pushes = [q.push(1), q.push(2)];
    expect(q.length).toBe(1);
    expect(q.pop(true)).toBe(1);
    expect(q.pop(true)).toBe(2);
    expect(() => q.pop(true)).toThrow(ThreadError);
    await Promise.all(pushes);
  });

  it("a push arriving after sleeping pushers are woken does not overtake them", async () => {
    const q = new SizedQueue<number>(1);
    const pushes = [q.push(1), q.push(2)];
    await tick();
    q.clear();
    pushes.push(q.push(3));
    expect(await q.pop()).toBe(2);
    expect(await q.pop()).toBe(3);
    await Promise.all(pushes);
  });
});
