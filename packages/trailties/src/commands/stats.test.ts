import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { statsCommand } from "./stats.js";
import { CodeStatistics, DEFAULT_DIRECTORIES, DEFAULT_TEST_TYPES } from "../code-statistics.js";

describe("StatsCommandTest", () => {
  it("stats prints a table for the current working directory", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-stats-"));
    const models = path.join(tmpDir, "app/models");
    const tests = path.join(tmpDir, "test/models");
    fs.mkdirSync(models, { recursive: true });
    fs.mkdirSync(tests, { recursive: true });
    fs.writeFileSync(path.join(models, "post.ts"), "export class Post { run() {} }\n");
    fs.writeFileSync(path.join(tests, "post_test.ts"), "function t() {}\n");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await statsCommand().parseAsync(["node", "stats"]);
      const output = log.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("Models");
      expect(output).toContain("Code to Test Ratio");
    } finally {
      log.mockRestore();
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      CodeStatistics.directories = [...DEFAULT_DIRECTORIES];
      CodeStatistics.testTypes = [...DEFAULT_TEST_TYPES];
    }
  });
});
