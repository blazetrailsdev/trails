import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type { ExcludeEntry } from "./lint-call-mismatches.js";
import {
  loadMark,
  newlySeeded,
  nextMark,
  parseMark,
  renderExcess,
  renderWriteSummary,
  unreviewedEntries,
  writeMark,
} from "./unreviewed-ratchet.js";

const SEED = "seeded default reason";

const entry = (call: string, reason = SEED): ExcludeEntry => ({
  package: "activerecord",
  tsFile: "relation.ts",
  rubyName: "load",
  call,
  reason,
});

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

describe("nextMark", () => {
  it("lowers the mark to the current count", () => {
    expect(nextMark(4400, 4441)).toBe(4400);
  });

  it("never raises it", () => {
    expect(nextMark(4600, 4441)).toBe(4441);
  });
});

describe("the aggregate contract", () => {
  // Pins the documented limit (unreviewed-ratchet.ts header): the gate compares
  // one number, so a hand-edited baseline that swaps a reviewed row for a newly
  // seeded one passes. The guarantee is that the total never rises, NOT that
  // every new entry individually carries a real reason.
  it("passes a one-for-one swap of a reviewed reason for a newly seeded row", () => {
    const before = [entry("a"), entry("b")];
    const mark = unreviewedEntries(before, SEED).length;
    const after = [entry("a", "reviewed: satisfied by Arel"), entry("b"), entry("c")];
    expect(unreviewedEntries(after, SEED).length).toBe(mark);
  });

  it("still fails when the swap grows the total", () => {
    const after = [entry("a"), entry("b"), entry("c")];
    expect(unreviewedEntries(after, SEED).length).toBeGreaterThan(2);
  });

  // `--write` DOES have both states, so the per-key rule binds on the reseed
  // path: the new row is held out of the lowered mark and the gate goes red.
  it("holds a newly seeded row out of the mark on the reseed path", () => {
    const prior = [entry("a"), entry("b")];
    const next = [entry("a", "reviewed"), entry("b"), entry("c")];
    const newly = newlySeeded(next, prior, SEED);
    const count = unreviewedEntries(next, SEED).length;
    expect(newly.map((k) => k.call)).toEqual(["c"]);
    expect(nextMark(count - newly.length, 2)).toBe(1);
    expect(count).toBeGreaterThan(1);
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

describe("loadMark / writeMark", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "unreviewed-mark-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("round-trips through the canonical baseline serialization", async () => {
    const file = path.join(dir, "mark.json");
    await writeMark(file, 7);
    expect(await fs.readFile(file, "utf-8")).toBe('{\n  "max": 7\n}\n');
    expect(await loadMark(file)).toBe(7);
  });

  it("names the missing ratchet file rather than surfacing a bare ENOENT", async () => {
    await expect(loadMark(path.join(dir, "gone.json"))).rejects.toThrow(/committed ratchet file/);
  });
});

describe("renderExcess", () => {
  it("names the excess as the newly-seeded rows held out of the mark", () => {
    const msg = renderExcess(4445, 4441, "scripts/api-compare/mark.json");
    expect(msg).toContain("4445");
    expect(msg).toContain("4 more than the committed high-water mark of 4441");
    // Both ways a row can gain the placeholder — a reseed, or a reverted reason.
    expect(msg).toContain("reverted to the seed");
    expect(msg).toContain("only shrinks");
  });
});

describe("renderWriteSummary", () => {
  it("lists newly-seeded keys separately from the mark", () => {
    const msg = renderWriteSummary(10, [entry("c")], 9, "mark.json");
    expect(msg).toContain("unreviewed high-water mark 9");
    expect(msg).toContain("1 of those were seeded by THIS reseed");
    expect(msg).toContain("activerecord  relation.ts  load  c");
  });

  it("says nothing about newly-seeded rows when there are none", () => {
    expect(renderWriteSummary(10, [], 10, "mark.json")).not.toContain("THIS reseed");
  });
});
