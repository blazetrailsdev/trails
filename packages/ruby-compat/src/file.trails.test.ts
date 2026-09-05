import { describe, expect, it } from "vitest";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { File } from "./file.js";
import {
  fsAdapterConfig,
  registerFsAdapter,
  type FsAdapter,
  type PathAdapter,
} from "./fs-adapter.js";

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "trails-file-"));
  mkdirSync(join(root, "sub"));
  writeFileSync(join(root, "a.rb"), "puts 1\n");
  symlinkSync(join(root, "nonexistent"), join(root, "broken"));
  return root;
}

const posixPath: PathAdapter = {
  join: (...parts) => parts.join("/"),
  dirname: (p) => p.slice(0, p.lastIndexOf("/")),
  basename: (p) => p.slice(p.lastIndexOf("/") + 1),
  resolve: (...parts) => parts.join("/"),
  extname: () => "",
  sep: "/",
};

function withWindowsPath(block: () => void): void {
  const previous = fsAdapterConfig.adapter;
  registerFsAdapter("windows-path", {} as unknown as FsAdapter, { ...posixPath, sep: "\\" });
  fsAdapterConfig.adapter = "windows-path";
  try {
    block();
  } finally {
    fsAdapterConfig.adapter = previous;
  }
}

describe("File", () => {
  it("exist? follows the symlink, so a broken one is false", () => {
    // vendor/ruby/file.c:1806 stats the symlink TARGET.
    const root = fixture();
    expect(File.isExist(join(root, "a.rb"))).toBe(true);
    expect(File.isExist(join(root, "broken"))).toBe(false);
  });

  it("join squeezes one separator at the boundary and does not normalize", () => {
    // vendor/ruby/file.c:5013, verified against ruby 3.3.11.
    expect(File.join("a", "/b")).toBe("a/b");
    expect(File.join("a/", "/b")).toBe("a/b");
    expect(File.join("a//", "/b")).toBe("a/b");
    expect(File.join("a", "//b")).toBe("a//b");
    expect(File.join("a//", "b")).toBe("a//b");
    expect(File.join("a", "..", "b")).toBe("a/../b");
    expect(File.join("a", "b", "")).toBe("a/b/");
    expect(File.join("", "b")).toBe("/b");
    expect(File.join("a")).toBe("a");
  });

  it("extname keeps a trailing dot and skips a leading one", () => {
    // vendor/ruby/file.c:4954.
    expect(File.extname("a/b.tar.gz")).toBe(".gz");
    expect(File.extname("a/.bashrc")).toBe("");
    expect(File.extname("a/b.")).toBe(".");
  });

  it("basename strips a suffix, and .* strips whatever extension is there", () => {
    // vendor/ruby/file.c:4705.
    expect(File.basename("/a/b/")).toBe("b");
    expect(File.basename("/a/b.rb", ".rb")).toBe("b");
    expect(File.basename("/a/b.rb", ".*")).toBe("b");
    expect(File.basename("/a/b", ".*")).toBe("b");
  });

  it("dirname, expand_path and absolute_path? answer MRI's values", () => {
    expect(File.dirname("/a/b/")).toBe("/a");
    expect(File.dirname("a")).toBe(".");
    expect(File.expandPath("b", "/a")).toBe("/a/b");
    expect(File.isAbsolutePath("a")).toBe(false);
    expect(File.isAbsolutePath("/a")).toBe(true);
  });

  it("read, binread, write and delete round-trip a file", () => {
    const root = fixture();
    const path = join(root, "sub", "w.txt");
    expect(File.write(path, "héllo")).toBe(6);
    expect(File.read(path)).toBe("héllo");
    expect(File.binread(path)).toBe("h\xC3\xA9llo");
    expect(File.binread(path).length).toBe(File.stat(path).size);
    expect(File.isFile(path)).toBe(true);
    expect(File.isDirectory(join(root, "sub"))).toBe(true);
    expect(File.delete(path)).toBe(1);
    expect(File.isExist(path)).toBe(false);
  });

  it("directory? and file? answer false rather than raising on a missing path", () => {
    // vendor/ruby/file.c:1622.
    expect(File.isDirectory("/nope/nope")).toBe(false);
    expect(File.isFile("/nope/nope")).toBe(false);
  });

  it("size? is nil both for a missing file and for an empty one", () => {
    // vendor/ruby/file.c:2047 answers nil in BOTH cases, not 0.
    const root = fixture();
    writeFileSync(join(root, "empty.rb"), "");
    expect(File.sizeQ(join(root, "a.rb"))).toBe(7);
    expect(File.sizeQ(join(root, "empty.rb"))).toBe(null);
    expect(File.sizeQ(join(root, "nonexistent"))).toBe(null);
  });

  it("stat raises where the predicates swallow, and mtime reads through it", () => {
    // vendor/ruby/file.c:1329 raises Errno::ENOENT rather than answering nil.
    const root = fixture();
    expect(File.stat(join(root, "a.rb")).size).toBe(7);
    expect(File.mtime(join(root, "a.rb"))).toBeInstanceOf(Date);
    expect(() => File.stat(join(root, "nonexistent"))).toThrow();
  });

  it("readable? is an access check, not the existence check exist? is", () => {
    // vendor/ruby/file.c:1826 is eaccess(R_OK), not the stat exist? does.
    const root = fixture();
    const path = join(root, "a.rb");
    chmodSync(path, 0o000);
    let accessible = true;
    try {
      readFileSync(path);
    } catch {
      accessible = false;
    }

    expect(File.isExist(path)).toBe(true);
    expect(File.isReadable(path)).toBe(accessible);
  });

  it("ALT_SEPARATOR is the backslash where the path backend is DOSISH, and nil elsewhere", () => {
    expect(File.ALT_SEPARATOR).toBe(null);
    expect(File.SEPARATOR).toBe("/");
    withWindowsPath(() => {
      expect(File.ALT_SEPARATOR).toBe("\\");
      expect(File.SEPARATOR).toBe("/");
    });
  });

  it("join treats ALT_SEPARATOR as a boundary separator where one is defined", () => {
    expect(File.join("a\\", "b")).toBe("a\\/b");
    expect(File.join("a", "\\b")).toBe("a/\\b");
    withWindowsPath(() => {
      expect(File.join("a\\", "b")).toBe("a\\b");
      expect(File.join("a", "\\b")).toBe("a\\b");
      expect(File.join("a/", "b")).toBe("a/b");
    });
  });

  it("chown ignores a nil owner or group", () => {
    const calls: [string, number, number][] = [];
    const previous = fsAdapterConfig.adapter;
    registerFsAdapter(
      "chown-recorder",
      {
        chownSync: (path: string, uid: number, gid: number) => {
          calls.push([path, uid, gid]);
        },
      } as unknown as FsAdapter,
      posixPath,
    );
    fsAdapterConfig.adapter = "chown-recorder";
    try {
      expect(File.chown(null, 100, "testfile")).toBe(1);
      expect(File.chown(500, null, "testfile")).toBe(1);
      expect(File.chown(null, null)).toBe(0);
    } finally {
      fsAdapterConfig.adapter = previous;
    }
    expect(calls).toEqual([
      ["testfile", -1, 100],
      ["testfile", 500, -1],
    ]);
  });

  it("identical? compares device and inode, and reads them off an open stream", () => {
    const root = fixture();
    const path = join(root, "ident.txt");
    const file = File.open(path, "w+");
    expect(File.isIdentical(file, path)).toBe(true);
    expect(File.isIdentical(path, root)).toBe(false);
    file.close();
    expect(File.isIdentical(path, join(root, "missing.txt"))).toBe(false);
  });
});

