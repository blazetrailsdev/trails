import * as fs from "fs/promises";
import { describe, expect, it } from "vitest";
import { staleMarkFailure } from "./param-name-mark.js";
import {
  COUNTED_PACKAGES,
  GATED_PACKAGES,
  MARK_DIMENSIONS,
  MARK_PATH,
  ROWLESS_PACKAGES,
  TAGGED_ONLY_PACKAGES,
  UNGATED_ALLOWED_PACKAGES,
  exceedances,
  incompleteMarks,
  internalViolations,
  measure,
  measureInternal,
  serializeMarks,
  staleMarks,
  strandedMarks,
  taggedOnlyViolations,
  tightened,
  tightenedInternal,
  unmarkedPackages,
  unmeasuredPackages,
  type SurfaceMarks,
} from "./extra-surface-mark.js";

const marks: SurfaceMarks = {
  activerecord: { novel: 0, total: 63, noCounterpartFiles: 0, allowed: 0 },
};
const zeroMarks: SurfaceMarks = {
  "ruby-compat": { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0 },
};

describe("extra-surface mark", () => {
  it("keeps the committed mark file byte-identical to what writeMarks writes", async () => {
    const committed = await fs.readFile(MARK_PATH, "utf-8");
    expect(committed).toBe(serializeMarks(JSON.parse(committed) as SurfaceMarks));
  });

  it("sorts keys, indents by two and ends with a newline", () => {
    const rack = { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0 };
    const arel = { novel: 1, total: 2, noCounterpartFiles: 0, allowed: 0 };
    expect(serializeMarks({ rack, arel })).toBe(
      '{\n  "arel": {\n    "novel": 1,\n    "total": 2,\n    "noCounterpartFiles": 0,\n    "allowed": 0\n  },\n' +
        '  "rack": {\n    "novel": 0,\n    "total": 0,\n    "noCounterpartFiles": 0,\n    "allowed": 0\n  }\n}\n',
    );
  });

  it("measures only the gated packages", () => {
    const measured = measure([
      {
        package: "arel",
        totalNovel: 0,
        totalExtras: 63,
        noCounterpartFiles: 0,
        totalAllowlisted: 0,
        totalInternal: 4,
        inlinedFrom: [],
      },
      {
        package: "activerecord",
        totalNovel: 399,
        totalExtras: 1424,
        noCounterpartFiles: 0,
        totalAllowlisted: 0,
        totalInternal: 4,
        inlinedFrom: [],
      },
      {
        package: "ruby-compat",
        totalNovel: 0,
        totalExtras: 0,
        noCounterpartFiles: 0,
        totalAllowlisted: 0,
        totalInternal: 4,
        inlinedFrom: [],
      },
      {
        package: "activesupport",
        totalNovel: 12,
        totalExtras: 34,
        noCounterpartFiles: 0,
        totalAllowlisted: 0,
        totalInternal: 4,
        inlinedFrom: [],
      },
    ]);
    expect(measured).toEqual({
      arel: { novel: 0, total: 63, noCounterpartFiles: 0, allowed: 0, inlinedFrom: 0 },
      activerecord: { novel: 399, total: 1424, noCounterpartFiles: 0, allowed: 0 },
      "ruby-compat": { novel: 0, total: 0, noCounterpartFiles: 0 },
    });
  });

  it("ratchets internal for every gated package, rowless ones included", () => {
    expect(
      measureInternal([
        {
          package: "arel",
          totalNovel: 0,
          totalExtras: 0,
          noCounterpartFiles: 0,
          totalAllowlisted: 0,
          totalInternal: 288,
          inlinedFrom: [],
        },
        {
          package: "activesupport",
          totalNovel: 1,
          totalExtras: 1,
          noCounterpartFiles: 0,
          totalAllowlisted: 0,
          totalInternal: 9,
          inlinedFrom: [],
        },
      ]),
    ).toEqual({ arel: 288 });
    const marks = { arel: 288, "ruby-compat": 3 };
    expect(internalViolations(marks, { arel: 290, "ruby-compat": 1, thor: 4 })).toEqual({
      grew: [{ package: "arel", dimension: "internal", mark: 288, current: 290 }],
      stale: [{ package: "ruby-compat", dimension: "internal", mark: 3, current: 1 }],
      unmarked: ["thor"],
    });
    expect(tightenedInternal(marks, { arel: 290, "ruby-compat": 1 })).toEqual({
      arel: 288,
      "ruby-compat": 1,
    });
  });

  it("names a gated package the mark file never seeded", () => {
    expect(unmarkedPackages({})).toEqual([
      "actioncontroller",
      "actiondispatch",
      "ruby-compat",
      "thor",
    ]);
    expect(
      unmarkedPackages({
        "ruby-compat": { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual(["actioncontroller", "actiondispatch", "thor"]);
  });

  it("demands a mark from a tagged-only package too, because total stays gated", () => {
    expect(unmarkedPackages({})).toContain("ruby-compat");
  });

  it("demands no mark from a rowless package, and refuses one re-added", () => {
    expect(unmarkedPackages({})).not.toContain("activerecord");
    expect(
      strandedMarks({ "ruby-compat": { novel: 0, total: 35, noCounterpartFiles: 0, allowed: 0 } }),
    ).toEqual([]);
    expect(
      strandedMarks({ activerecord: { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0 } }),
    ).toEqual(["activerecord"]);
  });

  it("enrolls activemodel as rowless", () => {
    expect(ROWLESS_PACKAGES).toContain("activemodel");
    expect(GATED_PACKAGES).toContain("activemodel");
    expect(unmarkedPackages({})).not.toContain("activemodel");
    expect(
      unmeasuredPackages({
        activerecord: { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toContain("activemodel");
    expect(
      strandedMarks({ activemodel: { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0 } }),
    ).toEqual(["activemodel"]);
    expect(
      taggedOnlyViolations({
        activemodel: { novel: 1, total: 2, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([
      { package: "activemodel", dimension: "novel", mark: 0, current: 1 },
      { package: "activemodel", dimension: "total", mark: 0, current: 2 },
    ]);
  });

  it("enrolls arel as rowless, with its inlined-from bucket pinned at zero too", () => {
    expect(ROWLESS_PACKAGES).toContain("arel");
    expect(unmarkedPackages({})).not.toContain("arel");
    expect(
      strandedMarks({
        arel: { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0, inlinedFrom: 0 },
      }),
    ).toEqual(["arel"]);
    expect(
      taggedOnlyViolations({
        arel: { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0, inlinedFrom: 0 },
      }),
    ).toEqual([]);
    expect(
      taggedOnlyViolations({
        arel: { novel: 0, total: 1, noCounterpartFiles: 0, allowed: 0, inlinedFrom: 2 },
      }),
    ).toEqual([
      { package: "arel", dimension: "total", mark: 0, current: 1 },
      { package: "arel", dimension: "inlinedFrom", mark: 0, current: 2 },
    ]);
  });

  it("pins a rowless package at zero in both dimensions with no mark to consult", () => {
    expect(
      taggedOnlyViolations({
        activerecord: { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([]);
    expect(
      taggedOnlyViolations({
        activerecord: { novel: 0, total: 1, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([{ package: "activerecord", dimension: "total", mark: 0, current: 1 }]);
    expect(
      taggedOnlyViolations({
        activerecord: { novel: 1, total: 1, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([
      { package: "activerecord", dimension: "novel", mark: 0, current: 1 },
      { package: "activerecord", dimension: "total", mark: 0, current: 1 },
    ]);
  });

  it("holds a tagged-only package at zero novel with no mark to consult", () => {
    expect(
      taggedOnlyViolations({
        "ruby-compat": { novel: 0, total: 63, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([]);
    expect(
      taggedOnlyViolations({
        "ruby-compat": { novel: 2, total: 65, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([{ package: "ruby-compat", dimension: "novel", mark: 0, current: 2 }]);
  });

  it("still gates a tagged-only package's moved-not-novel total against its mark", () => {
    const rubyCompatMark: SurfaceMarks = {
      "ruby-compat": { novel: 0, total: 35, noCounterpartFiles: 0, allowed: 0 },
    };
    expect(
      exceedances(rubyCompatMark, {
        "ruby-compat": { novel: 0, total: 36, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([{ package: "ruby-compat", dimension: "total", mark: 35, current: 36 }]);
    expect(
      staleMarks(rubyCompatMark, {
        "ruby-compat": { novel: 0, total: 34, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([{ package: "ruby-compat", dimension: "total", mark: 35, current: 34 }]);
    const failure = staleMarkFailure(
      "extra-surface gate",
      "parity:api:extra:tighten",
      staleMarks(rubyCompatMark, {
        "ruby-compat": { novel: 0, total: 34, noCounterpartFiles: 0, allowed: 0 },
      }),
    )!;
    expect(failure).toContain("extra-surface gate: 1 STALE mark dimension(s)");
    expect(failure).toContain("pnpm parity:api:extra:tighten");
    expect(failure).toContain("ruby-compat  total: mark 35 → current 34");
    expect(
      staleMarkFailure("extra-surface gate", "t", staleMarks(rubyCompatMark, rubyCompatMark)),
    ).toBeNull();
    expect(
      tightened(rubyCompatMark, {
        "ruby-compat": { novel: 0, total: 34, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual({
      "ruby-compat": { novel: 0, total: 34, noCounterpartFiles: 0, allowed: 0 },
    });
  });

  it("pins a tagged-only package's novel at zero even if its row were widened", () => {
    const widened: SurfaceMarks = {
      "ruby-compat": { novel: 99, total: 35, noCounterpartFiles: 0, allowed: 0 },
    };
    expect(
      exceedances(widened, {
        "ruby-compat": { novel: 7, total: 35, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([]);
    expect(
      taggedOnlyViolations({
        "ruby-compat": { novel: 7, total: 35, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([{ package: "ruby-compat", dimension: "novel", mark: 0, current: 7 }]);
  });

  it("skips a package with no mark rather than gating it, which is why the seed is checked", () => {
    expect(
      exceedances(marks, {
        activerecord: { novel: 0, total: 63, noCounterpartFiles: 0, allowed: 0 },
        "ruby-compat": { novel: 9999, total: 9999, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([]);
    expect(
      staleMarks(marks, {
        activerecord: { novel: 0, total: 63, noCounterpartFiles: 0, allowed: 0 },
        "ruby-compat": { novel: 1, total: 1, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([]);
  });

  it("passes when both dimensions hold at the mark", () => {
    expect(
      exceedances(marks, {
        activerecord: { novel: 0, total: 63, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([]);
  });

  it("fails on a novel-count increase", () => {
    expect(
      exceedances(marks, {
        activerecord: { novel: 1, total: 64, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([
      { package: "activerecord", dimension: "novel", mark: 0, current: 1 },
      { package: "activerecord", dimension: "total", mark: 63, current: 64 },
    ]);
  });

  it("fails on a total increase even when novel holds", () => {
    expect(
      exceedances(marks, {
        activerecord: { novel: 0, total: 64, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([{ package: "activerecord", dimension: "total", mark: 63, current: 64 }]);
  });

  it("reports a mark left above the current measurement", () => {
    expect(
      staleMarks(marks, {
        activerecord: { novel: 0, total: 60, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([{ package: "activerecord", dimension: "total", mark: 63, current: 60 }]);
  });

  it("tightens down and never up", () => {
    expect(
      tightened(marks, {
        activerecord: { novel: 0, total: 60, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual({
      activerecord: { novel: 0, total: 60, noCounterpartFiles: 0, allowed: 0 },
    });
    expect(
      tightened(marks, {
        activerecord: { novel: 3, total: 70, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual({
      activerecord: { novel: 0, total: 63, noCounterpartFiles: 0, allowed: 0 },
    });
  });

  it("holds ruby-compat at zero, so any public name at all is an exceedance", () => {
    expect(
      exceedances(zeroMarks, {
        "ruby-compat": { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([]);
    expect(
      exceedances(zeroMarks, {
        "ruby-compat": { novel: 1, total: 1, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual([
      { package: "ruby-compat", dimension: "novel", mark: 0, current: 1 },
      { package: "ruby-compat", dimension: "total", mark: 0, current: 1 },
    ]);
  });

  it("cannot tighten ruby-compat below zero, and never widens it", () => {
    expect(
      tightened(zeroMarks, {
        "ruby-compat": { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual({
      "ruby-compat": { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0 },
    });
    expect(
      tightened(zeroMarks, {
        "ruby-compat": { novel: 4, total: 4, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toEqual({
      "ruby-compat": { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0 },
    });
  });

  it("names a gated package the run never measured", () => {
    expect(unmeasuredPackages({})).toEqual([...GATED_PACKAGES]);
  });

  it("still demands a measurement for a tagged-only package, which has no mark to miss", () => {
    expect(
      unmeasuredPackages({
        activerecord: { novel: 1, total: 1, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toContain("ruby-compat");
    expect(
      unmeasuredPackages({
        "ruby-compat": { novel: 0, total: 1, noCounterpartFiles: 0, allowed: 0 },
      }),
    ).toContain("activerecord");
  });

  it("lists every row dimension once, for the gate, the stale report and the tightener", () => {
    expect(MARK_DIMENSIONS).toEqual(["novel", "total", "noCounterpartFiles", "allowed"]);
  });

  it("fails on growth in noCounterpartFiles and in allowed", () => {
    const mark: SurfaceMarks = {
      thor: { novel: 0, total: 0, noCounterpartFiles: 2, allowed: 5 },
    };
    expect(
      exceedances(mark, { thor: { novel: 0, total: 0, noCounterpartFiles: 3, allowed: 6 } }),
    ).toEqual([
      { package: "thor", dimension: "noCounterpartFiles", mark: 2, current: 3 },
      { package: "thor", dimension: "allowed", mark: 5, current: 6 },
    ]);
  });

  it("reports a shrink in noCounterpartFiles and in allowed as stale, not failed", () => {
    const mark: SurfaceMarks = {
      thor: { novel: 0, total: 0, noCounterpartFiles: 2, allowed: 5 },
    };
    const now: SurfaceMarks = {
      thor: { novel: 0, total: 0, noCounterpartFiles: 1, allowed: 4 },
    };
    expect(exceedances(mark, now)).toEqual([]);
    expect(staleMarks(mark, now)).toEqual([
      { package: "thor", dimension: "noCounterpartFiles", mark: 2, current: 1 },
      { package: "thor", dimension: "allowed", mark: 5, current: 4 },
    ]);
  });

  it("tightens noCounterpartFiles and allowed down and never up", () => {
    const mark: SurfaceMarks = {
      thor: { novel: 0, total: 0, noCounterpartFiles: 2, allowed: 5 },
    };
    expect(
      tightened(mark, { thor: { novel: 0, total: 0, noCounterpartFiles: 1, allowed: 4 } }),
    ).toEqual({ thor: { novel: 0, total: 0, noCounterpartFiles: 1, allowed: 4 } });
    expect(
      tightened(mark, { thor: { novel: 0, total: 0, noCounterpartFiles: 9, allowed: 9 } }),
    ).toEqual(mark);
  });

  it("does not gate ruby-compat's allowed, which grows with its receipted inventory", () => {
    const mark: SurfaceMarks = { "ruby-compat": { novel: 0, total: 0, noCounterpartFiles: 1 } };
    const now: SurfaceMarks = {
      "ruby-compat": { novel: 0, total: 0, noCounterpartFiles: 1, allowed: 99 },
    };
    expect(exceedances(mark, now)).toEqual([]);
    expect(staleMarks(mark, now)).toEqual([]);
  });

  it("does not pin a rowless package's noCounterpartFiles or allowed", () => {
    expect(
      taggedOnlyViolations({ arel: { novel: 0, total: 0, noCounterpartFiles: 3, allowed: 40 } }),
    ).toEqual([]);
  });

  it("names a gated dimension a committed row is missing", () => {
    expect(
      incompleteMarks({
        thor: { novel: 0, total: 0, noCounterpartFiles: 0, allowed: 0 },
        "ruby-compat": { novel: 0, total: 0, noCounterpartFiles: 0 },
      }),
    ).toEqual([]);
    expect(
      incompleteMarks({
        thor: { novel: 0, total: 0, allowed: 0 } as unknown as SurfaceMarks[string],
        actiondispatch: { novel: 0, total: 0, noCounterpartFiles: 0 },
      }),
    ).toEqual(["actiondispatch allowed", "thor noCounterpartFiles"]);
  });

  it("leaves allowed ungated for ruby-compat only", () => {
    expect(UNGATED_ALLOWED_PACKAGES).toEqual(["ruby-compat"]);
  });

  it("gates every package in exactly one mode", () => {
    const counted = new Set<string>(COUNTED_PACKAGES);
    const taggedOnly = new Set<string>(TAGGED_ONLY_PACKAGES);
    const rowless = new Set<string>(ROWLESS_PACKAGES);
    const all = [...counted, ...taggedOnly, ...rowless];
    expect(new Set(all).size).toEqual(all.length);
    expect([...GATED_PACKAGES].sort()).toEqual(all.sort());
  });
});
