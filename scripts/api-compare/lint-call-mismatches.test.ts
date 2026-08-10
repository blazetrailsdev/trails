import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { findDuplicateKeys, keyOf, type ExcludeEntry } from "./call-mismatch-baseline.js";
import { excessByPath, loadMarks, unreviewedCounts } from "./unreviewed-ratchet.js";
import {
  DEFAULT_REASON,
  bucketFor,
  indexTsMembers,
  BASELINE_DIR,
  loadBaseline,
  loadForeignRows,
  loadSplitBaseline,
  parseTop,
  relPathFor,
  renderReport,
  unreviewedCount,
  writeSplitBaseline,
  renderStaleTags,
  applyReason,
  findCategory,
  matchesCategory,
  parseSetReason,
  REASON_CATEGORIES,
  type ReasonCategory,
} from "./lint-call-mismatches.js";
import { findNonCanonicalBaselines } from "./baseline-json.js";
import type { ApiManifest, ClassInfo, MethodInfo } from "@blazetrails/parity/types";

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
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-"));
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
    expect(relation.map(keyOf)).toEqual([...relation].map(keyOf).sort());
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
    const missing = path.join(os.tmpdir(), "baseline-does-not-exist-xyz");
    expect(await loadSplitBaseline(missing)).toEqual([]);
  });
});

