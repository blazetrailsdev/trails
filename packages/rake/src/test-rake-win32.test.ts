import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RuntimeError, env as ENV, excSetBacktrace, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { captureOutput } from "./test-helpers/application.js";
import { Win32 } from "./win32.js";

const NAMES = ["APPDATA", "HOME", "HOMEDRIVE", "HOMEPATH", "RAKE_SYSTEM", "USERPROFILE"];

describe("TestRakeWin32", () => {
  let saved: Array<[string, string | undefined]>;

  beforeEach(() => {
    saved = NAMES.map((name) => [name, ENV[name]]);
  });

  afterEach(() => {
    for (const [name, value] of saved) setEnv(name, value);
  });

  it("win32 system dir uses home if defined", () => {
    setEnv("HOME", "C:\\HP");

    expect(Win32.win32SystemDir()).toBe("C:/HP/Rake");
  });

  it("win32 system dir uses homedrive homepath when no home defined", () => {
    setEnv("HOME", undefined);
    setEnv("HOMEDRIVE", "C:");
    setEnv("HOMEPATH", "\\HP");

    expect(Win32.win32SystemDir()).toBe("C:/HP/Rake");
  });

  it("win32 system dir uses appdata when no home or home combo", () => {
    setEnv("APPDATA", "C:\\Documents and Settings\\HP\\Application Data");
    setEnv("HOME", undefined);
    setEnv("HOMEDRIVE", undefined);
    setEnv("HOMEPATH", undefined);

    expect(Win32.win32SystemDir()).toBe("C:/Documents and Settings/HP/Application Data/Rake");
  });

  it("win32 system dir fallback to userprofile otherwise", () => {
    setEnv("HOME", undefined);
    setEnv("HOMEDRIVE", undefined);
    setEnv("HOMEPATH", undefined);
    setEnv("APPDATA", undefined);
    setEnv("USERPROFILE", "C:\\Documents and Settings\\HP");

    expect(Win32.win32SystemDir()).toBe("C:/Documents and Settings/HP/Rake");
  });

  it("win32 system dir nil of no env vars", () => {
    setEnv("APPDATA", undefined);
    setEnv("HOME", undefined);
    setEnv("HOMEDRIVE", undefined);
    setEnv("HOMEPATH", undefined);
    setEnv("RAKE_SYSTEM", undefined);
    setEnv("USERPROFILE", undefined);

    expect(() => Win32.win32SystemDir()).toThrow(Win32.Win32HomeError);
  });

  it("win32 backtrace with different case", async () => {
    const ex = new RuntimeError("test exception");

    excSetBacktrace(ex, ["abc", "rakefile"]);

    const rake = new Application();
    rake.options.trace = true;
    rake.rakefile = "Rakefile";

    const [, err] = await captureOutput(() => {
      rake.setDefaultOptions();

      rake.displayErrorMessage(ex);
    });

    expect(err).toMatch(/rakefile/);
  });
});
