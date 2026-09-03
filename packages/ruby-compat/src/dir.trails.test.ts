import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Dir } from "./dir.js";

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
    // vendor/ruby/dir.c:3227, verified against ruby 3.3.11.
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

  it("glob sorts each directory and leaves a dotfile to a literal dot", () => {
    // vendor/ruby/dir.c:325, and the sort: true default at dir.c:3210.
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
    // vendor/ruby/dir.c:3421.
    const root = fixture();
    expect(Dir.children(join(root, "a"))).toEqual(["x.rb"]);
    const seen: string[] = [];
    Dir.eachChild(join(root, "b"), (filename) => seen.push(filename));
    expect(seen).toEqual(["y.rb"]);
  });

  it("delete removes an empty directory and refuses a full one", () => {
    // vendor/ruby/dir.c:1535.
    const root = fixture();
    mkdirSync(join(root, "made"));
    expect(Dir.delete(join(root, "made"))).toBe(0);
    expect(() => Dir.delete(join(root, "a"))).toThrow();
  });
  it('foreach yields "." and ".." ahead of the children', () => {
    // vendor/ruby/dir.c:3288 reads the directory stream unfiltered.
    const root = fixture();
    const yielded: string[] = [];
    expect(Dir.foreach(root, (filename) => yielded.push(filename))).toBe(null);
    expect(yielded.slice(0, 2)).toEqual([".", ".."]);
    expect(yielded.slice(2).sort()).toEqual(Dir.children(root).sort());
  });
});
