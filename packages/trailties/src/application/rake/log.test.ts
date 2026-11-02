import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Rake } from "@blazetrails/rake";
import { Dir, File, FileUtils, rbFLoad } from "@blazetrails/ruby-compat";

describe("ApplicationTests::RakeTests::LogTest", () => {
  const originalCwd = Dir.pwd();
  let appPath: string;

  beforeEach(() => {
    appPath = Dir.mktmpdir("log-test");
    FileUtils.mkdirP(File.join(appPath, "config/environments"));
    FileUtils.mkdirP(File.join(appPath, "log"));
    Dir.chdir(appPath);
  });

  afterEach(() => {
    Dir.chdir(originalCwd);
    FileUtils.rmRf(appPath);
  });

  it("log:clear clear all environments log files by default", async () => {
    File.write("config/environments/staging.ts", "");
    File.write("config/environments/test.ts", "");

    File.write("log/staging.log", "staging");
    File.write("log/test.log", "test");
    File.write("log/dummy.log", "dummy");

    await Rake.withApplication(async (rake) => {
      await rbFLoad(File.join(import.meta.dirname, "../../tasks/log.ts"));
      await rake.lookup("log:clear")!.invoke();
    });

    expect(File.size("log/test.log")).toBe(0);
    expect(File.size("log/staging.log")).toBe(0);
    expect(File.size("log/dummy.log")).toBe(5);
  });
});
