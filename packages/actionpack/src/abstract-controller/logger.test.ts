import { describe, it, expect } from "vitest";
import { benchmark, type LoggerLike } from "./logger.js";

describe("benchmark()", () => {
  it("returns the block's return value", () => {
    expect(benchmark.call({}, "work", () => 42)).toBe(42);
  });

  it("runs the block even when no logger is attached", () => {
    let ran = false;
    benchmark.call({}, "work", () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it("awaits a promise-returning block and logs exactly once after resolution", async () => {
    const lines: string[] = [];
    const logger: LoggerLike = {
      debug: () => {},
      info: (m) => {
        lines.push(m);
      },
      warn: () => {},
      error: () => {},
      fatal: () => {},
    };
    const result = await benchmark.call({ logger }, "fetch", async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    expect(result).toBe(42);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^fetch \(\d+\.\d+ms\)$/);
  });

  it("logs an info line with elapsed ms when a logger is attached", () => {
    const lines: string[] = [];
    const logger: LoggerLike = {
      debug: () => {},
      info: (m) => {
        lines.push(m);
      },
      warn: () => {},
      error: () => {},
      fatal: () => {},
    };
    benchmark.call({ logger }, "render template", () => 1 + 1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^render template \(\d+\.\d+ms\)$/);
  });
});
