import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { File } from "./file.js";
import { block } from "./hash.js";
import { ArgumentError } from "./argument-error.js";
import { Pathname } from "./pathname.js";

describe("Pathname (trails)", () => {
  it("answers the path it was built from", () => {
    expect(new Pathname("/usr/bin/ruby").toString()).toBe("/usr/bin/ruby");
    expect(new Pathname(new Pathname("a/b")).toString()).toBe("a/b");
  });

  it("is equal to another Pathname over the same string only", () => {
    expect(new Pathname("a/b").equals(new Pathname("a/b"))).toBe(true);
    expect(new Pathname("a/b").equals(new Pathname("a/b/"))).toBe(false);
    expect(new Pathname("a/b").equals("a/b")).toBe(false);
  });

  it("raises ArgumentError on a null byte", () => {
    expect(() => new Pathname("a\0b")).toThrow(ArgumentError);
    expect(() => new Pathname("a\0b")).toThrow("pathname contains null byte");
  });

  it("join answers an absolute argument unchanged and resolves a relative one", () => {
    expect(new Pathname("/usr").join("bin/ruby").toString()).toBe("/usr/bin/ruby");
    expect(new Pathname("/app").join("/abs/x.rb").toString()).toBe("/abs/x.rb");
    expect(new Pathname("/usr/lib").join("../bin").toString()).toBe("/usr/bin");
    expect(new Pathname("a").join("b", "c").toString()).toBe("a/b/c");
  });

  it("cleanpath removes useless dots, aggressively or conservatively", () => {
    const aggressive: [string, string][] = [
      ["/", "/.."],
      [".", ""],
      [".", "./"],
      ["a", "a/./"],
      [".", "a/../"],
      ["/a", "/../.././../a"],
      ["../../d", "a/b/../../../../c/../d"],
    ];
    for (const [expected, path] of aggressive) {
      expect(new Pathname(path).cleanpath().toString()).toBe(expected);
    }
    const conservative: [string, string][] = [
      ["/", "/.."],
      [".", ""],
      ["a/", "a/"],
      ["a/.", "a/./"],
      ["a/..", "a/../"],
      ["/a", "/../.././../a"],
      ["a/b/../../../../c/../d", "a/b/../../../../c/../d"],
    ];
    for (const [expected, path] of conservative) {
      expect(new Pathname(path).cleanpath(true).toString()).toBe(expected);
    }
  });

  it("relativePathFrom answers the path from a base directory", () => {
    const cases: [string, string | Pathname, string][] = [
      ["../a", new Pathname("a"), "b"],
      ["../a", "a/", "b/"],
      ["../a", "/a", "/b/"],
      ["../b", "a/b", "a/c"],
      ["../a", "../a", "../b"],
      ["a", "a", "."],
      ["..", ".", "a"],
      [".", ".", "."],
      [".", "..", ".."],
      ["c/d", "/a/b/c/d", "/a/b"],
      ["../../../../e", "/e", "/a/b/c/d"],
      ["../a", "/../a", "/b"],
      ["../../a", "../a", "b"],
      [".", "/a/../../b", "/b"],
      ["b/c", "b/c", "b/.."],
    ];
    for (const [expected, dest, base] of cases) {
      expect(new Pathname(dest).relativePathFrom(base).toString()).toBe(expected);
    }
    for (const [dest, base] of [
      ["/", "."],
      [".", "/"],
      ["a", ".."],
      [".", ".."],
    ]) {
      expect(() => new Pathname(dest).relativePathFrom(base)).toThrow(ArgumentError);
    }
  });
});

describe("Pathname#open", () => {
  it("forwards to File.open, answering the block's value", () => {
    const dir = mkdtempSync(join(tmpdir(), "trails-pathname-"));
    try {
      const path = join(dir, "magic");
      writeFileSync(path, Buffer.from([0xff, 0xd8, 0xff]));
      expect(
        new Pathname(path).open(
          "rb",
          block((f: File) => f.read()),
        ),
      ).toBe("\xff\xd8\xff");
      const text = join(dir, "text");
      writeFileSync(text, "hello");
      expect(new Pathname(text).open(block((f: File) => f.read()))).toBe("hello");
      const file = new Pathname(path).open() as File;
      expect(file).toBeInstanceOf(File);
      file.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
