import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import {
  GATED_PACKAGES,
  GATED_TOKEN,
  MARK_PATH,
  exceedances,
  measure,
  staleMarks,
  tightened,
  unmarkedPackages,
  unmeasuredPackages,
  type ArmThrowMarks,
} from "./arm-throw-mark.js";
import { staleMarkFailure } from "./param-name-mark.js";

const row = (pkg: string, tsFile: string, missing: string[] = ["throw"]) => ({
  package: pkg,
  tsFile,
  missing,
});

const zeroed = () => Object.fromEntries(GATED_PACKAGES.map((p) => [p, { total: 0, byFile: {} }]));

describe("measure", () => {
  it("counts rows per gated package and per file", () => {
    expect(measure([row("arel", "a.ts"), row("arel", "a.ts"), row("arel", "b.ts")])).toEqual({
      ...zeroed(),
      arel: { total: 3, byFile: { "a.ts": 2, "b.ts": 1 } },
    });
  });

  it("reads only the gated token, leaving the other four strata report-only", () => {
    expect(GATED_TOKEN).toBe("throw");
    expect(measure([row("arel", "a.ts", ["if", "loop", "try", "rescue"])])).toEqual(zeroed());
    expect(measure([row("arel", "a.ts", ["if", "throw"])])).toEqual({
      ...zeroed(),
      arel: { total: 1, byFile: { "a.ts": 1 } },
    });
  });

  it("ignores rows from an ungated package, and reports zero with none", () => {
    const empty = zeroed();
    expect(measure([])).toEqual(empty);
    expect(measure([row("ruby-compat", "a.ts")])).toEqual(empty);
  });
});

describe("exceedances", () => {
  const marks: ArmThrowMarks = { arel: { total: 2, byFile: { "a.ts": 2 } } };

  it("passes at the mark", () => {
    expect(exceedances(marks, measure([row("arel", "a.ts"), row("arel", "a.ts")]))).toEqual([]);
  });

  it("fails on a new row in a file the mark never listed", () => {
    const current = measure([row("arel", "a.ts"), row("arel", "a.ts"), row("arel", "b.ts")]);
    expect(exceedances(marks, current)).toEqual([
      { package: "arel", dimension: "total", mark: 2, current: 3 },
      { package: "arel", dimension: "b.ts", mark: 0, current: 1 },
    ]);
  });

  it("fails per file even when the flat total is unmoved", () => {
    const current = measure([row("arel", "a.ts"), row("arel", "b.ts")]);
    expect(exceedances(marks, current)).toEqual([
      { package: "arel", dimension: "b.ts", mark: 0, current: 1 },
    ]);
  });
});

describe("staleMarks", () => {
  it("reports a mark left above the measurement", () => {
    const marks: ArmThrowMarks = { arel: { total: 2, byFile: { "a.ts": 2 } } };
    expect(staleMarks(marks, measure([row("arel", "a.ts")]))).toEqual([
      { package: "arel", dimension: "total", mark: 2, current: 1 },
      { package: "arel", dimension: "a.ts", mark: 2, current: 1 },
    ]);
  });

  it("fails the gate, naming each row and the tighten script", () => {
    const marks: ArmThrowMarks = { arel: { total: 2, byFile: { "a.ts": 2 } } };
    const stale = staleMarks(marks, measure([row("arel", "a.ts")]));
    const failure = staleMarkFailure("arm-throw gate", "parity:api:arms:throws:tighten", stale)!;
    expect(failure).toContain("arm-throw gate: 2 STALE mark dimension(s)");
    expect(failure).toContain("pnpm parity:api:arms:throws:tighten");
    expect(failure).toContain("arel  total: mark 2 → current 1");
    expect(failure).toContain("arel  a.ts: mark 2 → current 1");
  });

  it("passes a mark that sits on the measurement", () => {
    const marks = measure([row("arel", "a.ts")]);
    expect(staleMarkFailure("arm-throw gate", "t", staleMarks(marks, marks))).toBeNull();
  });
});

describe("tightened", () => {
  it("writes each dimension DOWN and never up", () => {
    const marks: ArmThrowMarks = { arel: { total: 2, byFile: { "a.ts": 2 } } };
    const current = measure([row("arel", "a.ts"), row("arel", "b.ts"), row("arel", "b.ts")]);
    expect(tightened(marks, current)).toEqual({ arel: { total: 2, byFile: { "a.ts": 1 } } });
  });

  it("drops a file that converged to zero rather than leaving a 0 row", () => {
    const marks: ArmThrowMarks = { arel: { total: 1, byFile: { "a.ts": 1 } } };
    expect(tightened(marks, measure([]))).toEqual({ arel: { total: 0, byFile: {} } });
  });
});

describe("enrolment guards", () => {
  it("names a gated package the run never measured", () => {
    expect(unmeasuredPackages(["ruby-compat"])).toEqual([...GATED_PACKAGES]);
    expect(unmeasuredPackages([...GATED_PACKAGES])).toEqual([]);
  });

  it("names a gated package with no committed mark", () => {
    expect(unmarkedPackages({})).toEqual([...GATED_PACKAGES]);
  });
});

describe("the committed mark", () => {
  it("holds every gated package", async () => {
    const marks = JSON.parse(await fs.readFile(MARK_PATH, "utf-8")) as ArmThrowMarks;
    expect(unmarkedPackages(marks)).toEqual([]);
  });
});
