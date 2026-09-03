import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  fsAdapterConfig,
  registerFsAdapter,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/ruby-compat";
import {
  Annotation,
  SourceAnnotationExtractor,
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
const norm = (p: string): string => p.replace(/^\.\//, "").replace(/\/+$/, "");
const dirs = (): Set<string> => {
  const out = new Set<string>();
  for (const f of files.keys()) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) out.add(parts.slice(0, i).join("/"));
  }
  return out;
};
const memoryFs = {
  cwd: () => "/",
  existsSync: (p: string) => files.has(norm(p)) || dirs().has(norm(p)),
  statSync: (p: string) => {
    const key = norm(p);
    if (files.has(key)) return { isDirectory: () => false, isFile: () => true };
    if (dirs().has(key)) return { isDirectory: () => true, isFile: () => false };
    throw new Error(`ENOENT: ${p}`);
  },
  readFileSync: (p: string) => {
    const contents = files.get(norm(p));
    if (contents === undefined) throw new Error(`ENOENT: ${p}`);
    return contents;
  },
  readdirSync: (dir: string): string[] => {
    const pre = norm(dir) === "" ? "" : `${norm(dir)}/`;
    const seen = new Set<string>();
    for (const f of files.keys()) {
      if (!f.startsWith(pre)) continue;
      const rest = f.slice(pre.length);
      const i = rest.indexOf("/");
      seen.add(i === -1 ? rest : rest.slice(0, i));
    }
    return [...seen];
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
    Annotation.registerDirectories("spec");
    expect(await SourceAnnotationExtractor.enumerate(null, { tag: true })).toBe(
      `spec/m.ts:\n  * [1] [TODO] x\n\n`,
    );
  });

  test("registerExtensions adds new file types", async () => {
    Annotation.registerExtensions("scss", (tag) => new RegExp(`//\\s*(${tag}):?\\s*(.*)$`));
    w("app/a.scss", "// TODO: styled");
    expect(await SourceAnnotationExtractor.enumerate(null, { tag: true })).toBe(
      `app/a.scss:\n  * [1] [TODO] styled\n\n`,
    );
  });

  test("registerTags adds new tags; unregistered tags are ignored", async () => {
    w("app/a.ts", "// TESTME: yes");
    w("app/b.ts", "// BAD: no");
    Annotation.registerTags("TESTME");
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
