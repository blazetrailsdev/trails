import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError, Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { FileUpdateChecker } from "../lib/file-update-checker.js";

describe("FileUpdateCheckerTest", () => {
  let tmpdir: string;
  let tmpfilesMemo: string[] | null;

  beforeEach(() => {
    tmpdir = Dir.mktmpdir(null, import.meta.dirname);
    tmpfilesMemo = null;
  });

  afterEach(() => {
    FileUtils.rmRf(tmpdir);
  });

  const tmpfile = (name: string): string => File.join(tmpdir, name);

  const tmpfiles = (): string[] =>
    (tmpfilesMemo ??= ["foo.rb", "bar.rb", "baz.rb"].map((f) => tmpfile(f)));

  const newChecker = (
    files: string[] = [],
    dirs: Record<string, string | string[]> = {},
    block?: () => void,
  ): FileUpdateChecker<void> => new FileUpdateChecker(files, dirs, block);

  const touch = async (files: string | string[]): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    FileUtils.touch(files);
  };

  const mkdir = (dirs: string): void => {
    Dir.mkdir(dirs);
  };

  const rmF = (files: string[]): void => {
    FileUtils.rmF(files);
  };

  it("should not execute the block if no paths are given", async () => {
    let i = 0;

    const checker = newChecker([], {}, () => {
      i += 1;
    });

    expect(await checker.executeIfUpdated()).toBeFalsy();
    expect(i).toBe(0);
  });

  it("should not execute the block if no files change", async () => {
    let i = 0;

    FileUtils.touch(tmpfiles());

    const checker = newChecker(tmpfiles(), {}, () => {
      i += 1;
    });

    expect(await checker.executeIfUpdated()).toBeFalsy();
    expect(i).toBe(0);
  });

  it("should execute the block once when files are created", async () => {
    let i = 0;

    const checker = newChecker(tmpfiles(), {}, () => {
      i += 1;
    });

    await touch(tmpfiles());

    expect(await checker.executeIfUpdated()).toBeTruthy();
    expect(i).toBe(1);
  });

  it("should execute the block once when files are modified", async () => {
    let i = 0;

    FileUtils.touch(tmpfiles());

    const checker = newChecker(tmpfiles(), {}, () => {
      i += 1;
    });

    await touch(tmpfiles());

    expect(await checker.executeIfUpdated()).toBeTruthy();
    expect(i).toBe(1);
  });

  it("should execute the block once when files are deleted", async () => {
    let i = 0;

    FileUtils.touch(tmpfiles());

    const checker = newChecker(tmpfiles(), {}, () => {
      i += 1;
    });

    rmF(tmpfiles());

    expect(await checker.executeIfUpdated()).toBeTruthy();
    expect(i).toBe(1);
  });

  it("updated should become true when watched files are created", async () => {
    let i = 0;

    const checker = newChecker(tmpfiles(), {}, () => {
      i += 1;
    });
    expect(checker.isUpdated()).toBeFalsy();

    await touch(tmpfiles());

    expect(checker.isUpdated()).toBeTruthy();
  });

  it("updated should become true when watched files are modified", async () => {
    let i = 0;

    FileUtils.touch(tmpfiles());

    const checker = newChecker(tmpfiles(), {}, () => {
      i += 1;
    });
    expect(checker.isUpdated()).toBeFalsy();

    await touch(tmpfiles());

    expect(checker.isUpdated()).toBeTruthy();
  });

  it("updated should become true when watched files are deleted", async () => {
    let i = 0;

    FileUtils.touch(tmpfiles());

    const checker = newChecker(tmpfiles(), {}, () => {
      i += 1;
    });
    expect(checker.isUpdated()).toBeFalsy();

    rmF(tmpfiles());

    expect(checker.isUpdated()).toBeTruthy();
  });

  it("should be robust to handle files with wrong modified time", async () => {
    let i = 0;

    FileUtils.touch(tmpfiles());

    const now = new Date();
    const time = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    FileUtils.touch(tmpfiles()[0], { mtime: time });

    const checker = newChecker(tmpfiles(), {}, () => {
      i += 1;
    });

    await touch(tmpfiles().slice(1));

    expect(await checker.executeIfUpdated()).toBeTruthy();
    expect(i).toBe(1);
  });

  it("should return max_time for files with mtime = Time.at(0)", async () => {
    let i = 0;

    FileUtils.touch(tmpfiles());

    const time = new Date(0);
    FileUtils.touch(tmpfiles()[0], { mtime: time });

    const checker = newChecker(tmpfiles(), {}, () => {
      i += 1;
    });

    await touch(tmpfiles().slice(1));

    expect(await checker.executeIfUpdated()).toBeTruthy();
    expect(i).toBe(1);
  });

  it("should cache updated result until execute", async () => {
    let i = 0;

    const checker = newChecker(tmpfiles(), {}, () => {
      i += 1;
    });
    expect(checker.isUpdated()).toBeFalsy();

    await touch(tmpfiles());

    expect(checker.isUpdated()).toBeTruthy();
    checker.execute();
    expect(checker.isUpdated()).toBeFalsy();
  });

  it("should execute the block if files change in a watched directory one extension", async () => {
    let i = 0;

    const checker = newChecker([], { [tmpdir]: "rb" }, () => {
      i += 1;
    });

    await touch(tmpfile("foo.rb"));

    expect(await checker.executeIfUpdated()).toBeTruthy();
    expect(i).toBe(1);
  });

  it("should execute the block if files change in a watched directory any extensions", async () => {
    let i = 0;

    const checker = newChecker([], { [tmpdir]: [] }, () => {
      i += 1;
    });

    await touch(tmpfile("foo.rb"));

    expect(await checker.executeIfUpdated()).toBeTruthy();
    expect(i).toBe(1);
  });

  it("should execute the block if files change in a watched directory several extensions", async () => {
    let i = 0;

    const checker = newChecker([], { [tmpdir]: ["rb", "txt"] }, () => {
      i += 1;
    });

    await touch(tmpfile("foo.rb"));

    expect(await checker.executeIfUpdated()).toBeTruthy();
    expect(i).toBe(1);

    await touch(tmpfile("foo.txt"));

    expect(await checker.executeIfUpdated()).toBeTruthy();
    expect(i).toBe(2);
  });

  it("should not execute the block if the file extension is not watched", async () => {
    let i = 0;

    const checker = newChecker([], { [tmpdir]: "txt" }, () => {
      i += 1;
    });

    await touch(tmpfile("foo.rb"));

    expect(await checker.executeIfUpdated()).toBeFalsy();
    expect(i).toBe(0);
  });

  it("does not assume files exist on instantiation", async () => {
    let i = 0;

    const nonExisting = tmpfile("non_existing.rb");
    const checker = newChecker([nonExisting], {}, () => {
      i += 1;
    });

    await touch(nonExisting);

    expect(await checker.executeIfUpdated()).toBeTruthy();
    expect(i).toBe(1);
  });

  it("detects files in new subdirectories", async () => {
    let i = 0;

    const checker = newChecker([], { [tmpdir]: "rb" }, () => {
      i += 1;
    });

    const subdir = tmpfile("subdir");
    mkdir(subdir);

    expect(await checker.executeIfUpdated()).toBeFalsy();
    expect(i).toBe(0);

    await touch(File.join(subdir, "nested.rb"));

    expect(await checker.executeIfUpdated()).toBeTruthy();
    expect(i).toBe(1);
  });

  it("looked up extensions are inherited in subdirectories not listening to them", async () => {
    let i = 0;

    const subdir = tmpfile("subdir");
    Dir.mkdir(subdir);

    const checker = newChecker([], { [tmpdir]: "rb", [subdir]: "txt" }, () => {
      i += 1;
    });

    await touch(tmpfile("new.txt"));

    expect(await checker.executeIfUpdated()).toBeFalsy();
    expect(i).toBe(0);

    await touch(File.join(subdir, "nested.rb"));

    expect(await checker.executeIfUpdated()).toBeTruthy();
    expect(i).toBe(1);

    await touch(File.join(subdir, "nested.txt"));

    expect(await checker.executeIfUpdated()).toBeTruthy();
    expect(i).toBe(2);
  });

  it("initialize raises an ArgumentError if no block given", () => {
    expect(() => newChecker([])).toThrow(ArgumentError);
  });
});
