import { describe, it } from "vitest";
import { Range } from "@blazetrails/ruby-compat";
import { Benchmark } from "./benchmark.js";
import { assertIncludes } from "./testing/assertions.js";

function sleep(seconds: number): void {
  const until = performance.now() + seconds * 1000;
  while (performance.now() < until) {}
}

describe("BenchmarkTest", () => {
  it("realtime", () => {
    const time = Benchmark.realtime(() => sleep(0.01));
    assertIncludes(new Range(0.01, 0.02), time);
  });

  it("realtime millisecond", () => {
    const ms = Benchmark.realtime(":float_millisecond", () => sleep(0.01));
    assertIncludes(new Range(10, 20), ms);
  });
});
