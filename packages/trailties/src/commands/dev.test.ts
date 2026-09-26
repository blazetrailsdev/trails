import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Dir, File, FileUtils, chdir, stdout } from "@blazetrails/ruby-compat";
import { devCommand } from "./dev.js";

let appPath: string;
let originalCwd: string;

beforeEach(() => {
  appPath = Dir.mktmpdir("trails-dev-");
  originalCwd = Dir.pwd();
  chdir(appPath);
});

afterEach(() => {
  chdir(originalCwd);
  FileUtils.rmRf(appPath);
});

function appFile(path: string, contents: string): void {
  FileUtils.mkdirP(File.dirname(path));
  File.write(path, contents);
  FileUtils.touch(path, { mtime: new Date(Date.now() - 60_000) });
}

async function runDevCacheCommand(): Promise<string> {
  const write = vi.spyOn(stdout, "write").mockReturnValue(true as never);
  await devCommand().parseAsync(["cache"], { from: "user" });
  const output = write.mock.calls.map((args) => String(args[0])).join("");
  write.mockRestore();
  return output;
}

describe("Rails::Command::DevTest", () => {
  it("`bin/rails dev:cache` creates both caching and restart file when restart file doesn't exist and dev caching is currently off", async () => {
    expect(File.isExist("tmp/caching-dev.txt")).toBeFalsy();
    expect(File.isExist("tmp/restart.txt")).toBeFalsy();

    expect(await runDevCacheCommand()).toBe(
      "Action Controller caching enabled for development mode.\n",
    );

    expect(File.isExist("tmp/caching-dev.txt")).toBeTruthy();
    expect(File.isExist("tmp/restart.txt")).toBeTruthy();
  });

  it("`bin/rails dev:cache` creates caching file and touches restart file when dev caching is currently off", async () => {
    appFile("tmp/restart.txt", "");

    expect(File.isExist("tmp/caching-dev.txt")).toBeFalsy();
    expect(File.isExist("tmp/restart.txt")).toBeTruthy();
    const restartFileTimeBefore = File.mtime("tmp/restart.txt");

    expect(await runDevCacheCommand()).toBe(
      "Action Controller caching enabled for development mode.\n",
    );

    expect(File.isExist("tmp/caching-dev.txt")).toBeTruthy();
    const restartFileTimeAfter = File.mtime("tmp/restart.txt");
    expect(restartFileTimeBefore.getTime()).toBeLessThan(restartFileTimeAfter.getTime());
  });

  it("`bin/rails dev:cache` removes caching file and touches restart file when dev caching is currently on", async () => {
    appFile("tmp/caching-dev.txt", "");
    appFile("tmp/restart.txt", "");

    expect(File.isExist("tmp/caching-dev.txt")).toBeTruthy();
    expect(File.isExist("tmp/restart.txt")).toBeTruthy();
    const restartFileTimeBefore = File.mtime("tmp/restart.txt");

    expect(await runDevCacheCommand()).toBe(
      "Action Controller caching disabled for development mode.\n",
    );

    expect(File.isExist("tmp/caching-dev.txt")).toBeFalsy();
    const restartFileTimeAfter = File.mtime("tmp/restart.txt");
    expect(restartFileTimeBefore.getTime()).toBeLessThan(restartFileTimeAfter.getTime());
  });
});
