import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { File } from "./file.js";

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "trails-file-"));
  mkdirSync(join(root, "sub"));
  writeFileSync(join(root, "a.rb"), "puts 1\n");
  symlinkSync(join(root, "nonexistent"), join(root, "broken"));
  return root;
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
    expect(File.binread(path)).toBe("héllo");
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
});
