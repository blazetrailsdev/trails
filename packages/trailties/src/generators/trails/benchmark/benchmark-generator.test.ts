import { Dir, File } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { capture } from "@blazetrails/activesupport";
import { beforeEach, describe, expect, it } from "vitest";
import { BenchmarkGenerator } from "./benchmark-generator.js";
import { TestCase } from "../../test-case.js";

class BenchmarkGeneratorTest extends TestCase {}
BenchmarkGeneratorTest.destination(Dir.mktmpdir());
BenchmarkGeneratorTest.tests(BenchmarkGenerator);
registerSpecType(/^BenchmarkGeneratorTest$/, BenchmarkGeneratorTest);
let t: TestCase;

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
});

describe("BenchmarkGeneratorTest", () => {
  it("generate benchmark", async () => {
    await t.runGenerator(["my_benchmark"]);

    await t.assertFile("script/benchmarks/my_benchmark.ts", (content) => {
      expect(content).toContain("before: () => {}");
      expect(content).toContain("after: () => {}");
      expect(content).toContain("performance.now()");
    });
  });

  it("generate benchmark with no name", async () => {
    const output = await capture("stderr", () => t.runGenerator([]));

    expect(output).toBe("No value provided for required arguments 'name'\n");
  });

  it("generate benchmark with reports", async () => {
    await t.runGenerator(["my_benchmark", "with_patch", "without_patch"]);

    await t.assertFile("script/benchmarks/my_benchmark.ts", (content) => {
      expect(content).toContain("with_patch: () => {}");
      expect(content).toContain("without_patch: () => {}");
    });
  });
});
