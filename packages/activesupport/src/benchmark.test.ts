import { describe, it, expect } from "vitest";
import { Range } from "@blazetrails/ruby-compat";
import { Benchmark } from "./benchmark.js";

function sleep(seconds: number): void {
  const until = performance.now() + seconds * 1000;
  while (performance.now() < until) {}
}

describe("BenchmarkTest", () => {
  it("realtime", () => {
    const time = Benchmark.realtime(() => sleep(0.01));
    expect(new Range(0.01, 0.02).isInclude(time)).toBe(true);
  });

  it("realtime millisecond", () => {
    const ms = Benchmark.realtime(":float_millisecond", () => sleep(0.01));
    expect(new Range(10, 20).isInclude(ms)).toBe(true);
  });
});
