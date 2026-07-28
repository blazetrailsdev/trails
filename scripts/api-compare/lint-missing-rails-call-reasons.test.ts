import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lintFileText, listSourceFiles, main } from "./lint-missing-rails-call-reasons.js";

describe("lintFileText", () => {
  it("accepts a tag that carries a reason", () => {
    const text = [
      "/**",
      " * @missingRailsCall save! — validations are enforced by the caller.",
      " */",
      "function f() {}",
    ].join("\n");
    expect(lintFileText("a.ts", text)).toEqual([]);
  });

  it("accepts a reason that wraps onto continuation lines", () => {
    const text = [
      "/**",
      " * @missingRailsCall save! — the caller already ran the full",
      " *   validation chain, so re-running it here would double the",
      " *   callbacks.",
      " */",
    ].join("\n");
    expect(lintFileText("a.ts", text)).toEqual([]);
  });

  it("rejects a bare tag with a file:line and the parser's message shape", () => {
    const text = ["", "/**", " * @missingRailsCall save!", " */", "function f() {}"].join("\n");
    expect(lintFileText("packages/x/src/a.ts", text)).toEqual([
      "@missingRailsCall needs a reason: packages/x/src/a.ts:3 — state why the " +
        "Rails call `save!` is not made here.",
    ]);
  });

  it("rejects a whitespace-only reason", () => {
    const text = ["/**", " * @missingRailsCall save! —   ", " */"].join("\n");
    expect(lintFileText("a.ts", text)).toHaveLength(1);
  });

  it("reports every offending comment in a file, not just the first", () => {
    const text = [
      "/**",
      " * @missingRailsCall save!",
      " */",
      "function f() {}",
      "/**",
      " * @missingRailsCall touch",
      " */",
      "function g() {}",
    ].join("\n");
    expect(lintFileText("a.ts", text)).toHaveLength(2);
  });

  it("ignores files and comments without the tag", () => {
    expect(lintFileText("a.ts", "/** plain prose */\nfunction f() {}")).toEqual([]);
  });
});

describe("listSourceFiles", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "api-reasons-"));
    const write = async (rel: string) => {
      const abs = path.join(dir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, "");
    };
    await write(path.join("activerecord", "src", "base.ts"));
    await write(path.join("activerecord", "src", "relation", "query-methods.ts"));
    await write(path.join("activerecord", "src", "base.test.ts"));
    await write(path.join("activerecord", "src", "README.md"));
    await write(path.join("activerecord", "src", "dist", "base.ts"));
    await write(path.join("activerecord", "src", "node_modules", "dep", "index.ts"));
    await write(path.join("activerecord", "dist", "base.ts"));
    await write(path.join("arel", "no-src-dir.ts"));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("collects nested .ts files under each package's src, tests included", async () => {
    expect((await listSourceFiles(dir)).map((f) => path.relative(dir, f))).toEqual([
      path.join("activerecord", "src", "base.test.ts"),
      path.join("activerecord", "src", "base.ts"),
      path.join("activerecord", "src", "relation", "query-methods.ts"),
    ]);
  });

  it("returns nothing for a directory that does not exist", async () => {
    expect(await listSourceFiles(path.join(dir, "missing"))).toEqual([]);
  });
});

describe("main", () => {
  it("passes over the committed tree", async () => {
    expect(await main()).toBe(0);
  });
});
