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
});
