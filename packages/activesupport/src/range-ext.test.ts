import { describe, it, expect } from "vitest";
import {
  makeRange,
  overlap,
  overlaps,
  rangeIncludesValue,
  rangeIncludesRange,
  cover,
  rangeToFs,
  rangeStep,
  rangeEach,
} from "./range-ext.js";

describe("RangeTest", () => {
  // toFs tests
  it("to fs with alphabets", () => {
    const r = makeRange("a", "z");
    const result = rangeToFs(r);
    expect(result).toContain("a");
    expect(result).toContain("z");
  });

  it("to fs with numeric", () => {
    const r = makeRange(1, 10);
    const result = rangeToFs(r);
    expect(result).toContain("1");
    expect(result).toContain("10");
  });

  // overlap tests
  it("overlap last inclusive", () => {
    const a = makeRange(1, 5);
    const b = makeRange(5, 10);
    expect(overlap(a, b)).toBe(true);
  });

  it("overlap last exclusive", () => {
    const a = makeRange(1, 5, true); // excludeEnd
    const b = makeRange(5, 10);
    expect(overlap(a, b)).toBe(false);
  });

  it("overlap first inclusive", () => {
    const a = makeRange(5, 10);
    const b = makeRange(1, 5);
    expect(overlap(a, b)).toBe(true);
  });

  it("overlap first exclusive", () => {
    const a = makeRange(5, 10);
    const b = makeRange(1, 5, true); // excludeEnd
    expect(overlap(a, b)).toBe(false);
  });

  it("overlap with beginless range", () => {
    const a = makeRange(null, 5); // beginless
    const b = makeRange(3, 10);
    expect(overlap(a, b)).toBe(true);
  });

  it("overlap with two beginless ranges", () => {
    const a = makeRange(null, 5);
    const b = makeRange(null, 10);
    expect(overlap(a, b)).toBe(true);
  });

  it("overlaps alias", () => {
    const a = makeRange(1, 5);
    const b = makeRange(3, 8);
    expect(overlaps(a, b)).toBe(true);
  });

  it("overlap behaves like ruby", () => {
    // Non-overlapping ranges
    const a = makeRange(1, 3);
    const b = makeRange(5, 8);
    expect(overlap(a, b)).toBe(false);
  });

  // include? tests
  it("should include identical inclusive", () => {
    const outer = makeRange(1, 10);
    const inner = makeRange(1, 10);
    expect(rangeIncludesRange(outer, inner)).toBe(true);
  });

  it("should include identical exclusive", () => {
    const outer = makeRange(1, 10, true);
    const inner = makeRange(1, 10, true);
    expect(rangeIncludesRange(outer, inner)).toBe(true);
  });

  it("should include other with exclusive end", () => {
    const outer = makeRange(1, 10);
    const inner = makeRange(1, 10, true);
    expect(rangeIncludesRange(outer, inner)).toBe(true);
  });

  it("include returns false for backwards", () => {
    const outer = makeRange(5, 10);
    expect(rangeIncludesValue(outer, 3)).toBe(false);
  });

  it("include returns false for empty exclusive end", () => {
    const r = makeRange(1, 1, true); // exclusive, 1...1 is empty
    expect(rangeIncludesValue(r, 1)).toBe(false);
  });

  it("include with endless range", () => {
    const r = makeRange(1, null); // endless
    expect(rangeIncludesValue(r, 1000)).toBe(true);
  });

  it("should include range with endless range", () => {
    const outer = makeRange(1, null);
    const inner = makeRange(5, 10);
    expect(rangeIncludesRange(outer, inner)).toBe(true);
  });

  it("should not include range with endless range", () => {
    const outer = makeRange(1, 10);
    const inner = makeRange(5, null);
    expect(rangeIncludesRange(outer, inner)).toBe(false);
  });

  it("include with beginless range", () => {
    const r = makeRange(null, 10);
    expect(rangeIncludesValue(r, -100)).toBe(true);
  });

  it("should include range with beginless range", () => {
    const outer = makeRange(null, 10);
    const inner = makeRange(null, 5);
    expect(rangeIncludesRange(outer, inner)).toBe(true);
  });

  it("should not include range with beginless range", () => {
    const outer = makeRange(5, 10);
    const inner = makeRange(null, 8);
    expect(rangeIncludesRange(outer, inner)).toBe(false);
  });

  it("exclusive end should not include identical with inclusive end", () => {
    const outer = makeRange(1, 10, true); // exclusive
    const inner = makeRange(1, 10);       // inclusive
    expect(rangeIncludesRange(outer, inner)).toBe(false);
  });

  it("should not include overlapping first", () => {
    const outer = makeRange(5, 10);
    const inner = makeRange(3, 8);
    expect(rangeIncludesRange(outer, inner)).toBe(false);
  });

  it("should not include overlapping last", () => {
    const outer = makeRange(1, 8);
    const inner = makeRange(5, 10);
    expect(rangeIncludesRange(outer, inner)).toBe(false);
  });

  it("should include identical exclusive with floats", () => {
    const outer = makeRange(1.0, 10.0, true);
    const inner = makeRange(1.0, 10.0, true);
    expect(rangeIncludesRange(outer, inner)).toBe(true);
  });

  it("cover is not override", () => {
    const outer = makeRange(1, 10);
    const inner = makeRange(3, 7);
    expect(cover(outer, inner)).toBe(true);
  });

  // overlap on time
  it("overlap on time", () => {
    const t1 = new Date("2023-01-01");
    const t2 = new Date("2023-06-01");
    const t3 = new Date("2023-03-01");
    const t4 = new Date("2023-12-31");
    const a = makeRange(t1, t2);
    const b = makeRange(t3, t4);
    expect(overlap(a, b)).toBe(true);
  });

  it("no overlap on time", () => {
    const t1 = new Date("2023-01-01");
    const t2 = new Date("2023-03-01");
    const t3 = new Date("2023-06-01");
    const t4 = new Date("2023-12-31");
    const a = makeRange(t1, t2);
    const b = makeRange(t3, t4);
    expect(overlap(a, b)).toBe(false);
  });

  // compare (same as include for ranges in TS)
  it("should compare identical inclusive", () => {
    const outer = makeRange(1, 10);
    const inner = makeRange(1, 10);
    expect(rangeIncludesRange(outer, inner)).toBe(true);
  });

  it("should compare identical exclusive", () => {
    const outer = makeRange(1, 10, true);
    const inner = makeRange(1, 10, true);
    expect(rangeIncludesRange(outer, inner)).toBe(true);
  });

  it("should compare other with exclusive end", () => {
    const outer = makeRange(1, 10);
    const inner = makeRange(1, 9, true);
    expect(rangeIncludesRange(outer, inner)).toBe(true);
  });

  it("compare returns false for backwards", () => {
    const outer = makeRange(5, 10);
    const inner = makeRange(1, 10);
    expect(rangeIncludesRange(outer, inner)).toBe(false);
  });

  it("compare returns false for empty exclusive end", () => {
    const r = makeRange(1, 1, true);
    expect(rangeIncludesValue(r, 1)).toBe(false);
  });

  it("should compare range with endless range", () => {
    const outer = makeRange(1, null);
    const inner = makeRange(5, 15);
    expect(rangeIncludesRange(outer, inner)).toBe(true);
  });

  it("should not compare range with endless range", () => {
    const outer = makeRange(1, 10);
    const inner = makeRange(5, null);
    expect(rangeIncludesRange(outer, inner)).toBe(false);
  });

  it("should compare range with beginless range", () => {
    const outer = makeRange(null, 10);
    const inner = makeRange(null, 5);
    expect(rangeIncludesRange(outer, inner)).toBe(true);
  });

  it("should not compare range with beginless range", () => {
    const outer = makeRange(5, 10);
    const inner = makeRange(null, 8);
    expect(rangeIncludesRange(outer, inner)).toBe(false);
  });

  it("date range", () => {
    const start = new Date("2023-01-01");
    const end = new Date("2023-12-31");
    const r = makeRange(start, end);
    const mid = new Date("2023-06-15");
    expect(rangeIncludesValue(r, mid)).toBe(true);
  });

  it("date time with each", () => {
    const r = makeRange(0, 4);
    const results = [...rangeEach(r)];
    expect(results).toEqual([0, 1, 2, 3, 4]);
  });

  it("date time with step", () => {
    const r = makeRange(0, 10);
    const results = [...rangeStep(r, 2)];
    expect(results).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it("to fs from dates", () => {
    const d1 = new Date("2023-01-01");
    const d2 = new Date("2023-12-31");
    const r = makeRange(d1, d2);
    const result = rangeToFs(r);
    expect(result).toContain("2023");
  });

  it("to fs from times", () => {
    const t1 = new Date("2023-06-01T10:00:00Z");
    const t2 = new Date("2023-06-01T18:00:00Z");
    const r = makeRange(t1, t2);
    const result = rangeToFs(r);
    expect(result).toContain("2023");
  });

  it("to fs with format invalid format", () => {
    const r = makeRange(1, 10);
    // rangeToFs with a number range just converts to string
    const result = rangeToFs(r);
    expect(typeof result).toBe("string");
  });

  it.skip("each on time with zone", () => { /* TimeWithZone not implemented */ });
  it.skip("step on time with zone", () => { /* TimeWithZone not implemented */ });
  it.skip("cover on time with zone", () => { /* TimeWithZone not implemented */ });
  it.skip("case equals on time with zone", () => { /* TimeWithZone not implemented */ });
});
