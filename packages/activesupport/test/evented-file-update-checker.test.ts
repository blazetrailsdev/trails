import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { Listen } from "@blazetrails/listen";
import { EventedFileUpdateChecker } from "../lib/evented-file-update-checker.js";

describe("EventedFileUpdateCheckerTest", () => {
  let tmpdir: string;

  beforeEach(() => {
    tmpdir = Dir.mktmpdir(null, import.meta.dirname);
  });

  afterEach(async () => {
    await Listen.stop();
    FileUtils.rmRf(tmpdir);
  });

  const wait = () => new Promise((resolve) => setTimeout(resolve, 500));

  const newChecker = async (
    files: string[] = [],
    dirs: Record<string, string | string[]> = {},
    block?: () => void,
  ) => {
    const c = await EventedFileUpdateChecker.new(files, dirs, block);
    await wait();
    return c;
  };

  const touch = async (files: string | string[]) => {
    FileUtils.touch(files);
    await wait();
  };

  // PERMANENT-SKIP: CLAUDE.md § "Runtime facts Node does not expose", the `fork` bullet.
  it.skip("notifies forked processes");

  // PERMANENT-SKIP: CLAUDE.md § "Runtime facts Node does not expose": GC.start and Thread.list.
  it.skip("can be garbage collected");

  it("should detect changes through symlink", async () => {
    const actualDir = File.join(tmpdir, "actual");
    const linkedDir = File.join(tmpdir, "linked");

    Dir.mkdir(actualDir);
    await File.symlinkAsync(actualDir, linkedDir);

    const checker = await newChecker([], { [linkedDir]: ".rb" }, () => {});

    expect(await checker.isUpdated()).toBeFalsy();

    await touch(File.join(actualDir, "a.rb"));

    expect(await checker.isUpdated()).toBeTruthy();
    expect(await checker.executeIfUpdated()).toBeTruthy();
  });

  it("updated should become true when nonexistent directory is added later", async () => {
    const watchedDir = File.join(tmpdir, "app");
    const unwatchedDir = File.join(tmpdir, "node_modules");
    const notExistWatchedDir = File.join(tmpdir, "test");

    Dir.mkdir(watchedDir);
    Dir.mkdir(unwatchedDir);

    const checker = await newChecker(
      [],
      { [watchedDir]: ".rb", [notExistWatchedDir]: ".rb" },
      () => {},
    );

    await touch(File.join(watchedDir, "a.rb"));
    expect(await checker.isUpdated()).toBeTruthy();
    expect(await checker.executeIfUpdated()).toBeTruthy();

    Dir.mkdir(notExistWatchedDir);
    await wait();
    expect(await checker.isUpdated()).toBeTruthy();
    expect(await checker.executeIfUpdated()).toBeTruthy();

    await touch(File.join(unwatchedDir, "a.rb"));
    expect(await checker.isUpdated()).toBeFalsy();
    expect(await checker.executeIfUpdated()).toBeFalsy();
  });

  it("does not stop other checkers when nonexistent directory is added later", async () => {
    const dir1 = File.join(tmpdir, "app");
    const dir2 = File.join(tmpdir, "test");

    Dir.mkdir(dir2);

    const checker1 = await newChecker([], { [dir1]: ".rb" }, () => {});
    const checker2 = await newChecker([], { [dir2]: ".rb" }, () => {});

    Dir.mkdir(dir1);

    await touch(File.join(dir1, "a.rb"));
    expect(await checker1.isUpdated()).toBeTruthy();

    expect(await checker2.isUpdated()).toBeFalsy();

    await touch(File.join(dir2, "a.rb"));
    expect(await checker2.isUpdated()).toBeTruthy();
  });
});
