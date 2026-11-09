import { describe, expect, it } from "vitest";
import { Benchmark } from "../../lib/core-ext/benchmark.js";
import { deprecator } from "../../lib/deprecator.js";
import { assertDeprecated } from "../../lib/testing/deprecation.js";

describe("BenchmarkTest", () => {
  it("is deprecated", async () => {
    await assertDeprecated(deprecator(), () => {
      expect(Object(Benchmark.ms(() => {}))).toBeInstanceOf(Number);
    });
  });
});
