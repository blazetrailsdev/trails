import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { findDuplicateKeys, keyOf, type ExcludeEntry } from "./lint-call-mismatches.js";
import { loadSplitBaseline, relPathFor, writeSplitBaseline } from "./lint-call-mismatches-wide.js";

const entry = (
  pkg: string,
  tsFile: string,
  rubyName: string,
  call: string,
  reason = "r",
): ExcludeEntry => ({ package: pkg, tsFile, rubyName, call, reason });

describe("relPathFor", () => {
  it("mirrors the source tree, mapping .ts→.json", () => {
    expect(relPathFor(entry("activerecord", "model.ts", "save", "run"))).toBe(
      path.join("activerecord", "model.json"),
    );
    expect(
      relPathFor(
        entry("activerecord", "connection-adapters/sqlite3/database-statements.ts", "q", "p"),
      ),
    ).toBe(path.join("activerecord", "connection-adapters/sqlite3/database-statements.json"));
  });

  it("replaces only the final .ts (compound extensions kept intact)", () => {
    expect(relPathFor(entry("arel", "nodes/foo.d.ts", "x", "y"))).toBe(
      path.join("arel", "nodes/foo.d.json"),
    );
  });

  it("throws on a tsFile that would not round-trip through the .json glob", () => {
    // A non-.ts path would be written but skipped on reload → silent data loss.
    expect(() => relPathFor(entry("arel", "weird.rb", "x", "y"))).toThrow(/does not end in/);
  });
});

describe("split baseline round-trip", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "wide-baseline-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const listFiles = async (): Promise<string[]> => {
    const out: string[] = [];
    const walk = async (d: string): Promise<void> => {
      for (const e of await fs.readdir(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await walk(p);
        else out.push(path.relative(dir, p));
      }
    };
    await walk(dir);
    return out.sort();
  };

  it("write then load is entry-identical regardless of source-file spread", async () => {
    const entries = [
      entry("activerecord", "relation.ts", "where", "build"),
      entry("activerecord", "relation.ts", "where", "spawn"),
      entry("activerecord", "model.ts", "save", "run"),
      entry("arel", "visitors/to-sql.ts", "visit", "accept"),
    ];
    await writeSplitBaseline(entries, dir);
    const loaded = await loadSplitBaseline(dir);
    expect(new Set(loaded.map(keyOf))).toEqual(new Set(entries.map(keyOf)));
    expect(findDuplicateKeys(loaded)).toEqual([]);
  });

  it("groups every entry of one source into that source's single file, sorted", async () => {
    await writeSplitBaseline(
      [
        entry("activerecord", "relation.ts", "where", "spawn"),
        entry("activerecord", "relation.ts", "where", "build"),
        entry("activerecord", "model.ts", "save", "run"),
      ],
      dir,
    );
    expect(await listFiles()).toEqual([
      path.join("activerecord", "model.json"),
      path.join("activerecord", "relation.json"),
    ]);
    const relation = JSON.parse(
      await fs.readFile(path.join(dir, "activerecord", "relation.json"), "utf-8"),
    ) as ExcludeEntry[];
    expect(relation.map(keyOf)).toEqual(
      [...relation].map(keyOf).sort((a, b) => a.localeCompare(b)),
    );
  });

  it("deletes a converged source file (never leaves []) and prunes its empty dirs", async () => {
    await writeSplitBaseline(
      [
        entry("activerecord", "model.ts", "save", "run"),
        entry("activerecord", "connection-adapters/sqlite3/database-statements.ts", "q", "p"),
      ],
      dir,
    );
    // model.ts still flags; the deep sqlite3 source fully converges.
    await writeSplitBaseline([entry("activerecord", "model.ts", "save", "run")], dir);

    expect(await listFiles()).toEqual([path.join("activerecord", "model.json")]);
    // The now-empty connection-adapters/sqlite3 dir chain is pruned, not left behind.
    await expect(
      fs.readdir(path.join(dir, "activerecord", "connection-adapters")),
    ).rejects.toThrow();
  });

  it("creates a brand-new file for a newly-flagged source", async () => {
    await writeSplitBaseline([entry("activerecord", "model.ts", "save", "run")], dir);
    await writeSplitBaseline(
      [
        entry("activerecord", "model.ts", "save", "run"),
        entry("arel", "visitors/to-sql.ts", "visit", "accept"),
      ],
      dir,
    );
    expect(await listFiles()).toContain(path.join("arel", "visitors/to-sql.json"));
  });

  it("emptying the whole baseline leaves a clean directory (no stray files)", async () => {
    await writeSplitBaseline([entry("activerecord", "model.ts", "save", "run")], dir);
    await writeSplitBaseline([], dir);
    expect(await listFiles()).toEqual([]);
    expect(await loadSplitBaseline(dir)).toEqual([]);
  });
});

describe("loadSplitBaseline on a missing directory", () => {
  it("returns an empty baseline rather than throwing", async () => {
    const missing = path.join(os.tmpdir(), "wide-baseline-does-not-exist-xyz");
    expect(await loadSplitBaseline(missing)).toEqual([]);
  });
});

describe("emission order", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "wide-baseline-order-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const read = async (rel: string) => JSON.parse(await fs.readFile(path.join(dir, rel), "utf-8"));

  // Punctuation-differing keys are where ICU collation and code-unit order part
  // ways; `permit!` must precede `permit_any_in_array` because "!" < "_".
  it("sorts by code units, not locale collation", async () => {
    await writeSplitBaseline(
      [
        entry("actioncontroller", "metal/strong-parameters.ts", "permit_any_in_array", "each"),
        entry("actioncontroller", "metal/strong-parameters.ts", "permit!", "wrap"),
      ],
      dir,
    );
    const written = await read(path.join("actioncontroller", "metal/strong-parameters.json"));
    expect(written.map((e: ExcludeEntry) => e.rubyName)).toEqual([
      "permit!",
      "permit_any_in_array",
    ]);
  });

  it("emits byte-identical files whatever order the entries arrive in", async () => {
    const entries = [
      entry("activerecord", "relation.ts", "where", "first"),
      entry("activerecord", "relation.ts", "_substitute_values", "build_bind_attribute"),
      entry("activerecord", "relation.ts", "empty?", "loaded?"),
    ];
    await writeSplitBaseline(entries, dir);
    const first = await fs.readFile(path.join(dir, "activerecord", "relation.json"), "utf-8");
    await writeSplitBaseline([...entries].reverse(), dir);
    const second = await fs.readFile(path.join(dir, "activerecord", "relation.json"), "utf-8");
    expect(second).toBe(first);
  });
});