describe("emission order", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-order-"));
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

describe("cause buckets", () => {
  const method = (name: string, params: number, extra: Partial<MethodInfo> = {}): MethodInfo => ({
    name,
    visibility: "public",
    params: Array.from({ length: params }, (_, i) => ({ name: `a${i}`, kind: "required" })),
    ...extra,
  });

  const container = (file: string, methods: MethodInfo[]): ClassInfo => ({
    name: "C",
    file,
    includes: [],
    extends: [],
    instanceMethods: methods,
    classMethods: [],
  });

  const manifest = (classes: Record<string, ClassInfo>): ApiManifest => ({
    source: "typescript",
    generatedAt: "now",
    packages: { activerecord: { classes, modules: {} } },
  });

  it("buckets a same-file candidate that takes arguments", () => {
    const index = indexTsMembers(
      manifest({ "relation.ts:Relation": container("relation.ts", [method("buildArel", 1)]) }),
    );
    expect(bucketFor(entry("activerecord", "relation.ts", "to_sql", "build_arel"), index)).toBe(
      "same-file candidate takes args",
    );
  });

  it("buckets a same-file zero-arg member separately", () => {
    const index = indexTsMembers(
      manifest({ "relation.ts:Relation": container("relation.ts", [method("buildArel", 0)]) }),
    );
    expect(bucketFor(entry("activerecord", "relation.ts", "to_sql", "build_arel"), index)).toBe(
      "same-file zero-arg member",
    );
  });

  it("buckets a candidate declared in another file of the package", () => {
    const index = indexTsMembers(
      manifest({ "model.ts:Model": container("model.ts", [method("buildArel", 1)]) }),
    );
    expect(bucketFor(entry("activerecord", "relation.ts", "to_sql", "build_arel"), index)).toBe(
      "candidate elsewhere in package",
    );
  });

  it("buckets a call with no TS counterpart anywhere in the package", () => {
    const index = indexTsMembers(
      manifest({ "relation.ts:Relation": container("relation.ts", [method("toSql", 0)]) }),
    );
    expect(bucketFor(entry("activerecord", "relation.ts", "to_sql", "build_arel"), index)).toBe(
      "candidate not in package",
    );
  });

  it("matches predicate calls through their convention candidates", () => {
    const index = indexTsMembers(
      manifest({ "relation.ts:Relation": container("relation.ts", [method("isLoaded", 0)]) }),
    );
    expect(bucketFor(entry("activerecord", "relation.ts", "to_sql", "loaded?"), index)).toBe(
      "same-file zero-arg member",
    );
  });

  it("attributes a mixin member to its declaring file, not the pseudo-module's", () => {
    const index = indexTsMembers(
      manifest({
        "relation.ts:mixin": container("relation.ts", [
          method("buildArel", 1, { declaredIn: "model.ts" }),
        ]),
      }),
    );
    expect(bucketFor(entry("activerecord", "relation.ts", "to_sql", "build_arel"), index)).toBe(
      "candidate elsewhere in package",
    );
  });

  it("buckets a package the manifest does not cover at all", () => {
    expect(
      bucketFor(entry("arel", "nodes/node.ts", "to_sql", "visit"), indexTsMembers(manifest({}))),
    ).toBe("candidate not in package");
  });
});

describe("unreviewedCount", () => {
  it("counts only entries still carrying the seeded default reason", () => {
    const seeded = { ...entry("activerecord", "relation.ts", "a", "b"), reason: DEFAULT_REASON };
    expect(
      unreviewedCount([seeded, entry("activerecord", "relation.ts", "c", "d", "reviewed")]),
    ).toBe(1);
  });
});

describe("renderReport", () => {
  const entries = [
    { ...entry("activerecord", "relation.ts", "a", "b"), reason: DEFAULT_REASON },
    entry("activerecord", "relation.ts", "c", "d", "reviewed"),
    entry("arel", "nodes/node.ts", "e", "f", "reviewed"),
  ];

  it("reports totals by package, file, call name, and unreviewed count", () => {
    const out = renderReport(entries, undefined, 20);
    expect(out).toContain("3 entr(ies) across 2 file(s)");
    expect(out).toContain("unreviewed (reason still the seeded default): 1 of 3");
    expect(out).toMatch(/activerecord\s+2/);
    expect(out).toMatch(/activerecord\/relation\.ts\s+2/);
    expect(out).toContain("By cause bucket: SKIPPED");
  });

  it("shows the unreviewed high-water mark when one is supplied", () => {
    expect(renderReport(entries, undefined, 20, 2)).toContain(
      "unreviewed (reason still the seeded default): 1 of 3 — high-water mark 2",
    );
  });

  it("truncates the per-file listing to the requested top N", () => {
    const out = renderReport(entries, undefined, 1);
    expect(out).toContain("By file (top 1 of 2)");
    expect(out).not.toContain("nodes/node.ts");
  });
});

describe("parseTop", () => {
  it("falls back when --top is absent and parses a positive integer", () => {
    expect(parseTop([], 20)).toBe(20);
    expect(parseTop(["--report", "--top=5"], 20)).toBe(5);
  });

  it("rejects a non-positive or non-integer --top instead of silently defaulting", () => {
    expect(() => parseTop(["--top=x"], 20)).toThrow(/positive integer/);
    expect(() => parseTop(["--top=0"], 20)).toThrow(/positive integer/);
    expect(() => parseTop(["--top=2.5"], 20)).toThrow(/positive integer/);
  });
});

describe("renderStaleTags", () => {
  it("returns null when no tag is stale", () => {
    expect(renderStaleTags([])).toBeNull();
  });

  it("lists each stale tag with its package, file, method and call", () => {
    const out = renderStaleTags([
      { package: "activerecord", tsFile: "relation.ts", tsName: "load", call: "synchronize" },
    ])!;
    expect(out).toContain("1 STALE @missingRailsCall tag(s)");
    expect(out).toContain("  - activerecord  relation.ts  load  synchronize");
  });
});

// The two committed trees are keyed identically by construction (both go
// through `relPathFor`), which is the whole point of sharding the mark: a PR
// that reviews reasons in one source rewrites one small file that no sibling PR
// touches. Pins that the shards stay in step with the baseline they measure.
describe("the committed per-file unreviewed marks", () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const load = async () => ({
    counts: unreviewedCounts(
      await loadSplitBaseline(path.join(HERE, "call-mismatches-exclude")),
      DEFAULT_REASON,
      relPathFor,
    ),
    marks: await loadMarks(path.join(HERE, "call-mismatches-unreviewed")),
  });

  it("sit at or below their own source file's seeded-reason count", async () => {
    const { counts, marks } = await load();
    expect(excessByPath(counts, marks)).toEqual([]);
  });

  // The slack arm of the gate, run without needing a compare artifact.
  it("are tight — no shard claims more unreviewed rows than the baseline carries", async () => {
    const { counts, marks } = await load();
    expect([...marks].filter(([rel, max]) => max > (counts.get(rel) ?? 0))).toEqual([]);
  });

  it("key every shard to a source the baseline still has entries for", async () => {
    const { counts, marks } = await load();
    expect([...marks.keys()].filter((rel) => !counts.has(rel))).toEqual([]);
  });
});

describe("committed baseline", () => {
  it("is well-formed: no duplicate keys, every entry has a package and reason", async () => {
    const committed = await loadBaseline();
    expect(findDuplicateKeys(committed)).toEqual([]);
    for (const e of committed) {
      expect(e.package.trim().length).toBeGreaterThan(0);
      expect(e.reason.trim().length).toBeGreaterThan(0);
    }
  });
});

