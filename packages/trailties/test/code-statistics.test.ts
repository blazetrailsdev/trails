import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { STDOUT } from "@blazetrails/ruby-compat/io";
import { CodeStatistics } from "../lib/code-statistics.js";

describe("CodeStatisticsTest", () => {
  let tmpPath: string;
  beforeEach(() => {
    tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "trails-cs-suite-"));
    fs.mkdirSync(path.join(tmpPath, "lib.js"), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmpPath, { recursive: true, force: true });
  });

  it("register directories", () => {
    try {
      CodeStatistics.registerDirectory("My Directory", "path/to/dir");
      expect(
        CodeStatistics.directories.some(([l, p]) => l === "My Directory" && p === "path/to/dir"),
      ).toBeTruthy();
      expect(CodeStatistics.testTypes.includes("My Directory")).toBeFalsy();
    } finally {
      const index = CodeStatistics.directories.findIndex(
        ([l, p]) => l === "My Directory" && p === "path/to/dir",
      );
      if (index !== -1) CodeStatistics.directories.splice(index, 1);
    }
  });

  it("register test directories", () => {
    try {
      CodeStatistics.registerDirectory("Model specs", "spec/models", { testDirectory: true });
      expect(CodeStatistics.testTypes.includes("Model specs")).toBeTruthy();
    } finally {
      const index = CodeStatistics.testTypes.indexOf("Model specs");
      if (index !== -1) CodeStatistics.testTypes.splice(index, 1);
    }
  });

  it("ignores directories that happen to have source files extensions", async () => {
    await expect(CodeStatistics.new(["tmp dir", tmpPath])).resolves.not.toThrow();
  });

  it("renders a Rails-shaped table with totals and Code-to-Test ratio", async () => {
    fs.writeFileSync(path.join(tmpPath, "a.ts"), "export class A {\n  run() {}\n}\n");
    fs.mkdirSync(path.join(tmpPath, "t"), { recursive: true });
    fs.writeFileSync(path.join(tmpPath, "t", "a_test.ts"), "function t() {}\n");
    const stats = await CodeStatistics.new(
      ["Models", tmpPath],
      ["Model tests", path.join(tmpPath, "t")],
    );
    const write = vi.spyOn(STDOUT, "write").mockReturnValue(0);
    stats.toString();
    const s = write.mock.calls.map((call) => String(call[0])).join("");
    write.mockRestore();
    const lines = s.split("\n");
    expect(lines[0]).toMatch(/^\+-+(\+-+)+\+$/);
    expect(lines[1]).toContain("| Name");
    expect(lines[1]).toContain("Lines");
    expect(lines[1]).toContain("LOC");
    expect(lines[1]).toContain("Classes");
    expect(lines[1]).toContain("Methods");
    expect(lines[1]).toContain("| M/C | LOC/M |");
    expect(s).toContain("| Models");
    expect(s).toContain("| Model tests");
    expect(s).toContain("| Total");
    expect(s).toMatch(/Code LOC: \d+ +Test LOC: \d+ +Code to Test Ratio: 1:\d+\.\d/);
  });

  it("ignores hidden files", async () => {
    fs.writeFileSync(
      path.join(tmpPath, ".example.rb"),
      "      def foo\n        puts 'foo'\n      end\n",
    );
    await expect(CodeStatistics.new(["hidden file", tmpPath])).resolves.not.toThrow();
  });
});
