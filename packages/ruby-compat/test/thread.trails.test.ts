import { describe, expect, it, vi } from "vitest";
import { stderr } from "../lib/process-adapter.js";
import { Thread } from "../lib/thread.js";

function spawn(): Thread {
  return new Thread(() => null);
}

describe("Thread (trails)", () => {
  it("to_s names the line that created the thread, wherever it is read", () => {
    const line = Number(new Error().stack!.split("\n")[1].match(/:(\d+):\d+\)?$/)![1]) + 1;
    const thread = new Thread(() => null);
    const read = (): string => String(thread);
    expect(read()).toContain(`thread.trails.test.ts:${line} `);
  });

  it("to_s keeps the creation site when the stack limit changes after creation", () => {
    const thread = spawn();
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 0;
    try {
      expect(String(thread)).toMatch(/thread\.trails\.test\.ts:6 dead>$/);
    } finally {
      Error.stackTraceLimit = limit;
    }
  });

  it("formats the creation frame only when to_s reads it", () => {
    const v8 = Error as { prepareStackTrace?: (error: Error, frames: unknown[]) => unknown };
    const prepare = v8.prepareStackTrace;
    let calls = 0;
    v8.prepareStackTrace = (error, frames) => {
      calls++;
      return prepare
        ? prepare(error, frames)
        : `${String(error)}\n${frames.map((f) => `    at ${String(f)}`).join("\n")}`;
    };
    try {
      const thread = spawn();
      expect(calls).toBe(0);
      expect(String(thread)).toMatch(/thread\.trails\.test\.ts:6 dead>$/);
      expect(calls).toBe(1);
    } finally {
      v8.prepareStackTrace = prepare;
    }
  });

  it("reports an exception an async thread dies of on stderr", async () => {
    const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
    try {
      const thread = new Thread(async () => {
        throw new Error("boom");
      });
      await expect(thread.join()).rejects.toThrow("boom");
      expect(String(write.mock.calls[0]?.[0])).toContain(
        "terminated with exception (report_on_exception is true):\nError: boom",
      );
    } finally {
      write.mockRestore();
    }
  });

  it("does not report when report_on_exception is false", async () => {
    const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
    try {
      const thread = new Thread(async () => {
        Thread.current().reportOnException = false;
        throw new Error("quiet");
      });
      await expect(thread.join()).rejects.toThrow("quiet");
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });
});
