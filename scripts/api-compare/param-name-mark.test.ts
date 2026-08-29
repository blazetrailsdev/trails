import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import {
  GATED_PACKAGES,
  MARK_PATH,
  exceedances,
  measure,
  staleMarks,
  tightened,
  unmarkedPackages,
  unmeasuredPackages,
  type ParamNameMarks,
} from "./param-name-mark.js";

const row = (pkg: string, rubyFile: string) => ({ package: pkg, rubyFile });

const zeroed = (): ParamNameMarks =>
  Object.fromEntries(GATED_PACKAGES.map((pkg) => [pkg, { total: 0, byFile: {} }]));

describe("measure", () => {
  it("counts rows per gated package and per file", () => {
    expect(measure([row("arel", "a.rb"), row("arel", "a.rb"), row("arel", "b.rb")])).toEqual({
      ...zeroed(),
      arel: { total: 3, byFile: { "a.rb": 2, "b.rb": 1 } },
    });
  });

  it("ignores rows from an ungated package, and reports zero with none", () => {
    expect(measure([])).toEqual(zeroed());
    expect(measure([row("activerecord", "a.rb")])).toEqual(zeroed());
  });
});

describe("exceedances", () => {
  const marks: ParamNameMarks = { arel: { total: 2, byFile: { "a.rb": 2 } } };

  it("passes at the mark", () => {
    expect(exceedances(marks, measure([row("arel", "a.rb"), row("arel", "a.rb")]))).toEqual([]);
  });

  it("fails on a new row in a file the mark never listed", () => {
    const current = measure([row("arel", "a.rb"), row("arel", "a.rb"), row("arel", "b.rb")]);
    expect(exceedances(marks, current)).toEqual([
      { package: "arel", dimension: "total", mark: 2, current: 3 },
      { package: "arel", dimension: "b.rb", mark: 0, current: 1 },
    ]);
  });

  it("fails per file even when the flat total is unmoved", () => {
    const current = measure([row("arel", "a.rb"), row("arel", "b.rb")]);
    expect(exceedances(marks, current)).toEqual([
      { package: "arel", dimension: "b.rb", mark: 0, current: 1 },
    ]);
  });
});

describe("staleMarks", () => {
  it("reports a mark left above the measurement", () => {
    const marks: ParamNameMarks = { arel: { total: 2, byFile: { "a.rb": 2 } } };
    expect(staleMarks(marks, measure([row("arel", "a.rb")]))).toEqual([
      { package: "arel", dimension: "total", mark: 2, current: 1 },
      { package: "arel", dimension: "a.rb", mark: 2, current: 1 },
    ]);
  });
});

describe("tightened", () => {
  it("writes each dimension DOWN and never up", () => {
    const marks: ParamNameMarks = { arel: { total: 2, byFile: { "a.rb": 2 } } };
    const current = measure([row("arel", "a.rb"), row("arel", "b.rb"), row("arel", "b.rb")]);
    expect(tightened(marks, current)).toEqual({ arel: { total: 2, byFile: { "a.rb": 1 } } });
  });

  it("drops a file that converged to zero rather than leaving a 0 row", () => {
    const marks: ParamNameMarks = { arel: { total: 1, byFile: { "a.rb": 1 } } };
    expect(tightened(marks, measure([]))).toEqual({ arel: { total: 0, byFile: {} } });
  });
});

describe("enrolment guards", () => {
  it("names a gated package the run never measured", () => {
    expect(unmeasuredPackages(["activerecord"])).toEqual([...GATED_PACKAGES]);
    expect(unmeasuredPackages([...GATED_PACKAGES])).toEqual([]);
  });

  it("names a gated package with no committed mark", () => {
    expect(unmarkedPackages({})).toEqual([...GATED_PACKAGES]);
  });
});

describe("the committed mark", () => {
  it("holds every gated package, arel at zero (burned down by PRs #7123, #7148)", async () => {
    const marks = JSON.parse(await fs.readFile(MARK_PATH, "utf-8")) as ParamNameMarks;
    expect(unmarkedPackages(marks)).toEqual([]);
    expect(marks.arel).toEqual({ total: 0, byFile: {} });
  });
});
