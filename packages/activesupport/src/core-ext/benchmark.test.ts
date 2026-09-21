import { describe, expect, it } from "vitest";
import { Benchmark } from "./benchmark.js";
import { deprecator } from "../deprecator.js";
import { assertDeprecated } from "../testing/deprecation.js";

describe("BenchmarkTest", () => {
  it("is deprecated", async () => {
    await assertDeprecated(null, deprecator(), () => {
      expect(Object(Benchmark.ms(() => {}))).toBeInstanceOf(Number);
    });
  });
});
