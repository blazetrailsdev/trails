import { describe, expect, it } from "vitest";
import {
  GATED_PACKAGES,
  exceedances,
  measure,
  staleMarks,
  tightened,
  unmarkedPackages,
  unmeasuredPackages,
  type SurfaceMarks,
} from "./extra-surface-mark.js";

const marks: SurfaceMarks = { arel: { novel: 0, total: 63 } };

describe("extra-surface mark", () => {
  it("measures only the gated packages", () => {
    const measured = measure([
      { package: "arel", totalNovel: 0, totalExtras: 63 },
      { package: "activerecord", totalNovel: 399, totalExtras: 1424 },
      { package: "activemodel", totalNovel: 12, totalExtras: 34 },
    ]);
    expect(measured).toEqual({
      arel: { novel: 0, total: 63 },
      activerecord: { novel: 399, total: 1424 },
    });
  });

  it("names a gated package the mark file never seeded", () => {
    expect(unmarkedPackages({ arel: { novel: 0, total: 63 } })).toEqual(["activerecord"]);
    expect(unmarkedPackages({})).toEqual([...GATED_PACKAGES]);
    expect(
      unmarkedPackages({
        arel: { novel: 0, total: 63 },
        activerecord: { novel: 399, total: 1424 },
      }),
    ).toEqual([]);
  });

  it("skips a package with no mark rather than gating it, which is why the seed is checked", () => {
    expect(
      exceedances(marks, {
        arel: { novel: 0, total: 63 },
        activerecord: { novel: 9999, total: 9999 },
      }),
    ).toEqual([]);
    expect(
      staleMarks(marks, {
        arel: { novel: 0, total: 63 },
        activerecord: { novel: 1, total: 1 },
      }),
    ).toEqual([]);
  });

  it("passes when both dimensions hold at the mark", () => {
    expect(exceedances(marks, { arel: { novel: 0, total: 63 } })).toEqual([]);
  });

  it("fails on a novel-count increase", () => {
    expect(exceedances(marks, { arel: { novel: 1, total: 64 } })).toEqual([
      { package: "arel", dimension: "novel", mark: 0, current: 1 },
      { package: "arel", dimension: "total", mark: 63, current: 64 },
    ]);
  });

  it("fails on a total increase even when novel holds", () => {
    expect(exceedances(marks, { arel: { novel: 0, total: 64 } })).toEqual([
      { package: "arel", dimension: "total", mark: 63, current: 64 },
    ]);
  });

  it("reports a mark left above the current measurement", () => {
    expect(staleMarks(marks, { arel: { novel: 0, total: 60 } })).toEqual([
      { package: "arel", dimension: "total", mark: 63, current: 60 },
    ]);
  });

  it("tightens down and never up", () => {
    expect(tightened(marks, { arel: { novel: 0, total: 60 } })).toEqual({
      arel: { novel: 0, total: 60 },
    });
    expect(tightened(marks, { arel: { novel: 3, total: 70 } })).toEqual({
      arel: { novel: 0, total: 63 },
    });
  });

  it("names a gated package the run never measured", () => {
    expect(unmeasuredPackages({})).toEqual([...GATED_PACKAGES]);
  });
});
