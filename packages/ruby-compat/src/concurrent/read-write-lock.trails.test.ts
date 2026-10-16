import { describe, it, expect } from "vitest";
import { Concurrent } from "../index.js";

describe("Concurrent::AtomicBoolean", () => {
  it("make_true and make_false answer whether the value changed", () => {
    const flag = new Concurrent.AtomicBoolean(true);
    expect(flag.isTrue()).toBe(true);
    expect(flag.makeTrue()).toBe(false);
    expect(flag.makeFalse()).toBe(true);
    expect(flag.makeFalse()).toBe(false);
    expect(flag.isFalse()).toBe(true);
    expect(flag.value).toBe(false);
    expect(new Concurrent.AtomicBoolean().value).toBe(false);
  });
});

describe("Concurrent::ReadWriteLock", () => {
  it("with_read_lock answers a synchronous block's value", () => {
    expect(new Concurrent.ReadWriteLock().withReadLock(() => 42)).toBe(42);
  });

  it("with_write_lock waits for a read lock held across an await", async () => {
    const lock = new Concurrent.ReadWriteLock();
    const log: string[] = [];
    let finish!: () => void;
    const reading = lock.withReadLock(async () => {
      log.push("read start");
      await new Promise<void>((resolve) => (finish = resolve));
      log.push("read end");
    });
    const writing = lock.withWriteLock(() => log.push("write"));
    await Promise.resolve();
    expect(log).toEqual(["read start"]);
    finish();
    await Promise.all([reading, writing]);
    expect(log).toEqual(["read start", "read end", "write"]);
  });

  it("a waiting writer holds off new readers", async () => {
    const lock = new Concurrent.ReadWriteLock();
    const log: string[] = [];
    let finish!: () => void;
    const first = lock.withReadLock(() => new Promise<void>((resolve) => (finish = resolve)));
    const writing = lock.withWriteLock(() => log.push("write"));
    const second = lock.withReadLock(() => log.push("read"));
    finish();
    await Promise.all([first, writing, second]);
    expect(log).toEqual(["write", "read"]);
  });
});
