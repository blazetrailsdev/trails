import { describe, expect, it } from "vitest";
import { Thread } from "./thread.js";

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
      expect(String(thread)).toMatch(/thread\.trails\.test\.ts:5 dead>$/);
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
      expect(String(thread)).toMatch(/thread\.trails\.test\.ts:5 dead>$/);
      expect(calls).toBe(1);
    } finally {
      v8.prepareStackTrace = prepare;
    }
  });
});
