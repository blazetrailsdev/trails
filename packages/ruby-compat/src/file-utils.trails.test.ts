import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { ArgumentError } from "./argument-error.js";
import { Dir } from "./dir.js";
import { TypeError } from "./type-error.js";
import { FileUtils } from "./file-utils.js";
import { fsAdapterConfig, getFs, getPath, registerFsAdapter } from "./fs-adapter.js";

/** Forces `mv`'s cross-device fallback (`vendor/ruby/v3.3.11/lib/fileutils.rb:1170-1173`). */
function registerExdevFs(): void {
  const fs = getFs();
  registerFsAdapter(
    "exdev",
    Object.assign(Object.create(fs) as typeof fs, {
      renameSync: () => {
        const error: Error & { code?: string } = new Error("EXDEV");
        error.code = "EXDEV";
        throw error;
      },
    }),
    getPath(),
  );
  fsAdapterConfig.adapter = "exdev";
}

/**
 * Answers `predicate` for every `lstat`, so `Entry_#copy`'s arms after
 * `symlink?` (`vendor/ruby/v3.3.11/lib/fileutils.rb:2255-2273`) can be reached against
 * a backend no test can make a real device, socket or door on.
 */
function registerSpecialLstatFs(predicate: string): void {
  const fs = getFs();
  registerFsAdapter(
    "special",
    Object.assign(Object.create(fs) as typeof fs, {
      lstatSync: (path: string) =>
        Object.assign(Object.create(nodeFs.lstatSync(path)) as nodeFs.Stats, {
          isFile: () => false,
          [predicate]: () => true,
        }),
    }),
    getPath(),
  );
  fsAdapterConfig.adapter = "special";
}

