import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type { ExcludeEntry } from "./call-mismatch-baseline.js";
import {
  droppedReviewed,
  droppedSeeded,
  renderDroppedSeeded,
  DROPPED_SEEDED_KEYS_ARG,
  excessByPath,
  heldOutCounts,
  loadMarks,
  newlySeeded,
  renderDroppedReviewed,
  nextMarks,
  parseMark,
  renderExcess,
  renderSlack,
  renderWriteSummary,
  slackByPath,
  totalMark,
  unreviewedCounts,
  unreviewedEntries,
  writeMarks,
  type MarkSet,
} from "./unreviewed-ratchet.js";

const SEED = "seeded default reason";

const entry = (call: string, reason = SEED, tsFile = "relation.ts"): ExcludeEntry => ({
  package: "activerecord",
  tsFile,
  rubyName: "load",
  call,
  reason,
});

// The sharded key: the same `<package>/<tsFile .ts→.json>` the split exclude
// baseline uses (relPathFor in lint-call-mismatches-wide.ts), injected here so
// this module never depends on the gate that consumes it.
const pathFor = (k: { package: string; tsFile: string }): string =>
  path.join(k.package, k.tsFile.replace(/\.ts$/, ".json"));

const REL = path.join("activerecord", "relation.json");
const MODEL = path.join("activerecord", "model.json");
const marks = (entries: Record<string, number>): MarkSet => new Map(Object.entries(entries));

describe("unreviewedEntries", () => {
  it("selects only entries whose reason is verbatim the seed", () => {
    const rows = [entry("a"), entry("b", "reviewed: satisfied by Arel"), entry("c", SEED + " ")];
    expect(unreviewedEntries(rows, SEED).map((e) => e.call)).toEqual(["a"]);
  });
});

describe("newlySeeded", () => {
  it("reports rows this reseed seeded, distinct from pre-existing unreviewed ones", () => {
    const prior = [entry("a"), entry("b", "reviewed")];
    const next = [entry("a"), entry("b", "reviewed"), entry("c")];
    expect(newlySeeded(next, prior, SEED).map((k) => k.call)).toEqual(["c"]);
  });

  it("does not count a pre-existing row that lost its real reason as newly seeded", () => {
    const prior = [entry("a", "reviewed")];
    expect(newlySeeded([entry("a")], prior, SEED)).toEqual([]);
  });
});

describe("unreviewedCounts", () => {
  it("tallies seeded rows per source file, skipping reviewed ones", () => {
    const rows = [entry("a"), entry("b"), entry("c", "reviewed"), entry("d", SEED, "model.ts")];
    expect([...unreviewedCounts(rows, SEED, pathFor)]).toEqual([
      [REL, 2],
      [MODEL, 1],
    ]);
  });

  it("omits a source whose every row is reviewed rather than recording a zero", () => {
    expect([...unreviewedCounts([entry("a", "reviewed")], SEED, pathFor)]).toEqual([]);
  });
});

describe("nextMarks", () => {
  it("lowers each file's mark to that file's own count", () => {
    expect([
      ...nextMarks(marks({ [REL]: 130, [MODEL]: 4 }), marks({ [REL]: 131, [MODEL]: 9 })),
    ]).toEqual([
      [REL, 130],
      [MODEL, 4],
    ]);
  });

  it("never raises a file's mark", () => {
    expect(nextMarks(marks({ [REL]: 140 }), marks({ [REL]: 131 })).get(REL)).toBe(131);
  });

  it("drops a source that reached zero rather than storing {max: 0}", () => {
    expect([...nextMarks(marks({}), marks({ [REL]: 131 }))]).toEqual([]);
  });

  it("takes the count itself for a source that had no mark yet", () => {
    expect(nextMarks(marks({ [MODEL]: 3 }), marks({ [REL]: 1 })).get(MODEL)).toBe(3);
  });
});

