import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dir, File, FileUtils as StdlibFileUtils } from "@blazetrails/ruby-compat";
import { FileUtilsExt } from "./rake.js";

describe("FileUtilsExt remaining commands", () => {
  let origPwd: string;
  let tempdir: string;
  let lines: string[];

  beforeEach(() => {
    origPwd = Dir.pwd();
    tempdir = Dir.mktmpdir("test_rake_ext_");
    Dir.chdir(tempdir);
    lines = [];
    StdlibFileUtils.fileutilsOutput = { puts: (msg) => lines.push(msg) };
    FileUtilsExt.verboseFlag = false;
    FileUtilsExt.nowriteFlag = false;
  });

  afterEach(async () => {
    StdlibFileUtils.fileutilsOutput = undefined;
    FileUtilsExt.verboseFlag = FileUtilsExt.DEFAULT;
    Dir.chdir(origPwd);
    await StdlibFileUtils.rmRfAsync(tempdir);
  });

  it("nowrite_flag defaults noop on every wrapper", async () => {
    FileUtilsExt.nowriteFlag = true;
    await FileUtilsExt.touch("a");
    await FileUtilsExt.mkdir("d");
    await FileUtilsExt.lnS("a", "s");
    expect(await File.isExistAsync("a")).toBe(false);
    expect(await File.isExistAsync("d")).toBe(false);
    expect(await File.isSymlinkAsync("s")).toBe(false);
  });

  it("the DEFAULT verbose_flag is truthy, so a wrapper echoes", async () => {
    FileUtilsExt.verboseFlag = FileUtilsExt.DEFAULT;
    await FileUtilsExt.touch("a");
    await FileUtilsExt.mv("a", "b");
    expect(lines).toEqual(["touch a", "mv a b"]);
  });

  it("an explicit option wins over the flags", async () => {
    FileUtilsExt.nowriteFlag = true;
    await FileUtilsExt.touch("a", { noop: false });
    FileUtilsExt.verboseFlag = true;
    await FileUtilsExt.rm("a", { noop: false, verbose: false });
    expect(lines).toEqual([]);
    expect(await File.isExistAsync("a")).toBe(false);
  });

  it("wraps ln_sr, cp_lr, install and chown", async () => {
    FileUtilsExt.nowriteFlag = true;
    FileUtilsExt.verboseFlag = true;
    await FileUtilsExt.lnSr("a", "s");
    await FileUtilsExt.cpLr("a", "b");
    await FileUtilsExt.install("a", "c", { mode: 0o755 });
    await FileUtilsExt.chown(1, 2, "a");
    await FileUtilsExt.chownR(1, null, "a");
    expect(lines).toEqual([
      "ln -s a s",
      "cp -lr a b",
      "install -c -m 755 a c",
      "chown 1:2 a",
      "chown -R 1 a",
    ]);
  });

  it("cd defaults verbose only", () => {
    FileUtilsExt.verboseFlag = true;
    expect(FileUtilsExt.cd(".", () => 1)).toBe(1);
    expect(lines).toEqual(["cd .", "cd -"]);
  });
});
