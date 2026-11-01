import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dir, FileUtils, stdout } from "@blazetrails/ruby-compat";
import { CodeStatistics, DIRECTORIES, TEST_TYPES } from "../code-statistics.js";
import { invoke } from "../command.js";

let appPath: string;
let originalCwd: string;

beforeEach(() => {
  appPath = Dir.mktmpdir("trails-stats-");
  originalCwd = Dir.pwd();
  Dir.chdir(appPath);
  CodeStatistics.directories = [...DIRECTORIES];
  CodeStatistics.testTypes = [...TEST_TYPES];
});

afterEach(() => {
  Dir.chdir(originalCwd);
  FileUtils.rmRf(appPath);
  CodeStatistics.directories = [...DIRECTORIES];
  CodeStatistics.testTypes = [...TEST_TYPES];
});

async function rails(): Promise<string> {
  const write = vi.spyOn(stdout, "write").mockReturnValue(true as never);
  await invoke("stats");
  const output = write.mock.calls.map((args) => String(args[0])).join("");
  write.mockRestore();
  return output;
}

describe("Rails::Command::StatsTest", { timeout: 30_000 }, () => {
  it("`bin/rails stats` handles directories added by third parties", async () => {
    FileUtils.mkdirP("custom/dir");
    CodeStatistics.registerDirectory("Custom dir", "custom/dir");

    expect(await rails()).toMatch("Custom dir");
  });

  it("`bin/rails stats` handles non-existing directories added by third parties", async () => {
    CodeStatistics.registerDirectory("Non Existing", "app/non_existing");

    expect(await rails()).not.toMatch("Non Existing");
  });
});