describe("heldOutCounts", () => {
  it("subtracts this reseed's newly-seeded rows from their own file's count", () => {
    const counts = marks({ [REL]: 3, [MODEL]: 2 });
    const held = heldOutCounts(counts, [entry("c"), entry("d", SEED, "model.ts")], pathFor);
    expect([...held]).toEqual([
      [REL, 2],
      [MODEL, 1],
    ]);
  });

  // The whole point of the shard: a reseed into model.ts must not lower — or be
  // paid for by — relation.ts's mark.
  it("leaves an untouched file's count alone", () => {
    expect(
      heldOutCounts(marks({ [REL]: 3 }), [entry("x", SEED, "model.ts")], pathFor).get(REL),
    ).toBe(3);
  });
});

describe("totalMark", () => {
  it("sums the shards into the one number the console reports", () => {
    expect(totalMark(marks({ [REL]: 131, [MODEL]: 4 }))).toBe(135);
  });
});

describe("the per-file aggregate contract", () => {
  // Pins the documented limit (unreviewed-ratchet.ts header): the gate compares
  // one number PER SOURCE FILE, so a hand-edited baseline that swaps a reviewed
  // row for a newly seeded one IN THE SAME FILE passes. The guarantee is that
  // the file's total never rises, NOT that every new entry individually carries
  // a real reason.
  it("passes a one-for-one same-file swap of a reviewed reason for a newly seeded row", () => {
    const after = [entry("a", "reviewed: satisfied by Arel"), entry("b"), entry("c")];
    expect(excessByPath(unreviewedCounts(after, SEED, pathFor), marks({ [REL]: 2 }))).toEqual([]);
  });

  it("still fails when the swap grows that file's total", () => {
    const after = [entry("a"), entry("b"), entry("c")];
    expect(excessByPath(unreviewedCounts(after, SEED, pathFor), marks({ [REL]: 2 }))).toEqual([
      { file: REL, count: 3, mark: 2 },
    ]);
  });

  // `--write` DOES have both states, so the per-key rule binds on the reseed
  // path: the new row is held out of the lowered mark and the gate goes red.
  it("holds a newly seeded row out of its own file's mark on the reseed path", () => {
    const prior = [entry("a"), entry("b")];
    const next = [entry("a", "reviewed"), entry("b"), entry("c")];
    const newly = newlySeeded(next, prior, SEED);
    const counts = unreviewedCounts(next, SEED, pathFor);
    expect(newly.map((k) => k.call)).toEqual(["c"]);
    expect(counts.get(REL)).toBe(2);
    expect(nextMarks(heldOutCounts(counts, newly, pathFor), marks({ [REL]: 2 })).get(REL)).toBe(1);
  });

  // A review in one source can no longer pay for a seeded row added in another
  // — the arm the single repo-wide number could not make.
  it("fails a cross-file swap that the old repo-wide number would have passed", () => {
    const counts = unreviewedCounts([entry("a"), entry("b", SEED, "model.ts")], SEED, pathFor);
    const committed = marks({ [REL]: 2, [MODEL]: 0 });
    expect(excessByPath(counts, committed).map((d) => d.file)).toEqual([MODEL]);
  });
});

describe("parseMark", () => {
  it("reads the committed shape", () => {
    expect(parseMark('{ "max": 12 }')).toBe(12);
  });

  it.each(['{ "max": -1 }', '{ "max": 1.5 }', '{ "max": "12" }', "{}", "null"])(
    "rejects %s",
    (text) => {
      expect(() => parseMark(text)).toThrow(/non-negative integer/);
    },
  );
});

