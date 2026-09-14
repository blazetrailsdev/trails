import { describe, expect, it } from "vitest";
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
