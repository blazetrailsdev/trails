import { describe, it, expect } from "vitest";
import { Thread } from "./thread.js";

describe("Thread", () => {
  it("is the main thread at top level", () => {
    expect(Thread.current()).toBe(Thread.main);
    expect(Thread.main.id).toBe(0);
    expect(String(Thread.main)).toBe("#<Thread:0x0000000000000000 run>");
  });

  it("runs its block as the current thread and keeps it across awaits", async () => {
    let inside: Thread | undefined;
    const thread = new Thread(async () => {
      await Thread.pass();
      inside = Thread.current();
      return 42;
    });

    expect(await thread.value()).toBe(42);
    expect(inside).toBe(thread);
    expect(thread).not.toBe(Thread.main);
    expect(Thread.current()).toBe(Thread.main);
  });

  it("gives each thread its own identity", () => {
    const a = new Thread(() => Thread.current()).value();
    const b = new Thread(() => Thread.current()).value();
    expect(a).not.toBe(b);
    expect(a.id).not.toBe(b.id);
  });

  it("value re-raises the exception that terminated the thread", () => {
    const thread = new Thread(() => {
      throw new Error("boom");
    });
    expect(thread.status).toBe("dead");
    expect(String(thread)).toMatch(/^#<Thread:0x[0-9a-f]{16} \S*thread\.test\.ts:\d+ dead>$/);
    expect(() => thread.value()).toThrow("boom");
  });
});
