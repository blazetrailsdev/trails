import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { BenchmarkGenerator } from "./benchmark-generator.js";

let tmpDir: string;
let lines: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-bench-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  lines = [];
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("BenchmarkGeneratorTest", () => {
  it("generate benchmark", () => {
    const gen = new BenchmarkGenerator({
      cwd: tmpDir,
      output: (m) => lines.push(m),
      name: "my_benchmark",
    });
    const files = gen.run();
    expect(files).toContain("script/benchmarks/my_benchmark.ts");
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf-8");
    expect(content).toContain("before: () => {}");
    expect(content).toContain("after: () => {}");
    expect(content).toContain("performance.now()");
  });
});
