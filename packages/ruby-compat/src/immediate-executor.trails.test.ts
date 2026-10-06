import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { ImmediateExecutor } from "./immediate-executor.js";

describe("ImmediateExecutor", () => {
  it("runs the task on the caller, with its arguments", () => {
    const calls: unknown[][] = [];
    const posted = new ImmediateExecutor().post(1, "two", (a: number, b: string) => {
      calls.push([a, b]);
    });
    expect(calls).toEqual([[1, "two"]]);
    expect(posted).toBe(true);
  });

  it("answers a promise that settles once an async task has finished", async () => {
    let finished = false;
    const posted = new ImmediateExecutor().post(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      finished = true;
    });
    expect(finished).toBe(false);
    expect(await posted).toBe(true);
    expect(finished).toBe(true);
  });

  it("raises without a block", () => {
    const post = new ImmediateExecutor().post as (...args: unknown[]) => unknown;
    expect(() => post(1)).toThrow(ArgumentError);
    expect(() => post(1)).toThrow("no block given");
  });
});
