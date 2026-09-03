import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { ArgumentError } from "./argument-error.js";
import { FileUtils } from "./file-utils.js";

describe("FileUtils", () => {
  let root: string;

  beforeEach(() => {
    root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "file-utils-"));
  });

  afterEach(() => {
    nodeFs.rmSync(root, { recursive: true, force: true });
  });

  it("mkdir_p creates every missing intermediate directory", () => {
    const deep = nodePath.join(root, "a", "b", "c");

    expect(FileUtils.mkdirP(deep)).toEqual([deep]);
    expect(nodeFs.statSync(deep).isDirectory()).toBe(true);
  });

  it("mkdir_p is a no-op when the directory already exists", () => {
    FileUtils.mkdirP(nodePath.join(root, "a"));

    expect(() => FileUtils.mkdirP(nodePath.join(root, "a"))).not.toThrow();
  });

  it("makedirs is an alias for mkdir_p", () => {
    expect(FileUtils.makedirs).toBe(FileUtils.mkdirP);
  });

  it("touch creates the file", () => {
    const file = nodePath.join(root, "stamp");

    FileUtils.touch(file);

    expect(nodeFs.existsSync(file)).toBe(true);
  });

  it("touch updates the mtime of an existing file", () => {
    const file = nodePath.join(root, "stamp");
    nodeFs.writeFileSync(file, "");
    const mtime = new Date(Date.UTC(2001, 1, 3, 4, 5, 6));

    FileUtils.touch(file, { mtime });

    expect(nodeFs.statSync(file).mtime.getTime()).toEqual(mtime.getTime());
  });

  it("touch with nocreate raises rather than creating the file", () => {
    const file = nodePath.join(root, "absent");

    expect(() => FileUtils.touch(file, { nocreate: true })).toThrow();
    expect(nodeFs.existsSync(file)).toBe(false);
  });

  it("rm removes each path in the list and raises on a missing one", () => {
    const first = nodePath.join(root, "first");
    const second = nodePath.join(root, "second");
    FileUtils.touch([first, second]);

    FileUtils.rm([first, second]);

    expect(nodeFs.existsSync(first)).toBe(false);
    expect(() => FileUtils.rm(first)).toThrow();
  });

  it("rm_f swallows a missing path", () => {
    expect(() => FileUtils.rmF([nodePath.join(root, "gone")])).not.toThrow();
  });

  it("rm_r removes a directory tree", () => {
    const tree = nodePath.join(root, "tree", "leaf");
    FileUtils.mkdirP(tree);
    FileUtils.touch(nodePath.join(tree, "file"));

    FileUtils.rmR(nodePath.join(root, "tree"));

    expect(nodeFs.existsSync(nodePath.join(root, "tree"))).toBe(false);
  });

  it("cp copies the file's contents", () => {
    const src = nodePath.join(root, "src");
    const dest = nodePath.join(root, "dest");
    nodeFs.writeFileSync(src, "contents");

    FileUtils.cp(src, dest);

    expect(nodeFs.readFileSync(dest, "utf-8")).toEqual("contents");
  });

  it("cp raises ArgumentError when source and destination are the same file", () => {
    const src = nodePath.join(root, "src");
    nodeFs.writeFileSync(src, "contents");

    expect(() => FileUtils.cp(src, src)).toThrow(ArgumentError);
  });

  it("mv renames the file", () => {
    const src = nodePath.join(root, "src");
    const dest = nodePath.join(root, "dest");
    nodeFs.writeFileSync(src, "contents");

    FileUtils.mv(src, dest);

    expect(nodeFs.existsSync(src)).toBe(false);
    expect(nodeFs.readFileSync(dest, "utf-8")).toEqual("contents");
  });

  it("noop returns without touching the filesystem", () => {
    const file = nodePath.join(root, "untouched");

    FileUtils.touch(file, { noop: true });
    FileUtils.mkdirP(nodePath.join(root, "unmade"), { noop: true });

    expect(nodeFs.existsSync(file)).toBe(false);
    expect(nodeFs.existsSync(nodePath.join(root, "unmade"))).toBe(false);
  });
});
