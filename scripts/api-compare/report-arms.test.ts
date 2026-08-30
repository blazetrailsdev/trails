import { describe, expect, it } from "vitest";

import {
  cluster,
  compareArms,
  controlArms,
  renderReport,
  type SkeletonRow,
} from "./report-arms.js";

function row(ruby: string[], ts: string[]): SkeletonRow {
  return {
    package: "activerecord",
    rubyFile: "active_record/connection_adapters/sqlite3_adapter.rb",
    rubyName: "translate_exception",
    tsFile: "connection-adapters/sqlite3-adapter.ts",
    tsName: "translateException",
    ruby,
    ts,
  };
}

describe("controlArms", () => {
  it("keeps the four control tokens and drops every call and constructor reach", () => {
    expect(
      controlArms(["ref:each", "if", "new:Relation", "loop", "ref:save", "try", "throw"]),
    ).toEqual(["if", "loop", "try", "throw"]);
  });
});

describe("compareArms", () => {
  it("returns undefined when the two projections agree exactly", () => {
    expect(
      compareArms(row(["if", "ref:save", "throw"], ["ref:load", "if", "throw"])),
    ).toBeUndefined();
  });

  it("ignores the interleaved reaches, so an extracted helper is not a mismatch", () => {
    expect(
      compareArms(row(["if", "ref:a", "ref:b", "ref:c"], ["if", "ref:helper"])),
    ).toBeUndefined();
  });

  it("reports a missing arm as a count verdict", () => {
    const mismatch = compareArms(row(["if", "if", "throw"], ["if", "throw"]));

    expect(mismatch?.kind).toBe("count");
    expect(mismatch?.missing).toEqual(["if"]);
    expect(mismatch?.invented).toEqual([]);
    expect(cluster(mismatch!)).toBe("missing-arm");
  });

  it("reports an invented arm as a count verdict", () => {
    const mismatch = compareArms(row(["if"], ["if", "throw"]));

    expect(mismatch?.missing).toEqual([]);
    expect(mismatch?.invented).toEqual(["throw"]);
    expect(cluster(mismatch!)).toBe("invented-arm");
  });

  it("reports a swapped arm as one missing and one invented, never as an order verdict", () => {
    const mismatch = compareArms(row(["if", "loop"], ["if", "try"]));

    expect(mismatch?.kind).toBe("count");
    expect(mismatch?.missing).toEqual(["loop"]);
    expect(mismatch?.invented).toEqual(["try"]);
    expect(cluster(mismatch!)).toBe("missing-arm + invented-arm");
  });

  it("reports the same arms in a different sequence as an order verdict", () => {
    const mismatch = compareArms(row(["throw", "if"], ["if", "throw"]));

    expect(mismatch?.kind).toBe("order");
    expect(mismatch?.missing).toEqual([]);
    expect(mismatch?.invented).toEqual([]);
    expect(cluster(mismatch!)).toBe("arm-order");
  });

  it("does not read a reordered call reach as a reordered arm", () => {
    expect(compareArms(row(["if", "ref:a", "ref:b"], ["if", "ref:b", "ref:a"]))).toBeUndefined();
  });
});

describe("renderReport", () => {
  it("counts every compared pair and groups the mismatches by package, file and verdict", () => {
    const report = renderReport(
      {
        packages: ["activerecord"],
        skeletons: [
          row(["if", "throw"], ["if", "throw"]),
          row(["if", "if", "throw"], ["if", "throw"]),
          row(["throw", "if"], ["if", "throw"]),
        ],
      },
      20,
    );

    expect(report).toContain("2 mismatched pair(s) across 1 file(s), 3 pair(s) compared");
    expect(report).toContain("report-only, nothing gates on this (RFC 0113)");
    expect(report).toContain("count");
    expect(report).toContain("order");
    expect(report).toContain("activerecord/connection-adapters/sqlite3-adapter.ts");
  });
});
