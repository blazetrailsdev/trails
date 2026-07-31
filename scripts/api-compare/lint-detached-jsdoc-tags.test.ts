import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lintFileText, listLintedFiles, main } from "./lint-detached-jsdoc-tags.js";

describe("lintFileText", () => {
  it("flags a line comment between an @internal block and its declaration", () => {
    const found = lintFileText(
      "a.ts",
      ["/** @internal */", "// prose about the deviation", "export function a() {}", ""].join("\n"),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      file: "a.ts",
      line: 1,
      kind: "separated",
      tags: ["internal"],
    });
    expect(found[0].detail).toContain("`a`");
  });

  it("flags a detached @noRailsEquivalent block", () => {
    const found = lintFileText(
      "a.ts",
      [
        "/** @noRailsEquivalent trails-only wiring seam */",
        "/* not a doc comment */",
        "export const a = 1;",
        "",
      ].join("\n"),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "separated", tags: ["noRailsEquivalent"] });
    expect(found[0].detail).toContain("`a`");
  });

  it("accepts a block flush against its declaration", () => {
    expect(lintFileText("a.ts", "/** @internal */\nexport function a() {}\n")).toEqual([]);
  });

  it("accepts consecutive JSDoc blocks, whose tags TypeScript merges", () => {
    const found = lintFileText(
      "a.ts",
      ["/** @internal */", "/** more prose */", "export function a() {}", ""].join("\n"),
    );
    expect(found).toEqual([]);
  });

  it("accepts a blank line between the block and its declaration", () => {
    expect(lintFileText("a.ts", "/** @internal */\n\nexport function a() {}\n")).toEqual([]);
  });

  it("ignores blocks without an api-compare-significant tag", () => {
    expect(
      lintFileText("a.ts", "/** @param x nothing */\n// prose\nfunction a(x: number) {}\n"),
    ).toEqual([]);
  });

  it("flags a significant block bound to no declaration", () => {
    const found = lintFileText("a.ts", "export function a() {}\n\n/** @internal orphan */\n");
    expect(found).toEqual([
      {
        file: "a.ts",
        line: 3,
        kind: "unbound",
        tags: ["internal"],
        detail: "bound to no declaration — the tag is inert",
      },
    ]);
  });

  it("ignores a tag block quoted inside a string literal", () => {
    const found = lintFileText(
      "a.test.ts",
      ['const fixture = "/** @internal */\\nfunction a() {}";', ""].join("\n"),
    );
    expect(found).toEqual([]);
  });

  it("ignores a tag block quoted inside a template literal", () => {
    const found = lintFileText("a.test.ts", "const fixture = `/** @noRailsEquivalent x */`;\n");
    expect(found).toEqual([]);
  });

  it("reports each detachment in a file, in source order", () => {
    const found = lintFileText(
      "a.ts",
      [
        "/** @internal */",
        "// prose",
        "function a() {}",
        "/** @internal */",
        "// prose",
        "function b() {}",
        "",
      ].join("\n"),
    );
    expect(found.map((d) => d.line)).toEqual([1, 4]);
  });
});

describe("listLintedFiles", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "api-detached-"));
    const write = async (rel: string) => {
      const abs = path.join(dir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, "");
    };
    await write(path.join("packages", "activerecord", "src", "base.ts"));
    await write(path.join("packages", "activerecord", "src", "base.test.ts"));
    await write(path.join("packages", "activerecord", "src", "dist", "base.ts"));
    await write(path.join("packages", "arel", "no-src-dir.ts"));
    await write(path.join("scripts", "start-worktree.ts"));
    await write(path.join("scripts", "api-compare", "extract-ts-api.ts"));
    await write(path.join("scripts", "api-compare", "extract-ts-api.test.ts"));
    await write(path.join("scripts", "api-compare", "conventions.rb"));
    await write(path.join("scripts", "api-compare", "dist", "build.ts"));
    await write(path.join("scripts", "node_modules", "dep", "index.ts"));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("adds every nested .ts under scripts to the packages population", async () => {
    const files = await listLintedFiles(path.join(dir, "packages"), path.join(dir, "scripts"));
    expect(files.map((f) => path.relative(dir, f))).toEqual([
      path.join("packages", "activerecord", "src", "base.test.ts"),
      path.join("packages", "activerecord", "src", "base.ts"),
      path.join("scripts", "api-compare", "extract-ts-api.test.ts"),
      path.join("scripts", "api-compare", "extract-ts-api.ts"),
      path.join("scripts", "start-worktree.ts"),
    ]);
  });

  it("keeps the packages population when the scripts directory does not exist", async () => {
    const files = await listLintedFiles(path.join(dir, "packages"), path.join(dir, "missing"));
    expect(files.map((f) => path.relative(dir, f))).toEqual([
      path.join("packages", "activerecord", "src", "base.test.ts"),
      path.join("packages", "activerecord", "src", "base.ts"),
    ]);
  });
});

describe("main", () => {
  // Parses ~3.6k files, which lands within a few hundred ms of vitest's 5s
  // default — the generous timeout keeps a slow machine from failing it.
  it("passes over the committed tree", { timeout: 60_000 }, async () => {
    expect(await main()).toBe(0);
  });
});
