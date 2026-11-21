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
});

describe("BenchmarkGeneratorTest", () => {
  it("generate benchmark", async () => {
    await t.runGenerator(["my_benchmark"]);

    await t.assertFile("script/benchmarks/my_benchmark.ts", (content) => {
      expect(content).toBe(`import "../../config/environment.ts";

// Any benchmarking setup goes here...

const reports: Record<string, () => void> = {
  before: () => {},
  after: () => {},
};

for (const [name, fn] of Object.entries(reports)) {
  const start = performance.now();
  fn();
  console.log(\`\${name}: \${(performance.now() - start).toFixed(3)}ms\`);
}
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
      expect(content).toBe(`import "../../config/environment.ts";

// Any benchmarking setup goes here...

const reports: Record<string, () => void> = {
  with_patch: () => {},
  without_patch: () => {},
};

for (const [name, fn] of Object.entries(reports)) {
  const start = performance.now();
  fn();
  console.log(\`\${name}: \${(performance.now() - start).toFixed(3)}ms\`);
}
`);
    });
  });
});