describe("File.fnmatch", () => {
  const cases: Array<[string, string, number, boolean]> = [
    ["*/*.tse", "foo/bar.tse", 0, true],
    ["*.tse", "foo/bar.tse", 0, true],
    ["**/*.tse", "a/b/c.tse", 0, true],
    ["**/*.tse", "c.tse", 0, false],
    ["a?c", "abc", 0, true],
    ["a[bc]d", "abd", 0, true],
    ["a[!bc]d", "aed", 0, true],
    ["a[!bc]d", "abd", 0, false],
    ["[a-c]x", "bx", 0, true],
    ["{a,b}.rb", "b.rb", 0, false],
    ["{a,b}.rb", "b.rb", File.FNM_EXTGLOB, true],
    ["{a,{b,c}}x", "cx", File.FNM_EXTGLOB, true],
    ["*", ".foo", 0, false],
    ["*", ".foo", File.FNM_DOTMATCH, true],
    ["a/*", "a/.foo", 0, true],
    ["?foo", ".foo", 0, false],
    ["a*", "a/b", 0, true],
    ["a*", "a/b", File.FNM_PATHNAME, false],
    ["**/foo", "a/b/foo", File.FNM_PATHNAME, true],
    ["**/foo", "foo", File.FNM_PATHNAME, true],
    ["*/foo", "a/b/foo", File.FNM_PATHNAME, false],
    ["\\*", "*", 0, true],
    ["\\*", "*", File.FNM_NOESCAPE, false],
    ["A*", "abc", File.FNM_CASEFOLD, true],
    ["[]]", "]", 0, false],
    ["[ab]", "A", File.FNM_CASEFOLD, false],
    ["[ab]", "B", File.FNM_CASEFOLD, true],
    ["[b]", "B", File.FNM_CASEFOLD, false],
    ["app/views/*/*.tse", "app/views/users/index.tse", 0, true],
    ["?", "\u{1F600}", 0, true],
    ["[\u{1F600}]", "\u{1F600}", 0, true],
    ["*\u{1F600}", "ab\u{1F600}", 0, true],
    ["a?c", "a\u{1F600}c", 0, true],
    ["[\u{1F600}-\u{1F602}]", "\u{1F601}", 0, true],
    ["\u{1F600}*", "\u{1F600}bc", 0, true],
  ];

  cases.forEach(([pattern, path, flags, matches]) => {
    it(`matches ${pattern} against ${path} with flags ${flags}`, () => {
      expect(File.fnmatch(pattern, path, flags)).toBe(matches);
    });
  });
});
