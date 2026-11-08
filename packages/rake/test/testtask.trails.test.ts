import { Dir, File, LOAD_PATH, SignalException, rbArgv, rbFLoad } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { FileUtils } from "../lib/file-utils.js";
import { Rake } from "../lib/rake-module.js";
import { useApplicationTestCase } from "./support/application.js";
import { TestTask } from "../lib/testtask.js";

describe("TestTask", () => {
  useApplicationTestCase();

  it("raises SignalException when the test process is killed by a signal", async () => {
    new TestTask();
    const ruby = FileUtils.RUBY;
    FileUtils.RUBY = "kill -TERM $$ #";
    try {
      await expect(Rake.application!.lookup("test")!.invoke()).rejects.toThrow(SignalException);
    } finally {
      FileUtils.RUBY = ruby;
    }
  });

  it("puts the -I libs on LOAD_PATH before the loader's test files load", async () => {
    const argv = [...rbArgv()];
    rbArgv().splice(0, rbArgv().length, `-Ilib${File.PATH_SEPARATOR}test`, "-v", "-Irunner");
    const existing = [...LOAD_PATH];
    LOAD_PATH.push("/existing");
    try {
      await rbFLoad(new URL("../lib/rake-test-loader.ts", import.meta.url).pathname);
      expect(LOAD_PATH.slice(0, 2)).toEqual([
        File.expandPath("lib", Dir.pwd()),
        File.expandPath("test", Dir.pwd()),
      ]);
      expect(LOAD_PATH.at(-1)).toBe("/existing");
      expect(rbArgv()).toEqual(["-v", "-Irunner"]);
    } finally {
      LOAD_PATH.splice(0, LOAD_PATH.length, ...existing);
      rbArgv().splice(0, rbArgv().length, ...argv);
    }
  });
});
