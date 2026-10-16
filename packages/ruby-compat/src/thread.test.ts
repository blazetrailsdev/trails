import { describe, it, expect, vi } from "vitest";
import { Thread } from "./thread.js";

describe("Thread", () => {
  it("Thread.new hands its arguments to the block", () => {
    expect(new Thread(1, "a", (n: number, s: string) => `${s}${n}`).value()).toBe("a1");
    expect(new Thread(() => 2).value()).toBe(2);
  });

  it("is the main thread at top level", () => {
    expect(Thread.current()).toBe(Thread.main);
    expect(Thread.main.id).toBe(0);
    expect(String(Thread.main)).toBe("#<Thread:0x0000000000000000 run>");
  });

  it("runs its block as the current thread and keeps it across awaits", async () => {
    let inside: Thread | undefined;
    const thread = new Thread(async () => {
      await Promise.resolve();
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
  });

  it("value re-raises the exception that terminated the thread", () => {
    const thread = new Thread(() => {
      throw new Error("boom");
    });
    expect(thread.status).toBe("dead");
    expect(String(thread)).toMatch(/^#<Thread:0x[0-9a-f]{16} \S*thread\.test\.ts:\d+ dead>$/);
    expect(() => thread.value()).toThrow("boom");
  });

  it("join returns the thread, and awaits an async block", async () => {
    const thread = new Thread(() => null);
    expect(thread.join()).toBe(thread);

    let ran = false;
    const asyncThread = new Thread(async () => {
      await Promise.resolve();
      ran = true;
    });
    expect(await asyncThread.join()).toBe(asyncThread);
    expect(ran).toBe(true);
  });

  it("join re-raises the exception that terminated the thread", () => {
    const thread = new Thread(() => {
      throw new Error("boom");
    });
    expect(() => thread.join()).toThrow("boom");
  });

  it("exit terminates the thread and returns it", () => {
    const thread = new Thread(async () => {
      await new Promise(() => {});
    });
    expect(thread.isAlive()).toBe(true);
    expect(thread.exit()).toBe(thread);
    expect(thread.status).toBe("dead");
    expect(thread.exit()).toBe(thread);
  });

  it("terminate ends a stopped thread, and join then returns it", async () => {
    let resumed = false;
    const thread = new Thread(async () => {
      await Thread.stop();
      resumed = true;
    });
    expect(await thread.join(0.01)).toBeNull();
    expect(thread.isAlive()).toBe(true);
    expect(thread.terminate()).toBe(thread);
    expect(await thread.join()).toBe(thread);
    expect(thread.isAlive()).toBe(false);
    expect(resumed).toBe(false);
  });

  it("join with a limit returns the thread once it finishes", async () => {
    const thread = new Thread(async () => {
      await Thread.pass();
    });
    expect(await thread.join(1)).toBe(thread);
  });

  it("to_s names the runtime class and the thread name", () => {
    class Worker extends Thread {}
    const thread = new Worker(() => null);
    thread.name = "reaper";
    expect(String(thread)).toMatch(/^#<Worker:0x[0-9a-f]{16}@reaper \S+:\d+ dead>$/);
  });

  it("stores fiber-locals under one id for a symbol or a string key", () => {
    const thread = new Thread(() => null);
    expect(thread.set(":greeting", "hi")).toBe("hi");
    expect(thread.get("greeting")).toBe("hi");
    expect(thread.get(":greeting")).toBe("hi");
  });

  it("deletes a fiber-local when assigned nil", () => {
    const thread = new Thread(() => null);
    thread.set("greeting", "hi");
    expect(thread.set(":greeting", null)).toBeNull();
    expect(thread.get("greeting")).toBeNull();
  });

  it("keys names the fiber-locals", () => {
    const thread = new Thread(() => null);
    expect(thread.keys()).toEqual([]);
    thread.set(":cat", "meow");
    thread.set("dog", "woof");
    expect(thread.keys()).toEqual(["cat", "dog"]);
  });

  it("abort_on_exception re-raises outside the thread's own promise", async () => {
    const raised: (() => void)[] = [];
    const queue = vi.spyOn(globalThis, "queueMicrotask").mockImplementation((fn) => {
      raised.push(fn);
    });
    try {
      const error = new Error("boom");
      const quiet = new Thread(async () => {
        throw error;
      });
      const thread = new Thread(async () => {
        Thread.current().abortOnException = true;
        throw error;
      });
      await Promise.resolve(thread.join()).catch(() => null);
      await Promise.resolve(quiet.join()).catch(() => null);
      expect(raised).toHaveLength(1);
      expect(raised[0]).toThrow(error);
    } finally {
      queue.mockRestore();
    }
  });
});
