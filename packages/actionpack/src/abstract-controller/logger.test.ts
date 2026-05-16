import { describe, it, expect } from "vitest";
import { applyLogger, benchmark, type LoggerLike } from "./logger.js";

describe("AbstractController::Logger", () => {
  it("installs a logger slot defaulting to undefined", () => {
    class Host {}
    applyLogger(Host);
    expect("logger" in Host).toBe(true);
    expect((Host as { logger?: LoggerLike }).logger).toBeUndefined();
  });

  it("does not clobber an already-set logger", () => {
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

  it("logs an info line with elapsed ms when a logger is attached", () => {
    const lines: string[] = [];
    const logger: LoggerLike = { info: (m) => lines.push(m) };
    benchmark(logger, "render template", () => 1 + 1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^render template \(\d+ms\)$/);
  });
});
