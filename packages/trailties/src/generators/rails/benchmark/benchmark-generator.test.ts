import { stdout } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
  vi.spyOn(stdout, "write").mockImplementation(
    (chunk) => lines.push(String(chunk).replace(/\n$/, "")) > 0,
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("BenchmarkGeneratorTest", () => {
  it("generate benchmark", () => {
    const gen = new BenchmarkGenerator(["my_benchmark"], {}, { destinationRoot: tmpDir });
    gen.generateLayout();
    expect(gen.getCreatedFiles()).toContain("script/benchmarks/my_benchmark.ts");
    const content = fs.readFileSync(
      path.join(tmpDir, "script/benchmarks/my_benchmark.ts"),
      "utf-8",
    );
    expect(content).toContain("before: () => {}");
    expect(content).toContain("after: () => {}");
    expect(content).toContain("performance.now()");
  });
});
