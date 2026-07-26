import { describe, it, expect } from "vitest";
import { benchmark, type LoggerLike } from "./logger.js";

describe("benchmark()", () => {
  it("returns the block's return value", () => {
    expect(benchmark(undefined, "work", () => 42)).toBe(42);
  });

  it("runs the block even when no logger is attached", () => {
    let ran = false;
    benchmark(undefined, "work", () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it("awaits a promise-returning block and logs exactly once after resolution", async () => {
    const lines: string[] = [];
    const logger: LoggerLike = { info: (m) => lines.push(m) };
    const result = await benchmark(logger, "fetch", async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    expect(result).toBe(42);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^fetch \(\d+\.\d+ms\)$/);
  });

  it("still logs when a sync block throws, and rethrows the error", () => {
    const lines: string[] = [];
    const logger: LoggerLike = { info: (m) => lines.push(m) };
    expect(() =>
      benchmark(logger, "bad work", () => {
        throw new Error("boom");
      }),
    ).toThrow(/boom/);
    expect(lines).toHaveLength(1);
  });

  it("still logs when an async block rejects, and the rejection propagates", async () => {
    const lines: string[] = [];
    const logger: LoggerLike = { info: (m) => lines.push(m) };
    await expect(
      benchmark(logger, "bad fetch", async () => {
        throw new Error("kaboom");
      }),
    ).rejects.toThrow(/kaboom/);
    expect(lines).toHaveLength(1);
  });

  it("tolerates a logger whose `info` is not a function", () => {
    let ran = false;
    benchmark({ info: "not a function" } as unknown as LoggerLike, "work", () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it("logs an info line with elapsed ms when a logger is attached", () => {
    const lines: string[] = [];
    const logger: LoggerLike = { info: (m) => lines.push(m) };
    benchmark(logger, "render template", () => 1 + 1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^render template \(\d+\.\d+ms\)$/);
  });
});
