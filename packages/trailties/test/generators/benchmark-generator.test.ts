import { Dir, File } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { beforeEach, describe, expect, it } from "vitest";
import { BenchmarkGenerator } from "../../lib/generators/trails/benchmark/benchmark-generator.js";
import { TestCase } from "../../lib/generators/test-case.js";

class BenchmarkGeneratorTest extends TestCase {}
BenchmarkGeneratorTest.destination(Dir.mktmpdir());
BenchmarkGeneratorTest.tests(BenchmarkGenerator);
registerSpecType(/^BenchmarkGeneratorTest$/, BenchmarkGeneratorTest);
let t: TestCase;

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
  File.write(File.join(t.destinationRoot, "package.json"), '{\n  "name": "app"\n}\n');
});

describe("BenchmarkGeneratorTest", () => {
  it("generate benchmark", async () => {
    await t.runGenerator(["my_benchmark"]);

    await t.assertFile("package.json", (content) => {
      expect(content).toMatch('"benchmark-ips"');
    });

    await t.assertFile("script/benchmarks/my_benchmark.ts", (content) => {
      expect(content).toBe(`import "../../config/environment.js";
import { Benchmark } from "benchmark-ips";

// Any benchmarking setup goes here...



Benchmark.ips((x) => {
  x.report("before", () => {});
  x.report("after", () => {});

  x.compare();
});
`);
    });
  });

  it("generate benchmark with no name", async () => {
    const output = await capture("stderr", () => t.runGenerator([]));

    expect(output).toBe("No value provided for required arguments 'name'\n");
  });

  it("generate benchmark with reports", async () => {
    await t.runGenerator(["my_benchmark", "with_patch", "without_patch"]);

    await t.assertFile("script/benchmarks/my_benchmark.ts", (content) => {
      expect(content).toBe(`import "../../config/environment.js";
import { Benchmark } from "benchmark-ips";

// Any benchmarking setup goes here...



Benchmark.ips((x) => {
  x.report("with_patch", () => {});
  x.report("without_patch", () => {});

  x.compare();
});
`);
    });
  });

  it("generate benchmark twice only adds ips gem once", async () => {
    await t.runGenerator(["my_benchmark"]);
    await t.runGenerator(["my_benchmark"]);

    await t.assertFile("package.json", (content) => {
      const occurrences = content.split('"benchmark-ips"').length - 1;
      expect(occurrences, "Should only have benchmark-ips present once").toBe(1);
    });
  });
});
