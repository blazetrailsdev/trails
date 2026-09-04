import { describe, it, expect } from "vitest";
import { Benchmark } from "./benchmark.js";

function sleep(seconds: number): void {
  const until = performance.now() + seconds * 1000;
  while (performance.now() < until) {}
}

describe("BenchmarkTest", () => {
  it("realtime", () => {
    const time = Benchmark.realtime(() => sleep(0.01));
    expect(time).toBeGreaterThanOrEqual(0.01);
    expect(time).toBeLessThanOrEqual(0.02);
  });

  it("realtime millisecond", () => {
    const ms = Benchmark.realtime(":float_millisecond", () => sleep(0.01));
    expect(ms).toBeGreaterThanOrEqual(10);
    expect(ms).toBeLessThanOrEqual(20);
  });
});
