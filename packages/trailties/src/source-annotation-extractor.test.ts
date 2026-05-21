import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  fsAdapterConfig,
  registerFsAdapter,
  type FsAdapter,
  type FsDirent,
  type PathAdapter,
} from "@blazetrails/activesupport";
import {
  Annotation,
  SourceAnnotationExtractor,
  registerDirectories,
  registerExtensions,
  registerTags,
  resetAnnotationRegistry,
} from "./source-annotation-extractor.js";

const posix: PathAdapter = {
  join: (...p) => p.filter(Boolean).join("/").replace(/\/+/g, "/"),
  dirname: (p) => p.replace(/\/[^/]*$/, "") || "/",
  basename: (p) => p.split("/").pop() ?? "",
  resolve: (...p) => p.join("/").replace(/\/+/g, "/"),
  extname: (p) => (p.lastIndexOf(".") > 0 ? p.slice(p.lastIndexOf(".")) : ""),
  sep: "/",
};

const files = new Map<string, string>();
const memoryFs = {
  cwd: () => "/",
  exists: async (p: string) => {
    if (files.has(p)) return true;
    const pre = p.endsWith("/") ? p : `${p}/`;
    for (const f of files.keys()) if (f.startsWith(pre)) return true;
    return false;
  },
  readFile: async (p: string) => files.get(p) ?? Promise.reject(new Error(`ENOENT: ${p}`)),
  readdirSync: (dir: string): FsDirent[] => {
    const pre = dir.endsWith("/") ? dir : `${dir}/`;
    const seen = new Set<string>();
    const out: FsDirent[] = [];
    for (const f of files.keys()) {
      if (!f.startsWith(pre)) continue;
      const rest = f.slice(pre.length);
      const i = rest.indexOf("/");
      const isDir = i !== -1;
      const name = isDir ? rest.slice(0, i) : rest;
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({ name, isDirectory: () => isDir, isFile: () => !isDir });
    }
    return out;
  },
} as unknown as FsAdapter;

const PREV = fsAdapterConfig.adapter;
beforeEach(() => {
  files.clear();
  registerFsAdapter("notes-test", memoryFs, posix);
  fsAdapterConfig.adapter = "notes-test";
  resetAnnotationRegistry();
});
afterEach(() => {
  fsAdapterConfig.adapter = PREV;
  resetAnnotationRegistry();
});

const w = (p: string, c: string): void => void files.set(p, c);

// Smoke tests for the extractor — verbatim Rails-mirrored
// (Rails::Command::NotesTest) coverage lands in the follow-up PR off updated
// main, per CLAUDE.md's <base>/<base>b non-overlapping-file split pattern.
describe("SourceAnnotationExtractor", () => {
  test("aligned line number indent + default tags + nested directory walk", async () => {
    w("app/x.ts", "// TODO: a");
    w("lib/nested/y.ts", "// FIXME: b");
    w("test/z.ts", "\n".repeat(99) + "// OPTIMIZE: c");
    w("ignored_dir/q.ts", "// TODO: not in default dirs");
    const out = await SourceAnnotationExtractor.enumerate(null, { tag: true });
    expect(out).toBe(
      `app/x.ts:\n  * [  1] [TODO] a\n\n` +
        `lib/nested/y.ts:\n  * [  1] [FIXME] b\n\n` +
        `test/z.ts:\n  * [100] [OPTIMIZE] c\n\n`,
    );
  });

  test("returns empty string when no annotations match", async () => {
    expect(await SourceAnnotationExtractor.enumerate()).toBe("");
  });

  test("single-tag filter omits the [TAG] prefix", async () => {
    w("db/s.ts", "// FIXME: fix");
    w("app/c.ts", "// TODO: skip");
    expect(await SourceAnnotationExtractor.enumerate("FIXME", { tag: false })).toBe(
      `db/s.ts:\n  * [1] fix\n\n`,
    );
  });

  test("registerDirectories adds search roots", async () => {
    w("spec/m.ts", "// TODO: x");
    registerDirectories("spec");
    expect(await SourceAnnotationExtractor.enumerate(null, { tag: true })).toBe(
      `spec/m.ts:\n  * [1] [TODO] x\n\n`,
    );
  });

  test("registerExtensions adds new file types", async () => {
    registerExtensions(["scss"], (tag) => new RegExp(`//\\s*(${tag}):?\\s*(.*)$`));
    w("app/a.scss", "// TODO: styled");
    expect(await SourceAnnotationExtractor.enumerate(null, { tag: true })).toBe(
      `app/a.scss:\n  * [1] [TODO] styled\n\n`,
    );
  });

  test("registerTags adds new tags; unregistered tags are ignored", async () => {
    w("app/a.ts", "// TESTME: yes");
    w("app/b.ts", "// BAD: no");
    registerTags("TESTME");
    expect(await SourceAnnotationExtractor.enumerate(null, { tag: true })).toBe(
      `app/a.ts:\n  * [1] [TESTME] yes\n\n`,
    );
  });
});

test("Annotation#toString — line padding + optional tag prefix", () => {
  expect(new Annotation(7, "TODO", "x").toString()).toBe("[7] x");
  expect(new Annotation(7, "TODO", "x").toString({ tag: true })).toBe("[7] [TODO] x");
  expect(new Annotation(7, "TODO", "x").toString({ indent: 3 })).toBe("[  7] x");
});
