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

  it("rm_r under force removes the rest of the tree past an unremovable entry", () => {
    const tree = nodePath.join(root, "tree");
    const stuck = nodePath.join(tree, "stuck");
    const sibling = nodePath.join(tree, "sibling");
    FileUtils.mkdirP(stuck);
    FileUtils.touch(nodePath.join(stuck, "child"));
    FileUtils.touch(sibling);
    nodeFs.chmodSync(stuck, 0o500);

    FileUtils.rmR(tree, { force: true });

    nodeFs.chmodSync(stuck, 0o700);
    expect(nodeFs.existsSync(sibling)).toBe(false);
  });

  it("rm_r does not descend through a symlink to a directory", () => {
    const outside = nodePath.join(root, "outside");
    FileUtils.mkdirP(outside);
    FileUtils.touch(nodePath.join(outside, "keep"));
    const tree = nodePath.join(root, "tree");
    FileUtils.mkdirP(tree);
    nodeFs.symlinkSync(outside, nodePath.join(tree, "link"));

    FileUtils.rmR(tree);

    expect(nodeFs.existsSync(tree)).toBe(false);
    expect(nodeFs.existsSync(nodePath.join(outside, "keep"))).toBe(true);
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

  it("cp with preserve copies the mtime and the mode", () => {
    const src = nodePath.join(root, "src");
    const dest = nodePath.join(root, "dest");
    nodeFs.writeFileSync(src, "contents", { mode: 0o640 });
    const mtime = new Date(Date.UTC(2001, 1, 3, 4, 5, 6));
    nodeFs.utimesSync(src, mtime, mtime);

    FileUtils.cp(src, dest, { preserve: true });

    expect(nodeFs.statSync(dest).mtime.getTime()).toEqual(mtime.getTime());
    expect(nodeFs.statSync(dest).mode & 0o777).toEqual(0o640);
  });

  it("copy_file copies the file's contents", () => {
    const src = nodePath.join(root, "src");
    const dest = nodePath.join(root, "dest");
    nodeFs.writeFileSync(src, "contents");

    FileUtils.copyFile(src, dest);

    expect(nodeFs.readFileSync(dest, "utf-8")).toEqual("contents");
  });

  it("copy_file with preserve copies the mtime and the mode", () => {
    const src = nodePath.join(root, "src");
    const dest = nodePath.join(root, "dest");
    nodeFs.writeFileSync(src, "contents", { mode: 0o640 });
    const mtime = new Date(Date.UTC(2001, 1, 3, 4, 5, 6));
    nodeFs.utimesSync(src, mtime, mtime);

    FileUtils.copyFile(src, dest, true);

    expect(nodeFs.statSync(dest).mtime.getTime()).toEqual(mtime.getTime());
    expect(nodeFs.statSync(dest).mode & 0o777).toEqual(0o640);
  });

  it("mv raises an EEXIST-coded error when the destination is a directory", () => {
    const src = nodePath.join(root, "src");
    const dest = nodePath.join(root, "dest");
    nodeFs.writeFileSync(src, "contents");
    FileUtils.mkdirP(nodePath.join(dest, "src"));

    expect(() => FileUtils.mv(src, dest)).toThrow(expect.objectContaining({ code: "EEXIST" }));
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
