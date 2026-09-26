import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Dir, createTmpname } from "./dir.js";

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "trails-dir-"));
  for (const dir of ["a", "b", "sub"]) mkdirSync(join(root, dir));
  writeFileSync(join(root, "a", "x.rb"), "");
  writeFileSync(join(root, "b", "y.rb"), "");
  writeFileSync(join(root, "sub", "a.rb"), "");
  writeFileSync(join(root, "B.rb"), "");
  writeFileSync(join(root, "a.rb"), "");
  writeFileSync(join(root, "z.rb"), "");
  writeFileSync(join(root, ".hidden.rb"), "");
  symlinkSync(join(root, "nonexistent"), join(root, "broken"));
  return root;
}

describe("Dir", () => {
  it("glob interleaves ** with the match at each level", () => {
    // vendor/ruby/v3.3.11/dir.c:3227, verified against ruby 3.3.11.
    const root = fixture();
    expect(Dir.glob(`${root}/**/*.rb`)).toEqual([
      `${root}/B.rb`,
      `${root}/a/x.rb`,
      `${root}/a.rb`,
      `${root}/b/y.rb`,
      `${root}/sub/a.rb`,
      `${root}/z.rb`,
    ]);
  });

  it("glob reads a backslash as an escape rather than a brace separator", () => {
    // vendor/ruby/v3.3.11/dir.c:314 and dir.c:3019, verified against ruby 3.3.11.
    const root = mkdtempSync(join(tmpdir(), "trails-dir-"));
    mkdirSync(join(root, "a,b"));
    writeFileSync(join(root, "a,b", "x.rb"), "");
    expect(Dir.glob(`{${root}/a\\,b/**/*.rb}`)).toEqual([`${root}/a,b/x.rb`]);
  });

  it("glob sorts each directory and leaves a dotfile to a literal dot", () => {
    // vendor/ruby/v3.3.11/dir.c:325, and the sort: true default at dir.c:3210.
    const root = fixture();
    expect(Dir.glob(`${root}/*.rb`)).toEqual([`${root}/B.rb`, `${root}/a.rb`, `${root}/z.rb`]);
    expect(Dir.glob(`${root}/.*.rb`)).toEqual([`${root}/.hidden.rb`]);
    expect(Dir.glob(`${root}/*`)).toEqual([
      `${root}/B.rb`,
      `${root}/a`,
      `${root}/a.rb`,
      `${root}/b`,
      `${root}/broken`,
      `${root}/sub`,
      `${root}/z.rb`,
    ]);
  });

  it("glob answers an empty array for a pattern that matches nothing", () => {
    expect(Dir.glob(`${fixture()}/nope/*`)).toEqual([]);
  });

  it("glob expands a brace and a literal pattern", () => {
    const root = fixture();
    expect(Dir.glob(`${root}/{a,b}/*.rb`)).toEqual([`${root}/a/x.rb`, `${root}/b/y.rb`]);
    expect(Dir.glob(`${root}/a.rb`)).toEqual([`${root}/a.rb`]);
  });

  it("children excludes . and .., and each_child yields them", () => {
    // vendor/ruby/v3.3.11/dir.c:3421.
    const root = fixture();
    expect(Dir.children(join(root, "a"))).toEqual(["x.rb"]);
    const seen: string[] = [];
    Dir.eachChild(join(root, "b"), (filename) => seen.push(filename));
    expect(seen).toEqual(["y.rb"]);
  });

  it("delete removes an empty directory and refuses a full one", () => {
    // vendor/ruby/v3.3.11/dir.c:1535.
    const root = fixture();
    mkdirSync(join(root, "made"));
    expect(Dir.delete(join(root, "made"))).toBe(0);
    expect(() => Dir.delete(join(root, "a"))).toThrow();
  });
  it('foreach yields "." and ".." ahead of the children', () => {
    // vendor/ruby/v3.3.11/dir.c:3288 reads the directory stream unfiltered.
    const root = fixture();
    const yielded: string[] = [];
    expect(Dir.foreach(root, (filename) => yielded.push(filename))).toBe(null);
    expect(yielded.slice(0, 2)).toEqual([".", ".."]);
    expect(yielded.slice(2).sort()).toEqual(Dir.children(root).sort());
  });
});

describe("Dir.mktmpdir", () => {
  it("creates a 0700 directory named by Dir::Tmpname.create and answers its path", () => {
    const path = Dir.mktmpdir(["tmp", "cache"]);
    try {
      expect(path.startsWith(join(Dir.tmpdir(), "tmp"))).toBe(true);
      expect(path.endsWith("cache")).toBe(true);
      expect(statSync(path).isDirectory()).toBe(true);
      expect(statSync(path).mode & 0o777).toBe(0o700);
    } finally {
      rmSync(path, { recursive: true, force: true });
    }
  });

  it("removes the directory after yielding it to a block", () => {
    const path = Dir.mktmpdir(null, null, {}, (dir) => {
      writeFileSync(join(dir, "f"), "");
      return dir;
    });
    expect(existsSync(path)).toBe(false);
  });

  it("creates the directory under an explicit tmpdir", () => {
    const root = mkdtempSync(join(tmpdir(), "trails-dir-"));
    const path = Dir.mktmpdir("x", root);
    expect(path.startsWith(join(root, "x"))).toBe(true);
    expect(statSync(path).isDirectory()).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("gives up after max_try names are taken", () => {
    const root = mkdtempSync(join(tmpdir(), "trails-dir-"));
    const taken = Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    let tries = 0;
    expect(() =>
      createTmpname("x", root, { maxTry: 3 }, () => {
        tries += 1;
        throw taken;
      }),
    ).toThrow(`cannot generate temporary name using \`x' under \`${root}'`);
    expect(tries).toBe(3);
    rmSync(root, { recursive: true, force: true });
  });
});
