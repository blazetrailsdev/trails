import { describe, expect, it } from "vitest";
import {
  COUNTED_PACKAGES,
  GATED_PACKAGES,
  TAGGED_ONLY_PACKAGES,
  exceedances,
  measure,
  staleMarks,
  strandedMarks,
  taggedOnlyViolations,
  tightened,
  unmarkedPackages,
  unmeasuredPackages,
  type SurfaceMarks,
} from "./extra-surface-mark.js";

const marks: SurfaceMarks = { activerecord: { novel: 0, total: 63 } };
const zeroMarks: SurfaceMarks = { "ruby-compat": { novel: 0, total: 0 } };

describe("extra-surface mark", () => {
  it("measures only the gated packages", () => {
    const measured = measure([
      { package: "arel", totalNovel: 0, totalExtras: 63 },
      { package: "activerecord", totalNovel: 399, totalExtras: 1424 },
      { package: "ruby-compat", totalNovel: 0, totalExtras: 0 },
      { package: "activemodel", totalNovel: 12, totalExtras: 34 },
    ]);
    expect(measured).toEqual({
      arel: { novel: 0, total: 63 },
      activerecord: { novel: 399, total: 1424 },
      "ruby-compat": { novel: 0, total: 0 },
    });
  });

  it("names a counted package the mark file never seeded", () => {
    expect(unmarkedPackages({ activerecord: { novel: 399, total: 1424 } })).toEqual([
      "ruby-compat",
    ]);
    expect(unmarkedPackages({})).toEqual([...COUNTED_PACKAGES]);
    expect(
      unmarkedPackages({
        activerecord: { novel: 399, total: 1424 },
        "ruby-compat": { novel: 0, total: 0 },
      }),
    ).toEqual([]);
  });

  it("never asks a tagged-only package for a mark it does not carry", () => {
    expect(unmarkedPackages({})).not.toContain("arel");
    expect(strandedMarks({})).toEqual([]);
    expect(strandedMarks({ activerecord: { novel: 1, total: 1 } })).toEqual([]);
  });

  it("names a tagged-only package that still carries a stranded row", () => {
    expect(strandedMarks({ arel: { novel: 0, total: 63 } })).toEqual(["arel"]);
  });

  it("holds a tagged-only package at zero novel with no mark to consult", () => {
    expect(taggedOnlyViolations({ arel: { novel: 0, total: 63 } })).toEqual([]);
    expect(taggedOnlyViolations({ arel: { novel: 2, total: 65 } })).toEqual([
      { package: "arel", dimension: "novel", mark: 0, current: 2 },
    ]);
  });

  it("lets a tagged-only package's moved-not-novel total grow, which the mode trades away", () => {
    expect(taggedOnlyViolations({ arel: { novel: 0, total: 9999 } })).toEqual([]);
  });

  it("ignores a tagged-only package in every mark-keyed comparison", () => {
    const strayed: SurfaceMarks = { arel: { novel: 0, total: 1 } };
    expect(exceedances(strayed, { arel: { novel: 99, total: 99 } })).toEqual([]);
    expect(staleMarks(strayed, { arel: { novel: 0, total: 0 } })).toEqual([]);
    expect(tightened(strayed, { arel: { novel: 0, total: 0 } })).toEqual(strayed);
  });

  it("skips a package with no mark rather than gating it, which is why the seed is checked", () => {
    expect(
      exceedances(marks, {
        activerecord: { novel: 0, total: 63 },
        "ruby-compat": { novel: 9999, total: 9999 },
      }),
    ).toEqual([]);
    expect(
      staleMarks(marks, {
        activerecord: { novel: 0, total: 63 },
        "ruby-compat": { novel: 1, total: 1 },
      }),
    ).toEqual([]);
  });

  it("passes when both dimensions hold at the mark", () => {
    expect(exceedances(marks, { activerecord: { novel: 0, total: 63 } })).toEqual([]);
  });

  it("fails on a novel-count increase", () => {
    expect(exceedances(marks, { activerecord: { novel: 1, total: 64 } })).toEqual([
      { package: "activerecord", dimension: "novel", mark: 0, current: 1 },
      { package: "activerecord", dimension: "total", mark: 63, current: 64 },
    ]);
  });

  it("fails on a total increase even when novel holds", () => {
    expect(exceedances(marks, { activerecord: { novel: 0, total: 64 } })).toEqual([
      { package: "activerecord", dimension: "total", mark: 63, current: 64 },
    ]);
  });

  it("reports a mark left above the current measurement", () => {
    expect(staleMarks(marks, { activerecord: { novel: 0, total: 60 } })).toEqual([
      { package: "activerecord", dimension: "total", mark: 63, current: 60 },
    ]);
  });

  it("tightens down and never up", () => {
    expect(tightened(marks, { activerecord: { novel: 0, total: 60 } })).toEqual({
      activerecord: { novel: 0, total: 60 },
    });
    expect(tightened(marks, { activerecord: { novel: 3, total: 70 } })).toEqual({
      activerecord: { novel: 0, total: 63 },
    });
  });

  it("holds ruby-compat at zero, so any public name at all is an exceedance", () => {
    expect(exceedances(zeroMarks, { "ruby-compat": { novel: 0, total: 0 } })).toEqual([]);
    expect(exceedances(zeroMarks, { "ruby-compat": { novel: 1, total: 1 } })).toEqual([
      { package: "ruby-compat", dimension: "novel", mark: 0, current: 1 },
      { package: "ruby-compat", dimension: "total", mark: 0, current: 1 },
    ]);
  });

  it("cannot tighten ruby-compat below zero, and never widens it", () => {
    expect(tightened(zeroMarks, { "ruby-compat": { novel: 0, total: 0 } })).toEqual({
      "ruby-compat": { novel: 0, total: 0 },
    });
    expect(tightened(zeroMarks, { "ruby-compat": { novel: 4, total: 4 } })).toEqual({
      "ruby-compat": { novel: 0, total: 0 },
    });
  });

  it("names a gated package the run never measured", () => {
    expect(unmeasuredPackages({})).toEqual([...GATED_PACKAGES]);
  });

  it("still demands a measurement for a tagged-only package, which has no mark to miss", () => {
    expect(unmeasuredPackages({ activerecord: { novel: 1, total: 1 } })).toContain("arel");
  });

  it("gates every package in exactly one mode", () => {
    const counted = new Set<string>(COUNTED_PACKAGES);
    const taggedOnly = new Set<string>(TAGGED_ONLY_PACKAGES);
    expect([...counted].filter((p) => taggedOnly.has(p))).toEqual([]);
    expect([...GATED_PACKAGES].sort()).toEqual([...counted, ...taggedOnly].sort());
  });
});
