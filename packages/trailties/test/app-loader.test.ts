import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dir, File, FileUtils, exec } from "@blazetrails/ruby-compat";
import { AppLoader } from "../lib/app-loader.js";

vi.mock("@blazetrails/ruby-compat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@blazetrails/ruby-compat")>()),
  exec: vi.fn(),
}));

describe("AppLoaderTest", () => {
  const loader = AppLoader;
  let tmp: string;
  let cwd: string;

  const write = (filename: string, contents = "") => {
    FileUtils.mkdirP(File.dirname(filename));
    File.write(filename, contents);
  };

  const expectsExec = (exe: string) => {
    expect(vi.mocked(exec).mock.lastCall).toEqual([AppLoader.RUBY, exe]);
  };

  beforeEach(() => {
    vi.mocked(exec).mockClear();
    tmp = Dir.mktmpdir("railties-rails-loader-test-suite");
    cwd = Dir.pwd();
    Dir.chdir(tmp);
  });

  afterEach(() => {
    Dir.chdir(cwd);
    FileUtils.rmRf(tmp);
  });

  for (const scriptDir of ["bin", "script"]) {
    const exe = `${scriptDir}/trails`;

    it(`is not in a Rails application if ${exe} is not found in the current or parent directories`, () => {
      expect(loader.execApp()).toBeFalsy();
    });

    it(`is not in a Rails application if ${exe} exists but is a folder`, () => {
      FileUtils.mkdirP(exe);

      expect(loader.execApp()).toBeFalsy();
    });

    for (const keyword of ["APP_PATH", "ENGINE_PATH"]) {
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
  }
});
