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
} from "../range-ext.js";

describe("RangeTest", () => {
  it("to fs from dates", () => {
    const d1 = new Date("2023-01-01");
    const d2 = new Date("2023-12-31");
    const r = makeRange(d1, d2);
    expect(rangeToFs(r)).toContain("2023");
  });

  it("to fs from times", () => {
    const t1 = new Date("2023-06-01T10:00:00Z");
    const t2 = new Date("2023-06-01T18:00:00Z");
    const r = makeRange(t1, t2);
    expect(rangeToFs(r)).toContain("2023");
  });

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

  it("to fs with format invalid format", () => {
    const r = makeRange(1, 10);
    expect(typeof rangeToFs(r)).toBe("string");
  });

  it("date range", () => {
    const start = new Date("2023-01-01");
    const end = new Date("2023-12-31");
    const r = makeRange(start, end);
    expect(rangeIncludesValue(r, new Date("2023-06-15"))).toBe(true);
  });

  it("overlap last inclusive", () => {
    expect(overlap(makeRange(1, 5), makeRange(5, 10))).toBe(true);
  });

  it("overlap last exclusive", () => {
    expect(overlap(makeRange(1, 5, true), makeRange(5, 10))).toBe(false);
  });

  it("overlap first inclusive", () => {
    expect(overlap(makeRange(5, 10), makeRange(1, 5))).toBe(true);
  });

  it("overlap first exclusive", () => {
    expect(overlap(makeRange(5, 10), makeRange(1, 5, true))).toBe(false);
  });

  it("overlap with beginless range", () => {
    expect(overlap(makeRange(null, 5), makeRange(3, 10))).toBe(true);
  });

  it("overlap with two beginless ranges", () => {
    expect(overlap(makeRange(null, 5), makeRange(null, 10))).toBe(true);
  });

  it("overlaps alias", () => {
    expect(overlaps(makeRange(1, 5), makeRange(3, 8))).toBe(true);
  });

  it("overlap behaves like ruby", () => {
    expect(overlap(makeRange(1, 3), makeRange(5, 8))).toBe(false);
  });

  it("should include identical inclusive", () => {
    expect(rangeIncludesRange(makeRange(1, 10), makeRange(1, 10))).toBe(true);
  });

  it("should include identical exclusive", () => {
    expect(rangeIncludesRange(makeRange(1, 10, true), makeRange(1, 10, true))).toBe(true);
  });

  it("should include other with exclusive end", () => {
    expect(rangeIncludesRange(makeRange(1, 10), makeRange(1, 10, true))).toBe(true);
  });

  it("include returns false for backwards", () => {
    expect(rangeIncludesValue(makeRange(5, 10), 3)).toBe(false);
  });

  it("include returns false for empty exclusive end", () => {
    expect(rangeIncludesValue(makeRange(1, 1, true), 1)).toBe(false);
  });

  it("include with endless range", () => {
    expect(rangeIncludesValue(makeRange(1, null), 1000)).toBe(true);
  });

  it("should include range with endless range", () => {
    expect(rangeIncludesRange(makeRange(1, null), makeRange(5, 10))).toBe(true);
  });

  it("should not include range with endless range", () => {
    expect(rangeIncludesRange(makeRange(1, 10), makeRange(5, null))).toBe(false);
  });

  it("include with beginless range", () => {
    expect(rangeIncludesValue(makeRange(null, 10), -100)).toBe(true);
  });

  it("should include range with beginless range", () => {
    expect(rangeIncludesRange(makeRange(null, 10), makeRange(null, 5))).toBe(true);
  });

  it("should not include range with beginless range", () => {
    expect(rangeIncludesRange(makeRange(5, 10), makeRange(null, 8))).toBe(false);
  });

  it("should compare identical inclusive", () => {
    expect(rangeIncludesRange(makeRange(1, 10), makeRange(1, 10))).toBe(true);
  });

  it("should compare identical exclusive", () => {
    expect(rangeIncludesRange(makeRange(1, 10, true), makeRange(1, 10, true))).toBe(true);
  });

  it("should compare other with exclusive end", () => {
    expect(rangeIncludesRange(makeRange(1, 10), makeRange(1, 9, true))).toBe(true);
  });

  it("compare returns false for backwards", () => {
    expect(rangeIncludesRange(makeRange(5, 10), makeRange(1, 10))).toBe(false);
  });

  it("compare returns false for empty exclusive end", () => {
    expect(rangeIncludesValue(makeRange(1, 1, true), 1)).toBe(false);
  });

  it("should compare range with endless range", () => {
    expect(rangeIncludesRange(makeRange(1, null), makeRange(5, 15))).toBe(true);
  });

  it("should not compare range with endless range", () => {
    expect(rangeIncludesRange(makeRange(1, 10), makeRange(5, null))).toBe(false);
  });

  it("should compare range with beginless range", () => {
    expect(rangeIncludesRange(makeRange(null, 10), makeRange(null, 5))).toBe(true);
  });

  it("should not compare range with beginless range", () => {
    expect(rangeIncludesRange(makeRange(5, 10), makeRange(null, 8))).toBe(false);
  });

  it("exclusive end should not include identical with inclusive end", () => {
    expect(rangeIncludesRange(makeRange(1, 10, true), makeRange(1, 10))).toBe(false);
  });

  it("should not include overlapping first", () => {
    expect(rangeIncludesRange(makeRange(5, 10), makeRange(3, 8))).toBe(false);
  });

  it("should not include overlapping last", () => {
    expect(rangeIncludesRange(makeRange(1, 8), makeRange(5, 10))).toBe(false);
  });

  it("should include identical exclusive with floats", () => {
    expect(rangeIncludesRange(makeRange(1.0, 10.0, true), makeRange(1.0, 10.0, true))).toBe(true);
  });

  it("cover is not override", () => {
    expect(cover(makeRange(1, 10), makeRange(3, 7))).toBe(true);
  });

  it("overlap on time", () => {
    const t1 = new Date("2023-01-01"),
      t2 = new Date("2023-06-01");
    const t3 = new Date("2023-03-01"),
      t4 = new Date("2023-12-31");
    expect(overlap(makeRange(t1, t2), makeRange(t3, t4))).toBe(true);
  });

  it("no overlap on time", () => {
    const t1 = new Date("2023-01-01"),
      t2 = new Date("2023-03-01");
    const t3 = new Date("2023-06-01"),
      t4 = new Date("2023-12-31");
    expect(overlap(makeRange(t1, t2), makeRange(t3, t4))).toBe(false);
  });

  it.skip("each on time with zone", () => {
    /* TimeWithZone not implemented */
  });
  it.skip("step on time with zone", () => {
    /* TimeWithZone not implemented */
  });
  it.skip("cover on time with zone", () => {
    /* TimeWithZone not implemented */
  });
  it.skip("case equals on time with zone", () => {
    /* TimeWithZone not implemented */
  });

  it("date time with each", () => {
    const r = makeRange(0, 4);
    expect([...rangeEach(r)]).toEqual([0, 1, 2, 3, 4]);
  });

  it("date time with step", () => {
    const r = makeRange(0, 10);
    expect([...rangeStep(r, 2)]).toEqual([0, 2, 4, 6, 8, 10]);
  });
});
