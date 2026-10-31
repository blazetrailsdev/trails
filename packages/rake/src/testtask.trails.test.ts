import { Dir, File, LOAD_PATH, SignalException, rbArgv, rbFLoad } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { FileUtils } from "./file-utils.js";
import { Rake } from "./rake-module.js";
import { useApplicationTestCase } from "./test-helpers/application.js";
import { TestTask } from "./testtask.js";

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
    rbArgv().splice(0, rbArgv().length, `-Ilib${File.PATH_SEPARATOR}test`, "-v");
    const loaded = LOAD_PATH.length;
    try {
      await rbFLoad(new URL("./rake-test-loader.ts", import.meta.url).pathname);
      expect(LOAD_PATH.slice(loaded)).toEqual([
        File.expandPath("lib", Dir.pwd()),
        File.expandPath("test", Dir.pwd()),
      ]);
      expect(rbArgv()).toEqual(["-v"]);
    } finally {
      LOAD_PATH.length = loaded;
      rbArgv().splice(0, rbArgv().length, ...argv);
    }
  });
});
