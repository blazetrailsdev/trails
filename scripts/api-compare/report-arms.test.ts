import { describe, expect, it } from "vitest";

import {
  cluster,
  compareArms,
  controlArms,
  renderReport,
  spliceHelperSkeletons,
  renderSample,
  sampleRows,
  type ArmMismatch,
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

describe("controlArms rescue", () => {
  it("keeps a rescue clause arm alongside the try it hangs off", () => {
    expect(controlArms(["try", "ref:save", "rescue", "rescue", "throw"])).toEqual([
      "try",
      "rescue",
      "rescue",
      "throw",
    ]);
  });
});

describe("spliceHelperSkeletons", () => {
  it("replaces a same-file reach with that helper's own skeleton, in place", () => {
    expect(
      spliceHelperSkeletons(["ref:a", "ref:helper", "throw"], { helper: ["if", "ref:b"] }),
    ).toEqual(["ref:a", "if", "ref:b", "throw"]);
  });

  it("leaves a reach that resolves to nothing alone, and splices every occurrence", () => {
    expect(
      spliceHelperSkeletons(["ref:helper", "ref:elsewhere", "ref:helper"], { helper: ["if"] }),
    ).toEqual(["if", "ref:elsewhere", "if"]);
  });

  it("does not resolve the spliced skeleton's own reaches", () => {
    expect(spliceHelperSkeletons(["ref:a"], { a: ["ref:b"], b: ["if"] })).toEqual(["ref:b"]);
  });
});

describe("compareArms", () => {
  it("reads an arm the port moved into a same-file helper as no mismatch", () => {
    const delegating = {
      ...row(["if", "ref:save"], ["ref:helper"]),
      tsHelpers: { helper: ["if"] },
    };

    expect(compareArms(delegating)).toBeUndefined();
    expect(compareArms(row(["if", "ref:save"], ["ref:helper"]))?.missing).toEqual(["if"]);
  });

  it("never lets a helper's own arms raise a flag the two bodies did not raise", () => {
    const caller = {
      ...row(["ref:helper"], ["ref:helper"]),
      rubyHelpers: { helper: [] },
      tsHelpers: { helper: ["if"] },
    };

    expect(compareArms(caller)).toBeUndefined();
  });

  it("reports the body's OWN arms when the splice does not discharge the flag", () => {
    const caller = {
      ...row(["if", "ref:helper"], ["ref:helper"]),
      rubyHelpers: { helper: [] },
      tsHelpers: { helper: ["throw"] },
    };

    expect(compareArms(caller)?.missing).toEqual(["if"]);
    expect(compareArms(caller)?.invented).toEqual([]);
  });

  it("reads an arm Rails keeps in a same-file helper against the port's inline one", () => {
    const delegating = {
      ...row(["ref:helper"], ["if", "ref:save"]),
      rubyHelpers: { helper: ["if"] },
    };

    expect(compareArms(delegating)).toBeUndefined();
    expect(compareArms(row(["ref:helper"], ["if", "ref:save"]))?.invented).toEqual(["if"]);
  });

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

function named(tsName: string, ruby: string[], ts: string[]): SkeletonRow {
  return { ...row(ruby, ts), tsName };
}

describe("sampleRows", () => {
  const rows = ["a", "b", "c", "d", "e", "f"].map(
    (name) => compareArms(named(name, ["if"], ["if", "if"]))!,
  );

  it("draws the same rows for the same seed", () => {
    const names = (drawn: ArmMismatch[]): string[] => drawn.map((r) => r.tsName);

    expect(names(sampleRows(rows, 3, 113))).toEqual(names(sampleRows(rows, 3, 113)));
  });

  it("draws different rows for a different seed", () => {
    expect(sampleRows(rows, 3, 113).map((r) => r.tsName)).not.toEqual(
      sampleRows(rows, 3, 7).map((r) => r.tsName),
    );
  });

  it("draws without replacement, and stops at the population size", () => {
    const drawn = sampleRows(rows, 99, 113);

    expect(drawn).toHaveLength(rows.length);
    expect(new Set(drawn.map((r) => r.tsName)).size).toBe(rows.length);
  });
});

describe("renderSample", () => {
  it("states the size, the population and the seed, and prints both skeletons", () => {
    const sample = renderSample(
      {
        packages: ["activerecord"],
        skeletons: [named("translateException", ["if"], ["if", "throw"])],
      },
      1,
      113,
    );

    expect(sample).toContain("1 of 1 mismatched pair(s), seed 113");
    expect(sample).toContain("ruby active_record/connection_adapters/sqlite3_adapter.rb");
    expect(sample).toContain("ruby-skeleton if");
    expect(sample).toContain("ts-skeleton   if throw");
  });
});