describe("loadMarks / writeMarks", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "unreviewed-mark-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("round-trips each shard through the canonical baseline serialization", async () => {
    await writeMarks(dir, marks({ [REL]: 7, [MODEL]: 2 }));
    expect(await fs.readFile(path.join(dir, REL), "utf-8")).toBe('{\n  "max": 7\n}\n');
    expect([...(await loadMarks(dir))]).toEqual([
      [MODEL, 2],
      [REL, 7],
    ]);
  });

  it("mirrors the source tree, creating parent dirs for a nested source", async () => {
    const nested = path.join("activerecord", "connection-adapters/sqlite3/statements.json");
    await writeMarks(dir, marks({ [nested]: 3 }));
    expect((await loadMarks(dir)).get(nested)).toBe(3);
  });

  // Same rule as the exclude tree: a converged source leaves no `{"max": 0}`
  // residue, so a post-reseed diff shows only real changes.
  it("deletes a shard that reached zero and prunes the dirs it emptied", async () => {
    const nested = path.join("activerecord", "connection-adapters/sqlite3/statements.json");
    await writeMarks(dir, marks({ [REL]: 7, [nested]: 3 }));
    await writeMarks(dir, marks({ [REL]: 7 }));
    expect([...(await loadMarks(dir))]).toEqual([[REL, 7]]);
    await expect(
      fs.readdir(path.join(dir, "activerecord", "connection-adapters")),
    ).rejects.toThrow();
  });

  // A non-positive max would round-trip through parseMark as a hard error, so
  // it is dropped on the way out rather than committed.
  it("never writes a non-positive shard even when handed one", async () => {
    await writeMarks(dir, marks({ [REL]: 7, [MODEL]: 0, [path.join("arel", "n.json")]: -1 }));
    expect([...(await loadMarks(dir))]).toEqual([[REL, 7]]);
  });

  // A source with no shard reads as 0 — the strict direction, so a deleted
  // shard reds the gate on its file's first unreviewed row.
  it("reports a source with no shard as zero, not as unbounded headroom", async () => {
    await writeMarks(dir, marks({ [REL]: 7 }));
    const loaded = await loadMarks(dir);
    expect(excessByPath(marks({ [MODEL]: 1 }), loaded)).toEqual([
      { file: MODEL, count: 1, mark: 0 },
    ]);
  });

  // Deleting the tree cannot silently disarm the ratchet: every seeded row then
  // exceeds a mark of 0 and the excess arm names each file. Erroring instead
  // would make the ratchet throw on its own success state (the last shard is
  // deleted when the last seeded reason is reviewed).
  it("reads a missing tree as an empty mark set, leaving the excess arm to red the gate", async () => {
    expect([...(await loadMarks(path.join(dir, "never-written")))]).toEqual([]);
    expect(excessByPath(marks({ [REL]: 131 }), await loadMarks(dir))).toEqual([
      { file: REL, count: 131, mark: 0 },
    ]);
  });
});

describe("excessByPath", () => {
  it("reports only the files over their own mark, worst overshoot first", () => {
    const over = excessByPath(marks({ [REL]: 5, [MODEL]: 9 }), marks({ [REL]: 4, [MODEL]: 4 }));
    expect(over).toEqual([
      { file: MODEL, count: 9, mark: 4 },
      { file: REL, count: 5, mark: 4 },
    ]);
  });

  it("treats a file with no committed shard as a mark of zero", () => {
    expect(excessByPath(marks({ [MODEL]: 2 }), marks({}))).toEqual([
      { file: MODEL, count: 2, mark: 0 },
    ]);
  });

  it("says nothing about a file sitting at or under its mark", () => {
    expect(excessByPath(marks({ [REL]: 4 }), marks({ [REL]: 4 }))).toEqual([]);
  });
});

describe("renderExcess", () => {
  it("names the excess as the newly-seeded rows held out of each file's mark", () => {
    const msg = renderExcess([{ file: REL, count: 133, mark: 131 }], "scripts/api-compare/marks");
    expect(msg).toContain("2 baselined entr(ies) across 1 source file(s)");
    // Both ways a row can gain the placeholder — a reseed, or a reverted reason.
    expect(msg).toContain("reverted to the seed");
    expect(msg).toContain("only shrinks");
    expect(msg).toContain(`  + ${REL}  133 unreviewed, mark 131`);
  });
});

describe("renderWriteSummary", () => {
  it("lists newly-seeded keys separately from the marks it wrote", () => {
    const msg = renderWriteSummary(10, [entry("c")], marks({ [REL]: 7, [MODEL]: 2 }), "marks");
    expect(msg).toContain("2 per-file unreviewed high-water mark(s) totalling 9");
    expect(msg).toContain("1 of those were seeded by THIS reseed");
    expect(msg).toContain("activerecord  relation.ts  load  c");
  });

  it("says nothing about newly-seeded rows when there are none", () => {
    expect(renderWriteSummary(10, [], marks({ [REL]: 10 }), "marks")).not.toContain("THIS reseed");
  });
});

