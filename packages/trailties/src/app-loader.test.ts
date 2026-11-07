import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { AppLoader } from "./app-loader.js";

describe("AppLoaderTest", () => {
  let loader: typeof AppLoader & { execArguments?: string[] };
  let tmp: string;
  let cwd: string;

  const write = (filename: string, contents = "") => {
    FileUtils.mkdirP(File.dirname(filename));
    File.write(filename, contents);
  };

  const expectsExec = (exe: string) => {
    expect(loader.execArguments).toEqual([AppLoader.RUBY, exe]);
  };

  beforeEach(() => {
    loader = Object.create(AppLoader);
    loader.exec = (...args: string[]) => {
      loader.execArguments = args;
    };
    tmp = Dir.mktmpdir("railties-rails-loader-test-suite");
    cwd = Dir.pwd();
    Dir.chdir(tmp);
  });

  afterEach(() => {
    Dir.chdir(cwd);
    FileUtils.rmRf(tmp);
  });

  const exe = "bin/trails";

  it(`is not in a Rails application if ${exe} is not found in the current or parent directories`, () => {
    expect(loader.execApp()).toBeFalsy();
  });

  it(`is not in a Rails application if ${exe} exists but is a folder`, () => {
    FileUtils.mkdirP(exe);

    expect(loader.execApp()).toBeFalsy();
  });

  for (const keyword of ["setAppPath", "setEnginePath"]) {
    it(`is in a Rails application if ${exe} exists and contains ${keyword}`, () => {
      write(exe, keyword);

      loader.execApp();

      expectsExec(exe);
    });

    it(`is not in a Rails application if ${exe} exists but doesn't contain ${keyword}`, () => {
      write(exe);

      expect(loader.execApp()).toBeFalsy();
    });

    it(`is in a Rails application if parent directory has ${exe} containing ${keyword} and chdirs to the root directory`, () => {
      write(`foo/bar/${exe}`);
      write(`foo/${exe}`, keyword);

      Dir.chdir("foo/bar");

      loader.execApp();

      expectsExec(exe);

      expect(File.realpath(Dir.pwd())).toBe(File.realpath(`${tmp}/foo`));
    });
  }
});
