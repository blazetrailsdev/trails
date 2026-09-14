import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { kernelCatch, kernelThrow, UncaughtThrowError } from "./kernel-catch.js";

describe("kernelCatch", () => {
  it("raises UncaughtThrowError at the throw site with the inspected tag and value", () => {
    let error: unknown;
    try {
      kernelThrow(":blah", 42);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(UncaughtThrowError);
    expect((error as UncaughtThrowError).name).toBe("UncaughtThrowError");
    expect((error as UncaughtThrowError).message).toBe("uncaught throw :blah");
    expect((error as UncaughtThrowError).tag).toBe(":blah");
    expect((error as UncaughtThrowError).value).toBe(42);
  });

  it("unwinds with a carrier that is not an Error", () => {
    let carrier: unknown;
    const res = kernelCatch(":blah", () => {
      try {
        kernelThrow(":blah", 1);
      } catch (e) {
        carrier = e;
        throw e;
      }
    });
    expect(res).toBe(1);
    expect(carrier).not.toBeInstanceOf(Error);
  });

  it("raises ArgumentError when throw is given no tag", () => {
    const throw0 = kernelThrow as (...args: unknown[]) => never;
    expect(() => throw0()).toThrow("wrong number of arguments (given 0, expected 1..2)");
  });

  it("constructs UncaughtThrowError from a tag and value with an optional message", () => {
    const Ctor = UncaughtThrowError as unknown as new (...args: unknown[]) => UncaughtThrowError;
    expect(new Ctor(":a", 1).tag).toBe(":a");
    expect(new Ctor(":a", 1, "uncaught throw %p").message).toBe("uncaught throw :a");
    expect(() => new Ctor(":a")).toThrow(ArgumentError);
    expect(() => new Ctor(":a", 1, "m", "n")).toThrow(ArgumentError);
  });

  it("does not let a child async resource throw to a catch that has settled", async () => {
    let later!: Promise<unknown>;
    await kernelCatch(":blah", () => {
      later = new Promise((resolve) => setTimeout(resolve, 5)).then(() => kernelThrow(":blah"));
      return Promise.resolve();
    });
    await expect(later).rejects.toBeInstanceOf(UncaughtThrowError);
  });

  it("keeps a sync block sync", () => {
    expect(kernelCatch(":blah", () => 1)).toBe(1);
  });

  it("converts a rejected throw from an async block into the thrown value", async () => {
    const res = kernelCatch(":blah", async () => {
      await Promise.resolve();
      kernelThrow(":blah", ":later");
    });
    expect(res).toBeInstanceOf(Promise);
    expect(await res).toBe(":later");
  });

  it("pops the tag once an async block settles", async () => {
    await kernelCatch(":blah", async () => {
      await Promise.resolve();
    });
    expect(() => kernelThrow(":blah")).toThrow(UncaughtThrowError);
  });

  it("does not let a throw in one interleaved catch reach the other", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const results = await Promise.allSettled([
      kernelCatch(":a", async () => {
        await gate;
        return ":a_done";
      }),
      kernelCatch(":b", async () => {
        await Promise.resolve();
        try {
          kernelThrow(":a", ":stolen");
        } finally {
          release();
        }
      }),
    ]);
    expect(results[0]).toEqual({ status: "fulfilled", value: ":a_done" });
    expect(results[1].status).toBe("rejected");
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(UncaughtThrowError);
  });
});
