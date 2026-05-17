import { describe, it, expect } from "vitest";
import { applyLogger, benchmark, type LoggerLike } from "./logger.js";

describe("AbstractController::Logger", () => {
  it("reads logger as undefined when nothing is set anywhere", () => {
    class Host {}
    applyLogger(Host);
    expect((Host as { logger?: LoggerLike }).logger).toBeUndefined();
  });

  it("does not clobber an already-set logger on the host class", () => {
    const noop: LoggerLike = { info() {} };
    class Host {
      static logger: LoggerLike = noop;
    }
    applyLogger(Host);
    expect(Host.logger).toBe(noop);
  });

  it("does not shadow a logger inherited from a base class", () => {
    const noop: LoggerLike = { info() {} };
    class Base {
      static logger: LoggerLike = noop;
    }
    class Sub extends Base {}
    applyLogger(Sub);
    expect(Sub.logger).toBe(noop);
    expect(Object.hasOwn(Sub, "logger")).toBe(false);
  });

  it("does not shadow a logger set on the parent AFTER applyLogger(Sub)", () => {
    const noop: LoggerLike = { info() {} };
    class Base {}
    class Sub extends Base {}
    applyLogger(Sub);
    (Base as unknown as { logger?: LoggerLike }).logger = noop;
    expect((Sub as unknown as { logger?: LoggerLike }).logger).toBe(noop);
    expect(Object.hasOwn(Sub, "logger")).toBe(false);
  });
});

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