describe("FileUtils", () => {
  let root: string;

  beforeEach(() => {
    root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "file-utils-"));
  });

  afterEach(() => {
    fsAdapterConfig.adapter = null;
    FileUtils.fileutilsOutput = undefined;
    FileUtils.fileutilsLabel = undefined;
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

  it("remove_entry unlinks a symlink to a directory rather than descending into it", () => {
    // vendor/ruby/v3.3.11/lib/fileutils.rb:2192-2198 Entry_#lstat is File.lstat unless dereference?.
    const outside = nodePath.join(root, "outside");
    FileUtils.mkdirP(outside);
    FileUtils.touch(nodePath.join(outside, "keep"));
    const link = nodePath.join(root, "link");
    nodeFs.symlinkSync(outside, link);

    FileUtils.removeEntry(link);

    expect(nodeFs.existsSync(link)).toBe(false);
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

  it("copy_file creates the destination with the source's mode, without preserve", () => {
    const src = nodePath.join(root, "src");
    const dest = nodePath.join(root, "dest");
    nodeFs.writeFileSync(src, "contents");
    nodeFs.chmodSync(src, 0o755);

    FileUtils.copyFile(src, dest);

    expect(nodeFs.statSync(dest).mode & 0o777).toEqual(0o755);
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

  it("rm_rf removes a whole tree without raising on a missing path", () => {
    const tree = nodePath.join(root, "tree");
    FileUtils.mkdirP(nodePath.join(tree, "nested"));
    nodeFs.writeFileSync(nodePath.join(tree, "nested", "file"), "contents");

    FileUtils.rmRf(tree);
    FileUtils.rmRf(nodePath.join(root, "never-existed"));

    expect(nodeFs.existsSync(tree)).toBe(false);
  });

  it("copy_file preserves the source atime as well as its mtime", () => {
    const src = nodePath.join(root, "src");
    const dest = nodePath.join(root, "dest");
    nodeFs.writeFileSync(src, "contents");
    const mtime = new Date(Date.UTC(2002, 3, 5, 6, 7, 8));
    nodeFs.utimesSync(src, new Date(Date.UTC(2001, 1, 3, 4, 5, 6)), mtime);

    FileUtils.copyFile(src, dest, true);

    const srcStat = nodeFs.statSync(src);
    expect(srcStat.atime.getTime()).not.toEqual(mtime.getTime());
    expect(nodeFs.statSync(dest).atime.getTime()).toEqual(srcStat.atime.getTime());
    expect(nodeFs.statSync(dest).mtime.getTime()).toEqual(mtime.getTime());
  });

  it("copy_entry copies a symlink as a symlink and preserves its metadata", () => {
    const target = nodePath.join(root, "target");
    const src = nodePath.join(root, "link");
    const dest = nodePath.join(root, "copy");
    nodeFs.writeFileSync(target, "contents");
    nodeFs.symlinkSync(target, src);
    registerExdevFs();

    FileUtils.mv(src, dest, { force: true });

    expect(nodeFs.lstatSync(dest).isSymbolicLink()).toBe(true);
    expect(nodeFs.readlinkSync(dest)).toEqual(target);
  });

  it("copy_entry copies the target of a symlinked root under dereference_root", () => {
    const target = nodePath.join(root, "target");
    const src = nodePath.join(root, "link");
    const dest = nodePath.join(root, "copy");
    nodeFs.writeFileSync(target, "contents");
    nodeFs.symlinkSync(target, src);

    FileUtils.copyEntry(src, dest, false, true);

    expect(nodeFs.lstatSync(dest).isSymbolicLink()).toBe(false);
    expect(nodeFs.readFileSync(dest, "utf-8")).toEqual("contents");
  });

  it("copy_entry unlinks an existing destination file under remove_destination", () => {
    const src = nodePath.join(root, "src");
    const dest = nodePath.join(root, "dest");
    nodeFs.writeFileSync(src, "new");
    nodeFs.writeFileSync(dest, "old");

    FileUtils.copyEntry(src, dest, false, false, true);

    expect(nodeFs.readFileSync(dest, "utf-8")).toEqual("new");
  });

  it("copy_entry unlinks an existing destination symlink under remove_destination", () => {
    const src = nodePath.join(root, "src");
    const other = nodePath.join(root, "other");
    const dest = nodePath.join(root, "dest");
    nodeFs.writeFileSync(src, "new");
    nodeFs.writeFileSync(other, "old");
    nodeFs.symlinkSync(other, dest);

    FileUtils.copyEntry(src, dest, false, false, true);

    expect(nodeFs.lstatSync(dest).isSymbolicLink()).toBe(false);
    expect(nodeFs.readFileSync(dest, "utf-8")).toEqual("new");
    expect(nodeFs.readFileSync(other, "utf-8")).toEqual("old");
  });

  it("copy_entry refuses to copy a directory into its own descendant", () => {
    const src = nodePath.join(root, "dir");
    const dest = nodePath.join(src, "under");
    nodeFs.mkdirSync(src);
    registerExdevFs();

    expect(() => FileUtils.mv(src, dest)).toThrow(ArgumentError);
    expect(() => FileUtils.mv(src, dest)).toThrow(`cannot copy directory ${src} to itself ${dest}`);
  });

  it("copy_entry creates one directory level, so a missing parent raises", () => {
    const src = nodePath.join(root, "dir");
    const dest = nodePath.join(root, "missing", "copy");
    nodeFs.mkdirSync(src);
    registerExdevFs();

    expect(() => FileUtils.mv(src, dest)).toThrow(/ENOENT/);
  });

  it("copy_entry keeps an already-existing destination directory", () => {
    const src = nodePath.join(root, "dir");
    const dest = nodePath.join(root, "copy");
    nodeFs.mkdirSync(src);
    nodeFs.writeFileSync(nodePath.join(src, "file"), "contents");
    nodeFs.mkdirSync(dest);

    FileUtils.copyEntry(src, dest);

    expect(nodeFs.readFileSync(nodePath.join(dest, "file"), "utf-8")).toEqual("contents");
  });

  it("copy_entry applies a directory's metadata after its children are written", () => {
    const src = nodePath.join(root, "dir");
    const dest = nodePath.join(root, "copy");
    nodeFs.mkdirSync(src);
    nodeFs.mkdirSync(nodePath.join(src, "nested"));
    nodeFs.writeFileSync(nodePath.join(src, "nested", "file"), "contents");
    const mtime = new Date(Date.UTC(2002, 3, 5, 6, 7, 8));
    nodeFs.utimesSync(nodePath.join(src, "nested"), mtime, mtime);
    nodeFs.utimesSync(src, mtime, mtime);

    FileUtils.copyEntry(src, dest, true);

    expect(nodeFs.statSync(dest).mtime.getTime()).toEqual(mtime.getTime());
    expect(nodeFs.statSync(nodePath.join(dest, "nested")).mtime.getTime()).toEqual(mtime.getTime());
  });

  it.each([
    ["a device file", "isCharacterDevice", "cannot handle device file"],
    ["a device file", "isBlockDevice", "cannot handle device file"],
    ["a socket", "isSocket", "cannot handle socket"],
    ["a FIFO", "isFIFO", "cannot handle FIFO"],
    ["an unknown file type", "isDoor", "unknown file type"],
  ])("copy_entry reports %s it cannot handle", (_what, predicate, message) => {
    const src = nodePath.join(root, "special");
    const dest = nodePath.join(root, "copy");
    nodeFs.writeFileSync(src, "");
    registerExdevFs();
    registerSpecialLstatFs(predicate);

    expect(() => FileUtils.mv(src, dest)).toThrow(message);
  });

  it("verbose prints the command line to the configured output", () => {
    const lines: string[] = [];
    FileUtils.fileutilsOutput = { puts: (msg) => lines.push(msg) };
    const dir = nodePath.join(root, "verbose");
    const file = nodePath.join(dir, "file");
    FileUtils.mkdirP(dir, { verbose: true });
    nodeFs.writeFileSync(file, "contents");
    FileUtils.rm(file, { verbose: true });
    FileUtils.rmF(file, { verbose: true });
    FileUtils.mkdirP(dir, { mode: 0o755, verbose: true });

    expect(lines).toEqual([
      `mkdir -p ${dir}`,
      `rm ${file}`,
      `rm -f ${file}`,
      `mkdir -p -m 755 ${dir}`,
    ]);
  });

  it("verbose prefixes every message with the configured label", () => {
    const lines: string[] = [];
    FileUtils.fileutilsOutput = { puts: (msg) => lines.push(msg) };
    FileUtils.fileutilsLabel = "** ";
    const tree = nodePath.join(root, "labelled");
    FileUtils.mkdirP(tree);

    FileUtils.rmRf(tree, { verbose: true });

    expect(lines).toEqual([`** rm -rf ${tree}`]);
  });

  it("cd without a block changes directory and answers 0", () => {
    const start = Dir.pwd();
    const dir = nodeFs.realpathSync(root);
    try {
      expect(FileUtils.cd(dir)).toBe(0);
      expect(Dir.pwd()).toBe(dir);
    } finally {
      Dir.chdir(start);
    }
  });

  it("cd with a block restores the directory and answers the block's value", () => {
    const start = Dir.pwd();
    const dir = nodeFs.realpathSync(root);

    expect(FileUtils.cd(dir, {}, (d) => [d, Dir.pwd()])).toEqual([dir, dir]);
    expect(Dir.pwd()).toBe(start);
  });

  it("cd with an async block restores the directory only once the block settles", async () => {
    const start = Dir.pwd();
    const dir = nodeFs.realpathSync(root);

    const result = FileUtils.cd(dir, {}, async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return Dir.pwd();
    });

    expect(Dir.pwd()).toBe(dir);
    await expect(result).resolves.toBe(dir);
    expect(Dir.pwd()).toBe(start);
  });

  it("cd with an async block that rejects still restores the directory", async () => {
    const start = Dir.pwd();
    const dir = nodeFs.realpathSync(root);

    const result = FileUtils.cd(dir, {}, async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      throw new Error("boom");
    });

    await expect(result).rejects.toThrow("boom");
    expect(Dir.pwd()).toBe(start);
  });

  it("cd with a block that raises restores the directory", () => {
    const start = Dir.pwd();

    expect(() =>
      FileUtils.cd(root, {}, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(Dir.pwd()).toBe(start);
  });

  it("cd with verbose prints cd and, after an async block settles, cd -", async () => {
    const lines: string[] = [];
    FileUtils.fileutilsOutput = { puts: (msg) => lines.push(msg) };

    const result = FileUtils.cd(root, { verbose: true }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      lines.push("block");
    });
    expect(lines).toEqual([`cd ${root}`]);
    await result;

    expect(lines).toEqual([`cd ${root}`, "block", "cd -"]);
  });

  it("cd takes a block with no options", () => {
    const start = Dir.pwd();
    const dir = nodeFs.realpathSync(root);

    expect(FileUtils.cd(dir, () => Dir.pwd())).toBe(dir);
    expect(Dir.pwd()).toBe(start);
  });

  it("Dir.chdir raises TypeError for a given nil", () => {
    expect(() => Dir.chdir(null as unknown as string)).toThrow(
      new TypeError("no implicit conversion of nil into String"),
    );
  });

  function useFs(name: string, overrides: object): void {
    const fs = getFs();
    registerFsAdapter(name, Object.assign(Object.create(fs) as typeof fs, overrides), getPath());
    fsAdapterConfig.adapter = name;
  }

  function makeTree(): { tree: string; file: string } {
    const tree = nodePath.join(root, "tree");
    const file = nodePath.join(tree, "sub", "f");
    nodeFs.mkdirSync(nodePath.join(tree, "sub"), { recursive: true });
    nodeFs.writeFileSync(file, "x");
    return { tree, file };
  }

  const modeOf = (path: string): number => nodeFs.statSync(path).mode & 0o777;
  const failing = (code: string) => () => Promise.reject(Object.assign(new Error(code), { code }));

  it("rm_r awaited removes a tree, raises ENOENT for a missing path unless forced, and prints rm -r", async () => {
    const lines: string[] = [];
    FileUtils.fileutilsOutput = { puts: (msg) => lines.push(msg) };
    const { tree } = makeTree();
    const missing = nodePath.join(root, "missing");

    await expect(FileUtils.rmRAsync(missing)).rejects.toThrow(/ENOENT/);
    expect(await FileUtils.rmRAsync(tree, { noop: true, verbose: true })).toBeUndefined();
    expect(nodeFs.existsSync(tree)).toBe(true);
    expect(await FileUtils.rmRfAsync([tree, missing], { verbose: true })).toEqual([tree, missing]);
    expect(nodeFs.existsSync(tree)).toBe(false);
    expect(lines).toEqual([`rm -r ${tree}`, `rm -rf ${tree} ${missing}`]);
  });

  it("rm_rf awaited removes what it can beneath an entry it cannot", async () => {
    const { tree, file } = makeTree();
    nodeFs.writeFileSync(nodePath.join(tree, "gone"), "x");
    const unlink = getFs().unlink!;
    useFs("eperm", {
      unlink: (path: string) => (path === file ? failing("EPERM")() : unlink(path)),
    });

    await expect(FileUtils.rmRAsync(tree)).rejects.toThrow("EPERM");
    expect(await FileUtils.rmRfAsync(tree)).toEqual([tree]);
    expect(nodeFs.readdirSync(tree)).toEqual(["sub"]);
  });

  it("chmod_R sets the mode on every entry beneath the root and leaves a symlink alone", async () => {
    const lines: string[] = [];
    FileUtils.fileutilsOutput = { puts: (msg) => lines.push(msg) };
    const { tree, file } = makeTree();
    const outside = nodePath.join(root, "outside");
    const missing = nodePath.join(root, "missing");
    nodeFs.writeFileSync(outside, "x");
    nodeFs.chmodSync(outside, 0o600);
    nodeFs.symlinkSync(outside, nodePath.join(tree, "link"));

    expect(await FileUtils.chmodRAsync(0o700, tree, { noop: true })).toBeUndefined();
    expect(modeOf(file)).not.toBe(0o700);
    expect(await FileUtils.chmodRAsync(0o755, tree, { verbose: true })).toEqual([tree]);
    expect([tree, nodePath.join(tree, "sub"), file].map(modeOf)).toEqual([0o755, 0o755, 0o755]);
    expect(modeOf(outside)).toBe(0o600);
    expect(lines).toEqual([`chmod -R 755 ${tree}`]);
    await expect(FileUtils.chmodRAsync(0o755, missing)).rejects.toThrow(/ENOENT/);
    expect(await FileUtils.chmodRAsync(0o755, missing, { force: true })).toEqual([missing]);
  });

  it("chmod_R swallows EOPNOTSUPP without force, and any failure under it", async () => {
    const { file } = makeTree();

    useFs("eopnotsupp", { chmod: failing("EOPNOTSUPP") });
    expect(await FileUtils.chmodRAsync(0o755, file)).toEqual([file]);

    useFs("eperm", { chmod: failing("EPERM") });
    await expect(FileUtils.chmodRAsync(0o755, file)).rejects.toThrow("EPERM");
    expect(await FileUtils.chmodRAsync(0o755, file, { force: true })).toEqual([file]);
  });

  it("rm_rf and chmod_R awaited read a backend's sync verbs where it has no async ones", async () => {
    const { tree, file } = makeTree();
    const none = undefined;
    useFs("sync-only", { lstat: none, readdir: none, chmod: none, unlink: none, rmdir: none });

    expect(await FileUtils.chmodRAsync(0o700, tree)).toEqual([tree]);
    expect(modeOf(file)).toBe(0o700);
    expect(await Dir.globAsync(`${tree}/**/*`)).toEqual([`${tree}/sub`, file]);
    expect(await FileUtils.rmRfAsync(tree)).toEqual([tree]);
    expect(nodeFs.existsSync(tree)).toBe(false);
  });

  it("mkdir_p awaited creates every missing parent and accepts an existing directory", async () => {
    const deep = nodePath.join(root, "x", "y", "z");
    expect(await FileUtils.mkdirPAsync(deep)).toEqual([deep]);
    expect(nodeFs.statSync(deep).isDirectory()).toBe(true);
    expect(await FileUtils.mkdirPAsync(deep)).toEqual([deep]);
    expect(await FileUtils.mkdirPAsync(nodePath.join(root, "n"), { noop: true })).toEqual([
      nodePath.join(root, "n"),
    ]);
    expect(nodeFs.existsSync(nodePath.join(root, "n"))).toBe(false);
  });

  it("chdir is an alias for cd", () => {
    expect(FileUtils.chdir).toBe(FileUtils.cd);
  });
});

describe("FileUtils async commands", () => {
  let origPwd: string;
  let tmp: string;

  beforeEach(() => {
    origPwd = Dir.pwd();
    tmp = nodeFs.realpathSync(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "fu-async-")));
    Dir.chdir(tmp);
  });

  afterEach(() => {
    Dir.chdir(origPwd);
    nodeFs.rmSync(tmp, { recursive: true, force: true });
  });

  it("touch, mv, rm and rm_f", async () => {
    await FileUtils.touchAsync("a");
    await FileUtils.mvAsync("a", "b");
    expect(nodeFs.existsSync("b")).toBe(true);
    await FileUtils.rmAsync("b");
    await expect(FileUtils.rmAsync("b")).rejects.toMatchObject({ code: "ENOENT" });
    await FileUtils.rmFAsync("b");
  });

  it("mv raises EEXIST for a directory destination", async () => {
    await FileUtils.touchAsync("a");
    nodeFs.mkdirSync("d/a", { recursive: true });
    await expect(FileUtils.mvAsync("a", "d")).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("touch with mtime sets it and nocreate raises", async () => {
    const t = new Date(2001, 0, 2, 3, 4, 5);
    await FileUtils.touchAsync("a", { mtime: t });
    expect(nodeFs.statSync("a").mtime).toEqual(t);
    await expect(FileUtils.touchAsync("z", { nocreate: true })).rejects.toThrow();
  });

  it("mkdir and rmdir with parents", async () => {
    await FileUtils.mkdirAsync("x");
    await FileUtils.mkdirAsync("x/y", { mode: 0o700 });
    expect(nodeFs.statSync("x/y").mode & 0o777).toBe(0o700);
    await FileUtils.rmdirAsync("x/y/", { parents: true });
    expect(nodeFs.existsSync("x")).toBe(false);
  });

  it("ln_s and ln_sf", async () => {
    await FileUtils.touchAsync("a");
    await FileUtils.lnSAsync("a", "s");
    await FileUtils.touchAsync("b");
    await expect(FileUtils.lnSAsync("a", "b")).rejects.toMatchObject({ code: "EEXIST" });
    await FileUtils.lnSfAsync("a", "b");
    expect(nodeFs.readlinkSync("b")).toBe("a");
  });

  it("cp_r copies a tree with symlinks", async () => {
    await FileUtils.mkdirPAsync("t/sub");
    nodeFs.writeFileSync("t/sub/f", "x");
    nodeFs.symlinkSync("sub/f", "t/l");
    await FileUtils.cpRAsync("t", "u", { preserve: true });
    expect(nodeFs.readFileSync("u/sub/f", "utf8")).toBe("x");
    expect(nodeFs.readlinkSync("u/l")).toBe("sub/f");
  });

  it("force and preserve read Ruby truthiness", async () => {
    await FileUtils.rmAsync("missing", { force: 1 });
    await FileUtils.touchAsync("a", { mtime: new Date(2001, 0, 2) });
    await FileUtils.cpAsync("a", "b", { preserve: 1 });
    expect(nodeFs.statSync("b").mtime).toEqual(nodeFs.statSync("a").mtime);
  });

  it("mv over a dangling symlink replaces it", async () => {
    await FileUtils.touchAsync("a");
    nodeFs.symlinkSync("gone", "s");
    await FileUtils.mvAsync("a", "s");
    expect(nodeFs.lstatSync("s").isFile()).toBe(true);
  });

  it("chmod", async () => {
    await FileUtils.touchAsync("a");
    await FileUtils.chmodAsync(0o640, "a");
    expect(nodeFs.statSync("a").mode & 0o777).toBe(0o640);
  });

  describe("links, ownership and modes", () => {
    let cwd: string;
    let root: string;
    const filemode = (path: string): number => nodeFs.statSync(path).mode & 0o7777;

    beforeEach(() => {
      cwd = Dir.pwd();
      root = nodeFs.realpathSync(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "file-utils-")));
      Dir.chdir(root);
      nodeFs.mkdirSync("tmp");
      nodeFs.mkdirSync("data");
      nodeFs.writeFileSync("data/a", "a");
    });

    afterEach(() => {
      FileUtils.fileutilsOutput = undefined;
      Dir.chdir(cwd);
      nodeFs.rmSync(root, { recursive: true, force: true });
    });

    it("ln_sr", async () => {
      await FileUtils.lnSrAsync("data/a", "tmp/lnsdest");
      expect(nodeFs.readlinkSync("tmp/lnsdest")).toBe("../data/a");
      await FileUtils.lnSrAsync(nodePath.join(root, "data/a"), "tmp");
      expect(nodeFs.readlinkSync("tmp/a")).toBe("../data/a");
      nodeFs.symlinkSync("../data", "tmp/src");
      await FileUtils.lnSAsync("tmp/src/a", "data/b", { relative: true });
      expect(nodeFs.readlinkSync("data/b")).toBe("../tmp/src/a");
    });

    it("ln_sr collapses a .. component", async () => {
      await FileUtils.lnSrAsync("data/../data/a", "tmp/l");
      expect(nodeFs.readlinkSync("tmp/l")).toBe("../data/a");
    });

    it("ln_sr broken symlink", async () => {
      await FileUtils.lnSrAsync("tmp/symlink", "tmp/symlink");
      expect(nodeFs.lstatSync("tmp/symlink").isSymbolicLink()).toBe(true);
    });

    it("cp_lr", async () => {
      nodeFs.mkdirSync("data/d");
      nodeFs.writeFileSync("data/d/b", "b");
      nodeFs.mkdirSync("tmp/out");
      await FileUtils.cpLrAsync("data/.", "tmp/out");
      expect(nodeFs.statSync("tmp/out/d/b").ino).toBe(nodeFs.statSync("data/d/b").ino);
      expect(nodeFs.statSync("tmp/out/a").nlink).toBe(2);
    });

    it("install", async () => {
      await FileUtils.installAsync("data/a", "tmp/x/y", { mode: "u=rwx,go=rx", preserve: true });
      expect(nodeFs.readFileSync("tmp/x/y", "utf-8")).toBe("a");
      expect(filemode("tmp/x/y")).toBe(0o755);
      await FileUtils.installAsync("data/a", "tmp/z/");
      expect(nodeFs.readFileSync("tmp/z/a", "utf-8")).toBe("a");
      const before = nodeFs.statSync("tmp/x/y").ino;
      await FileUtils.installAsync("data/a", "tmp/x/y");
      expect(nodeFs.statSync("tmp/x/y").ino).toBe(before);
    });

    it("compare file", async () => {
      nodeFs.writeFileSync("tmp/b", "a");
      nodeFs.writeFileSync("tmp/c", "c");
      nodeFs.writeFileSync("tmp/d", "dd");
      expect(await FileUtils.compareFileAsync("data/a", "tmp/b")).toBe(true);
      expect(await FileUtils.compareFileAsync("data/a", "tmp/c")).toBe(false);
      expect(await FileUtils.compareFileAsync("data/a", "tmp/d")).toBe(false);
    });

    it("chmod symbol mode", async () => {
      const a = "tmp/a";
      nodeFs.writeFileSync(a, "");
      const steps: [string, number][] = [
        ["u=wrx,g=rx,o=x", 0o751],
        ["g+w-x", 0o761],
        ["o+r,g=o+w,o-r,u-o", 0o671],
        ["go=u", 0o666],
        ["u=wrx,g=,o=", 0o700],
        ["u=rx,go=", 0o500],
        ["+wrx", 0o777],
        ["u+s,o=s", 0o4770],
        ["u-w,go-wrx", 0o4500],
        ["+s", 0o6500],
        ["u+t,o+t", 0o7500],
        ["a-t,a-s", 0o500],
      ];
      for (const [mode, expected] of steps) {
        await FileUtils.chmodAsync(mode, a);
        expect(filemode(a)).toBe(expected);
      }
      for (const bad of ["a", "x+a", "u+z", ",+x", "755"]) {
        await expect(FileUtils.chmodAsync(bad, a)).rejects.toThrow(ArgumentError);
      }
    });

    it("chmod symbol mode R", async () => {
      await FileUtils.chmodRAsync("u=rwX,go=", "data");
      expect(filemode("data")).toBe(0o700);
      expect(filemode("data/a")).toBe(0o600);
    });

    it("chown", async () => {
      const { uid, gid } = nodeFs.statSync("data/a");
      const lines: string[] = [];
      FileUtils.fileutilsOutput = { puts: (msg) => lines.push(msg) };
      expect(await FileUtils.chownAsync(null, gid, "data/a", { verbose: true })).toEqual([
        "data/a",
      ]);
      await FileUtils.chownAsync(String(uid), null, "data/a");
      expect(lines).toEqual([`chown :${gid} data/a`]);
      await expect(FileUtils.chownAsync("nosuchuser", null, "data/a")).rejects.toThrow(
        "can't find user for nosuchuser",
      );
      await expect(FileUtils.chownAsync(null, "nosuchgroup", "data/a")).rejects.toThrow(
        "can't find group for nosuchgroup",
      );
    });

    it("chown R", async () => {
      const { uid, gid } = nodeFs.statSync("data/a");
      expect(await FileUtils.chownRAsync(uid, gid, "data")).toEqual(["data"]);
      expect(await FileUtils.chownRAsync(uid, gid, "nope", { noop: true })).toBeUndefined();
    });
  });
});
