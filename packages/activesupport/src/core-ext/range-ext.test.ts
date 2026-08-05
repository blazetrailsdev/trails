import { describe, it, expect } from "vitest";

import { Temporal } from "../temporal.js";

import { hours } from "../duration.js";
import { makeRange, rangeIncludesValue, rangeIncludesStringValue } from "../range-ext.js";
import { instantFromDate } from "../testing/temporal-helpers.js";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../values/time-zone.js";
import { caseEquals, isInclude } from "./range/compare-range.js";
import { succ } from "./string/succ.js";
import { toFs, toFormattedS } from "./range/conversions.js";
import { each, step } from "./range/each.js";
import { overlap, overlaps } from "./range/overlap.js";

describe("RangeTest", () => {
  it("to fs from dates", () => {
    const dateRange = makeRange(
      Temporal.PlainDate.from("2005-12-10"),
      Temporal.PlainDate.from("2005-12-12"),
    );
    expect(toFs(dateRange, "db")).toBe("BETWEEN '2005-12-10' AND '2005-12-12'");
    expect(toFormattedS(dateRange, "db")).toBe("BETWEEN '2005-12-10' AND '2005-12-12'");
  });

  it("to fs from times", () => {
    const dateRange = makeRange(
      new Date(Date.UTC(2005, 11, 10, 15, 30)),
      new Date(Date.UTC(2005, 11, 10, 17, 30)),
    );
    expect(toFs(dateRange, "db")).toBe("BETWEEN '2005-12-10 15:30:00' AND '2005-12-10 17:30:00'");
  });

  it("to fs with alphabets", () => {
    expect(toFs(makeRange("a", "z"), "db")).toBe("BETWEEN 'a' AND 'z'");
    expect(toFs(makeRange("a", null), "db")).toBe(">= 'a'");
    expect(toFs(makeRange(null, "z"), "db")).toBe("<= 'z'");
  });

  it("to fs with numeric", () => {
    expect(toFs(makeRange(1, 100), "db")).toBe("BETWEEN '1' AND '100'");
    expect(toFs(makeRange(1, null), "db")).toBe(">= '1'");
    expect(toFs(makeRange(null, 100), "db")).toBe("<= '100'");
  });

  it("to fs with format invalid format", () => {
    const numberRange = makeRange(1, 100);

    expect(toFs(numberRange, "not_existent")).toBe("1..100");
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
    expect(isInclude(makeRange(1, 10), makeRange(1, 10))).toBe(true);
  });

  it("should include identical exclusive", () => {
    expect(isInclude(makeRange(1, 10, true), makeRange(1, 10, true))).toBe(true);
  });

  it("should include other with exclusive end", () => {
    expect(isInclude(makeRange(1, 10), makeRange(1, 11, true))).toBe(true);
  });

  it("include returns false for backwards", () => {
    expect(isInclude(makeRange(1, 10), makeRange(5, 3))).toBe(false);
  });

  it("include returns false for empty exclusive end", () => {
    expect(isInclude(makeRange(1, 5), makeRange(3, 3, true))).toBe(false);
  });

  it("include with endless range", () => {
    expect(isInclude(makeRange(1, null), 2)).toBe(true);
  });

  it("should include range with endless range", () => {
    expect(isInclude(makeRange(1, null), makeRange(2, 4))).toBe(true);
  });

  it("should not include range with endless range", () => {
    expect(isInclude(makeRange(1, null), makeRange(0, 4))).toBe(false);
  });

  it("include with beginless range", () => {
    expect(isInclude(makeRange(null, 2), 1)).toBe(true);
  });

  it("should include range with beginless range", () => {
    expect(isInclude(makeRange(null, 2), makeRange(-1, 1))).toBe(true);
  });

  it("should not include range with beginless range", () => {
    expect(isInclude(makeRange(null, 2), makeRange(-1, 3))).toBe(false);
  });

  it("should compare identical inclusive", () => {
    expect(caseEquals(makeRange(1, 10), makeRange(1, 10))).toBe(true);
  });

  it("should compare identical exclusive", () => {
    expect(caseEquals(makeRange(1, 10, true), makeRange(1, 10, true))).toBe(true);
  });

  it("should compare other with exclusive end", () => {
    expect(caseEquals(makeRange(1, 10), makeRange(1, 11, true))).toBe(true);
  });

  it("compare returns false for backwards", () => {
    expect(caseEquals(makeRange(1, 10), makeRange(5, 3))).toBe(false);
  });

  it("compare returns false for empty exclusive end", () => {
    expect(caseEquals(makeRange(1, 5), makeRange(3, 3, true))).toBe(false);
  });

  it("should compare range with endless range", () => {
    expect(caseEquals(makeRange(1, null), makeRange(2, 4))).toBe(true);
  });

  it("should not compare range with endless range", () => {
    expect(caseEquals(makeRange(1, null), makeRange(0, 4))).toBe(false);
  });

  it("should compare range with beginless range", () => {
    expect(caseEquals(makeRange(null, 2), makeRange(-1, 1))).toBe(true);
  });

  it("should not compare range with beginless range", () => {
    expect(caseEquals(makeRange(null, 2), makeRange(-1, 3))).toBe(false);
  });

  it("exclusive end should not include identical with inclusive end", () => {
    expect(isInclude(makeRange(1, 10, true), makeRange(1, 10))).toBe(false);
  });

  it("should not include overlapping first", () => {
    expect(isInclude(makeRange(2, 8), makeRange(1, 3))).toBe(false);
  });

  it("should not include overlapping last", () => {
    expect(isInclude(makeRange(2, 8), makeRange(5, 9))).toBe(false);
  });

  it("should include identical exclusive with floats", () => {
    expect(isInclude(makeRange(1.0, 10.0, true), makeRange(1.0, 10.0, true))).toBe(true);
  });

  it("cover is not override", () => {
    // Rails: `range.method(:include?) != range.method(:cover?)`. trails' native
    // `cover?` is `rangeIncludesValue`, which `isInclude` delegates to rather
    // than aliasing.
    expect(isInclude).not.toBe(rangeIncludesValue);
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

  it("each on time with zone", () => {
    const twz = new TimeWithZone(
      instantFromDate(new Date(Date.UTC(2006, 10, 28, 10, 30))),
      TimeZone.find("Eastern Time (US & Canada)"),
    );
    expect(() => [...each(makeRange(twz.minus(hours(1)), twz))]).toThrow(TypeError);
  });

  it("step on time with zone", () => {
    const twz = new TimeWithZone(
      instantFromDate(new Date(Date.UTC(2006, 10, 28, 10, 30))),
      TimeZone.find("Eastern Time (US & Canada)"),
    );
    expect(() => [...step(makeRange(twz.minus(hours(1)), twz), 1)]).toThrow(TypeError);
  });
  it.skip("cover on time with zone");
  it.skip("case equals on time with zone");

  it("date time with each", () => {
    const r = makeRange(0, 4);
    expect([...each(r)]).toEqual([0, 1, 2, 3, 4]);
  });

  it("string include uses succ order not lexicographic", () => {
    // Mirrors Ruby ("aaa".."bbb").include? — succ order (length, then lex).
    const r = makeRange("aaa", "bbb");
    expect(rangeIncludesStringValue(r, "aaa")).toBe(true);
    expect(rangeIncludesStringValue(r, "abc")).toBe(true);
    expect(rangeIncludesStringValue(r, "bbb")).toBe(true);
    expect(rangeIncludesStringValue(r, "bbc")).toBe(false); // past end
    expect(rangeIncludesStringValue(r, "aa")).toBe(false); // shorter than begin
    expect(rangeIncludesStringValue(r, "aaab")).toBe(false); // longer than end

    // succ order, not lexical: "z" is shorter than "bbb" so it sorts before it,
    // even though "z" > "bbb" lexically. Ruby: ("a".."bbb").include?("z") == true.
    const r2 = makeRange("a", "bbb");
    expect(rangeIncludesStringValue(r2, "z")).toBe(true);
    expect(rangeIncludesStringValue(r2, "ab")).toBe(true);
    expect(rangeIncludesStringValue(makeRange("a", "z"), "mm")).toBe(false);
  });

  it("string include approximates succ for mixed character classes", () => {
    // Ruby's String#succ never produces "a1" from "a" (it carries within a
    // single character class and never mixes letters with digits), so
    // ("a".."bbb").include?("a1") == false. Faithful succ enumeration matches.
    expect(rangeIncludesStringValue(makeRange("a", "bbb"), "a1")).toBe(false);
  });

  it("string include raises on beginless/endless ranges", () => {
    // Ruby's Range#include? raises TypeError on beginless/endless string
    // ranges ("cannot determine inclusion in beginless/endless ranges").
    expect(() => rangeIncludesStringValue(makeRange(null, "bbb"), "z")).toThrow(TypeError);
    expect(() => rangeIncludesStringValue(makeRange("a", null), "z")).toThrow(TypeError);
  });

  it("string succ carries within character classes", () => {
    // Mirrors Ruby String#succ.
    expect(succ("abcd")).toBe("abce");
    expect(succ("az")).toBe("ba");
    expect(succ("zz")).toBe("aaa");
    expect(succ("Zz")).toBe("AAa");
    expect(succ("99")).toBe("100");
    expect(succ("a9")).toBe("b0");
    expect(succ("1.9")).toBe("2.0");
    expect(succ("<<")).toBe("<=");
    // Carry stops at a non-alnum gap into a different class.
    expect(succ("z.9")).toBe("z.10");
    expect(succ("a.z")).toBe("b.a");
    // Astral (non-alnum) chars succ as whole code points, not UTF-16 units.
    expect(succ("\u{1F600}")).toBe("\u{1F601}");
    // Wrapping is per UTF-8 encoded width (`enc_succ_char` NEIGHBOR_WRAPPED).
    const points = (str: string) => Array.from(str, (c) => c.codePointAt(0));
    expect(points(succ("\u{10FFFF}"))).toEqual([0x1, 0x10000]);
    expect(points(succ("\u{FFFF}"))).toEqual([0x1, 0x800]);
    expect(points(succ("\u{07FF}"))).toEqual([0x1, 0x80]);
  });

  it("date time with step", () => {
    const r = makeRange(0, 10);
    expect([...step(r, 2)]).toEqual([0, 2, 4, 6, 8, 10]);
  });
});