// --set-reason: the bulk-clearance mode (RFC 0092). What is pinned is the
// predicate, the guard that keeps a reviewed reason from being flattened into a
// class reason, and the serialization round-trip — including an em-dash, since
// an escaped one is exactly what reds the canonical-form gate.
describe("--set-reason categories", () => {
  const cat: ReasonCategory = {
    name: "test-cat",
    calls: ["synchronize"],
    reason: "Ruby guards the body with Mutex#synchronize — the port has no analogue call.",
    note: "test evidence",
    rows: [{ package: "activerecord", tsFile: "model.ts", rubyName: "save" }],
  };

  it("matches on call name and, when given, the named rows only", () => {
    expect(matchesCategory(cat, entry("activerecord", "model.ts", "save", "synchronize"))).toBe(
      true,
    );
    // Right row, wrong call.
    expect(matchesCategory(cat, entry("activerecord", "model.ts", "save", "except"))).toBe(false);
    // Right call, a row the category does not name — the Relation-homonym trap.
    expect(matchesCategory(cat, entry("activerecord", "relation.ts", "size", "synchronize"))).toBe(
      false,
    );
    expect(matchesCategory(cat, entry("arel", "model.ts", "save", "synchronize"))).toBe(false);
  });

  it("matches every row with the call when the category names no rows", () => {
    const wide: ReasonCategory = { ...cat, rows: undefined };
    expect(matchesCategory(wide, entry("arel", "nodes/node.ts", "x", "synchronize"))).toBe(true);
  });

  it("rewrites seeded rows and skips reviewed ones unless forced", () => {
    const entries = [
      entry("activerecord", "model.ts", "save", "synchronize", DEFAULT_REASON),
      entry("activerecord", "model.ts", "save", "except", DEFAULT_REASON),
    ];
    const seeded = applyReason(entries, cat, false);
    expect(seeded.matched.map(keyOf)).toEqual([keyOf(entries[0])]);
    expect(seeded.skipped).toEqual([]);
    expect(seeded.next[0].reason).toBe(cat.reason);
    expect(seeded.next[1].reason).toBe(DEFAULT_REASON);

    const reviewed = [entry("activerecord", "model.ts", "save", "synchronize", "a real finding")];
    const guarded = applyReason(reviewed, cat, false);
    expect(guarded.matched).toEqual([]);
    expect(guarded.skipped.map(keyOf)).toEqual([keyOf(reviewed[0])]);
    expect(guarded.next[0].reason).toBe("a real finding");

    const forced = applyReason(reviewed, cat, true);
    expect(forced.matched.map(keyOf)).toEqual([keyOf(reviewed[0])]);
    expect(forced.skipped).toEqual([]);
    expect(forced.next[0].reason).toBe(cat.reason);
  });

  it("is idempotent: a row already carrying the category reason is neither matched nor skipped", () => {
    const already = [entry("activerecord", "model.ts", "save", "synchronize", cat.reason)];
    const result = applyReason(already, cat, false);
    expect(result.matched).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("round-trips a reason carrying an em-dash through the canonical serialization", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "set-reason-"));
    try {
      const { next } = applyReason(
        [entry("activerecord", "model.ts", "save", "synchronize", DEFAULT_REASON)],
        cat,
        false,
      );
      await writeSplitBaseline(next, dir);
      const text = await fs.readFile(path.join(dir, "activerecord", "model.json"), "utf-8");
      expect(text).toContain("—");
      expect(text).not.toContain("\\u2014");
      expect(
        await findNonCanonicalBaselines([path.join(dir, "activerecord", "model.json")]),
      ).toEqual([]);
      expect((await loadSplitBaseline(dir))[0].reason).toBe(cat.reason);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("parses the category name in both spellings and reports a missing value", () => {
    expect(parseSetReason(["--report"])).toBe(undefined);
    expect(parseSetReason(["--set-reason", "mutex-sync-body"])).toBe("mutex-sync-body");
    expect(parseSetReason(["--set-reason=mutex-sync-body"])).toBe("mutex-sync-body");
    expect(parseSetReason(["--set-reason", "--dry-run"])).toBe("");
    expect(parseSetReason(["--set-reason"])).toBe("");
  });

  it("defines every category with a distinct name, a reason and its evidence", () => {
    expect(new Set(REASON_CATEGORIES.map((c) => c.name)).size).toBe(REASON_CATEGORIES.length);
    for (const c of REASON_CATEGORIES) {
      expect(findCategory(c.name)).toBe(c);
      expect(c.calls.length).toBeGreaterThan(0);
      expect(c.reason.trim().length).toBeGreaterThan(0);
      expect(c.note.trim().length).toBeGreaterThan(0);
      expect(c.reason).not.toBe(DEFAULT_REASON);
    }
  });

  // The mode is only usable if the categories it ships have already been
  // applied — a matching row still carrying the seeded default means the
  // committed baseline and the table disagree.
  it("leaves no committed row matching a defined category unreviewed", async () => {
    const committed = await loadBaseline();
    for (const c of REASON_CATEGORIES) {
      const { matched, skipped } = applyReason(committed, c, false);
      expect({ name: c.name, matched: matched.length, skipped: skipped.length }).toEqual({
        name: c.name,
        matched: 0,
        skipped: 0,
      });
    }
  });
});

describe("the shared shards", () => {
  it("holds no args row today, so the call-set row count is what it was before RFC 0095", async () => {
    const all = await loadSplitBaseline(BASELINE_DIR);
    expect(await loadForeignRows()).toEqual([]);
    expect((await loadBaseline()).length).toBe(all.length);
  });
});