describe("droppedReviewed", () => {
  it("reports a hand-reviewed row that stopped flagging", () => {
    const prior = [entry("a", "verified: real divergence"), entry("b")];
    expect(droppedReviewed([entry("b")], prior, SEED).map((e) => e.call)).toEqual(["a"]);
  });

  it("ignores dropped rows that were never reviewed", () => {
    expect(droppedReviewed([], [entry("a")], SEED)).toEqual([]);
  });

  it("ignores reviewed rows that still flag", () => {
    const reviewed = entry("a", "verified: real divergence");
    expect(droppedReviewed([reviewed], [reviewed], SEED)).toEqual([]);
  });

  it("says nothing when no reviewed row was dropped", () => {
    expect(renderDroppedReviewed([])).toBe("");
  });

  it("names each dropped reviewed row so the author can spot-check it", () => {
    const msg = renderDroppedReviewed([entry("a", "verified: real divergence")]);
    expect(msg).toContain("1 reviewed entr(ies)");
    expect(msg).toContain("activerecord  relation.ts  load  a");
  });
});

describe("droppedSeeded", () => {
  it("reports a seeded row that stopped flagging", () => {
    const prior = [entry("a"), entry("b")];
    expect(droppedSeeded([entry("b")], prior, SEED).map((e) => e.call)).toEqual(["a"]);
  });

  it("leaves dropped hand-reviewed rows to droppedReviewed", () => {
    expect(droppedSeeded([], [entry("a", "verified: real divergence")], SEED)).toEqual([]);
  });

  it("ignores seeded rows that still flag", () => {
    expect(droppedSeeded([entry("a")], [entry("a")], SEED)).toEqual([]);
  });

  it("says nothing when no seeded row was dropped", () => {
    expect(renderDroppedSeeded([], true)).toBe("");
  });

  it("reports a count and points at the flag when keys are not requested", () => {
    const msg = renderDroppedSeeded([entry("a"), entry("b")], false);
    expect(msg).toContain("2 seeded entr(ies)");
    expect(msg).toContain(DROPPED_SEEDED_KEYS_ARG);
    expect(msg).not.toContain("relation.ts");
  });

  it("names each dropped seeded row when the keys are requested", () => {
    const msg = renderDroppedSeeded([entry("a")], true);
    expect(msg).toContain("1 seeded entr(ies)");
    expect(msg).toContain("activerecord  relation.ts  load  a");
  });
});

describe("slackByPath", () => {
  it("reports each file whose own mark sits above its count, slackest first", () => {
    expect(slackByPath(marks({ [REL]: 130 }), marks({ [REL]: 131, [MODEL]: 4 }))).toEqual([
      { file: MODEL, count: 0, mark: 4 },
      { file: REL, count: 130, mark: 131 },
    ]);
  });

  // An orphan shard — a mark whose source converged out of the baseline
  // entirely — is pure slack, and the next `--write` deletes it.
  it("catches an orphan shard whose source has no unreviewed rows left", () => {
    expect(slackByPath(marks({}), marks({ [MODEL]: 4 }))).toEqual([
      { file: MODEL, count: 0, mark: 4 },
    ]);
  });

  it("leaves a file above its mark to the excess arm", () => {
    expect(slackByPath(marks({ [REL]: 132 }), marks({ [REL]: 131 }))).toEqual([]);
  });
});

describe("renderSlack", () => {
  it("names the files, the slack, and the one-command fix", () => {
    const msg = renderSlack([{ file: REL, count: 2787, mark: 2837 }], "scripts/api-compare/marks");
    expect(msg).toContain("STALE high-water mark");
    expect(msg).toContain("1 file(s)");
    expect(msg).toContain("50 of slack");
    expect(msg).toContain(`  - ${REL}  mark 2837, only 2787 unreviewed`);
    expect(msg).toContain("pnpm api:calls:wide:reseed");
  });
});
