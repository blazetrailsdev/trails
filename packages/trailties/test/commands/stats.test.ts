import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dir, FileUtils, stdout } from "@blazetrails/ruby-compat";
import { CodeStatistics, DIRECTORIES, TEST_TYPES } from "../../lib/code-statistics.js";
import { invoke } from "../../lib/command.js";

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

async function trails(): Promise<string> {
  const write = vi.spyOn(stdout, "write").mockReturnValue(true as never);
  await invoke("stats");
  const output = write.mock.calls.map((args) => String(args[0])).join("");
  write.mockRestore();
  return output;
}

describe("Trails::Command::StatsTest", { timeout: 30_000 }, () => {
  it("`bin/trails stats` handles directories added by third parties", async () => {
    FileUtils.mkdirP("custom/dir");
    CodeStatistics.registerDirectory("Custom dir", "custom/dir");

    expect(await trails()).toMatch("Custom dir");
  });

  it("`bin/trails stats` handles non-existing directories added by third parties", async () => {
    CodeStatistics.registerDirectory("Non Existing", "app/non_existing");

    expect(await trails()).not.toMatch("Non Existing");
  });
});
