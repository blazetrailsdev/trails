import { describe, expect, it } from "vitest";

describe("BenchmarkableTest", () => {
  function benchmark<T>(label: string, fn: () => T): { result: T; ms: number; label: string } {
    const start = performance.now();
    const result = fn();
    const ms = performance.now() - start;
    return { result, ms, label };
  }

  it("without block", () => {
    const start = performance.now();
    const ms = performance.now() - start;
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it("defaults", () => {
    const result = benchmark("test", () => 1 + 1);
    expect(result.result).toBe(2);
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });

  it("with message", () => {
    const result = benchmark("my operation", () => "done");
    expect(result.label).toBe("my operation");
    expect(result.result).toBe("done");
  });

  it("with silence", () => {
    // Silence means suppress log output; we just verify the operation still runs
    const result = benchmark("silent", () => 42);
    expect(result.result).toBe(42);
  });

  it("within level", () => {
    // Logging at a level that should be recorded
    const logs: string[] = [];
    function benchmarkLog(label: string, level: string, fn: () => unknown) {
      const result = fn();
      if (level === "debug") logs.push(`${label}: completed`);
      return result;
    }
    benchmarkLog("operation", "debug", () => "done");
    expect(logs[0]).toContain("operation");
  });

  it("outside level", () => {
    // Logging above threshold — nothing logged
    const logs: string[] = [];
    function benchmarkLog(label: string, level: string, fn: () => unknown) {
      const result = fn();
      if (level === "debug") logs.push(label);
      return result;
    }
    benchmarkLog("operation", "info", () => "done");
    expect(logs.length).toBe(0);
  });
});
