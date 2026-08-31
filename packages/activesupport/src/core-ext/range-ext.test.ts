import { describe, it, expect } from "vitest";

import { Temporal } from "@blazetrails/date";

import { hours } from "../duration.js";
import { Range } from "@blazetrails/ruby-compat/range";
import { instantFromDate } from "../testing/temporal-helpers.js";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../values/time-zone.js";
import { succ } from "@blazetrails/ruby-compat";
import "./range/compare-range.js";
import "./range/conversions.js";
import "./range/each.js";
import "./range/overlap.js";

describe("RangeTest", () => {
  it("to fs from dates", () => {
    const dateRange = new Range(
      Temporal.PlainDate.from("2005-12-10"),
      Temporal.PlainDate.from("2005-12-12"),
    );
    expect(dateRange.toFs("db")).toBe("BETWEEN '2005-12-10' AND '2005-12-12'");
    expect(dateRange.toFormattedS("db")).toBe("BETWEEN '2005-12-10' AND '2005-12-12'");
  });

  it("to fs from times", () => {
    const dateRange = new Range(
      new Date(Date.UTC(2005, 11, 10, 15, 30)),
      new Date(Date.UTC(2005, 11, 10, 17, 30)),
    );
    expect(dateRange.toFs("db")).toBe("BETWEEN '2005-12-10 15:30:00' AND '2005-12-10 17:30:00'");
  });

  it("to fs with alphabets", () => {
    expect(new Range("a", "z").toFs("db")).toBe("BETWEEN 'a' AND 'z'");
    expect(new Range("a", null).toFs("db")).toBe(">= 'a'");
    expect(new Range(null, "z").toFs("db")).toBe("<= 'z'");
  });

  it("to fs with numeric", () => {
    expect(new Range(1, 100).toFs("db")).toBe("BETWEEN '1' AND '100'");
    expect(new Range(1, null).toFs("db")).toBe(">= '1'");
    expect(new Range(null, 100).toFs("db")).toBe("<= '100'");
  });

  it("to fs with format invalid format", () => {
    const numberRange = new Range(1, 100);

    expect(numberRange.toFs("not_existent")).toBe("1..100");
  });

  it("date range", () => {
    const start = new Date("2023-01-01");
    const end = new Date("2023-12-31");
    const r = new Range(start, end);
    expect(r.cover(new Date("2023-06-15"))).toBe(true);
  });

  it("overlap last inclusive", () => {
    expect(new Range(1, 5).overlap(new Range(5, 10))).toBe(true);
  });

  it("overlap last exclusive", () => {
    expect(new Range(1, 5, true).overlap(new Range(5, 10))).toBe(false);
  });

  it("overlap first inclusive", () => {
    expect(new Range(5, 10).overlap(new Range(1, 5))).toBe(true);
  });

  it("overlap first exclusive", () => {
    expect(new Range(5, 10).overlap(new Range(1, 5, true))).toBe(false);
  });

  it("overlap with beginless range", () => {
    expect(new Range(null, 5).overlap(new Range(3, 10))).toBe(true);
  });

  it("overlap with two beginless ranges", () => {
    expect(new Range(null, 5).overlap(new Range(null, 10))).toBe(true);
  });

  it("overlaps alias", () => {
    expect(new Range(1, 5).overlaps(new Range(3, 8))).toBe(true);
  });

  it("overlap behaves like ruby", () => {
    expect(new Range(1, 3).overlap(new Range(5, 8))).toBe(false);
  });

  it("should include identical inclusive", () => {
    expect(new Range(1, 10).isInclude(new Range(1, 10))).toBe(true);
  });

  it("should include identical exclusive", () => {
    expect(new Range(1, 10, true).isInclude(new Range(1, 10, true))).toBe(true);
  });

  it("should include other with exclusive end", () => {
    expect(new Range(1, 10).isInclude(new Range(1, 11, true))).toBe(true);
  });

  it("include returns false for backwards", () => {
    expect(new Range(1, 10).isInclude(new Range(5, 3))).toBe(false);
  });

  it("include returns false for empty exclusive end", () => {
    expect(new Range(1, 5).isInclude(new Range(3, 3, true))).toBe(false);
  });

  it("include with endless range", () => {
    expect(new Range(1, null).isInclude(2)).toBe(true);
  });

  it("should include range with endless range", () => {
    expect(new Range(1, null).isInclude(new Range(2, 4))).toBe(true);
  });

  it("should not include range with endless range", () => {
    expect(new Range(1, null).isInclude(new Range(0, 4))).toBe(false);
  });

  it("include with beginless range", () => {
    expect(new Range(null, 2).isInclude(1)).toBe(true);
  });

  it("should include range with beginless range", () => {
    expect(new Range(null, 2).isInclude(new Range(-1, 1))).toBe(true);
  });

  it("should not include range with beginless range", () => {
    expect(new Range(null, 2).isInclude(new Range(-1, 3))).toBe(false);
  });

  it("should compare identical inclusive", () => {
    expect(new Range(1, 10).caseEquals(new Range(1, 10))).toBe(true);
  });

  it("should compare identical exclusive", () => {
    expect(new Range(1, 10, true).caseEquals(new Range(1, 10, true))).toBe(true);
  });

  it("should compare other with exclusive end", () => {
    expect(new Range(1, 10).caseEquals(new Range(1, 11, true))).toBe(true);
  });

  it("compare returns false for backwards", () => {
    expect(new Range(1, 10).caseEquals(new Range(5, 3))).toBe(false);
  });

  it("compare returns false for empty exclusive end", () => {
    expect(new Range(1, 5).caseEquals(new Range(3, 3, true))).toBe(false);
  });

  it("should compare range with endless range", () => {
    expect(new Range(1, null).caseEquals(new Range(2, 4))).toBe(true);
  });

  it("should not compare range with endless range", () => {
    expect(new Range(1, null).caseEquals(new Range(0, 4))).toBe(false);
  });

  it("should compare range with beginless range", () => {
    expect(new Range(null, 2).caseEquals(new Range(-1, 1))).toBe(true);
  });

  it("should not compare range with beginless range", () => {
    expect(new Range(null, 2).caseEquals(new Range(-1, 3))).toBe(false);
  });

  it("exclusive end should not include identical with inclusive end", () => {
    expect(new Range(1, 10, true).isInclude(new Range(1, 10))).toBe(false);
  });

  it("should not include overlapping first", () => {
    expect(new Range(2, 8).isInclude(new Range(1, 3))).toBe(false);
  });

  it("should not include overlapping last", () => {
    expect(new Range(2, 8).isInclude(new Range(5, 9))).toBe(false);
  });

  it("should include identical exclusive with floats", () => {
    expect(new Range(1.0, 10.0, true).isInclude(new Range(1.0, 10.0, true))).toBe(true);
  });

  it("cover is not override", () => {
    // Rails: `range.method(:include?) != range.method(:cover?)`.
    expect(Range.prototype.isInclude).not.toBe(Range.prototype.cover);
  });
  it("overlap on time", () => {
    const t1 = new Date("2023-01-01"),
      t2 = new Date("2023-06-01");
    const t3 = new Date("2023-03-01"),
      t4 = new Date("2023-12-31");
    expect(new Range(t1, t2).overlap(new Range(t3, t4))).toBe(true);
  });

  it("no overlap on time", () => {
    const t1 = new Date("2023-01-01"),
      t2 = new Date("2023-03-01");
    const t3 = new Date("2023-06-01"),
      t4 = new Date("2023-12-31");
    expect(new Range(t1, t2).overlap(new Range(t3, t4))).toBe(false);
  });

  it("each on time with zone", () => {
    const twz = new TimeWithZone(
      instantFromDate(new Date(Date.UTC(2006, 10, 28, 10, 30))),
      TimeZone.find("Eastern Time (US & Canada)")!,
    );
    expect(() => [...new Range(twz.minus(hours(1)), twz).each()]).toThrow(TypeError);
  });

  it("step on time with zone", () => {
    const twz = new TimeWithZone(
      instantFromDate(new Date(Date.UTC(2006, 10, 28, 10, 30))),
      TimeZone.find("Eastern Time (US & Canada)")!,
    );
    expect(() => [...new Range(twz.minus(hours(1)), twz).step(1)]).toThrow(TypeError);
  });
  it.skip("cover on time with zone");
  it.skip("case equals on time with zone");

  it("date time with each", () => {
    const r = new Range(0, 4);
    expect([...r.each()]).toEqual([0, 1, 2, 3, 4]);
  });

  it("string include uses succ order not lexicographic", () => {
    // Mirrors Ruby ("aaa".."bbb").include? — succ order (length, then lex).
    const r = new Range("aaa", "bbb");
    expect(r.isInclude("aaa")).toBe(true);
    expect(r.isInclude("abc")).toBe(true);
    expect(r.isInclude("bbb")).toBe(true);
    expect(r.isInclude("bbc")).toBe(false); // past end
    expect(r.isInclude("aa")).toBe(false); // shorter than begin
    expect(r.isInclude("aaab")).toBe(false); // longer than end

    // succ order, not lexical: "z" is shorter than "bbb" so it sorts before it,
    // even though "z" > "bbb" lexically. Ruby: ("a".."bbb").include?("z") == true.
    const r2 = new Range("a", "bbb");
    expect(r2.isInclude("z")).toBe(true);
    expect(r2.isInclude("ab")).toBe(true);
    expect(new Range("a", "z").isInclude("mm")).toBe(false);
  });

  it("string include approximates succ for mixed character classes", () => {
    // Ruby's String#succ never produces "a1" from "a" (it carries within a
    // single character class and never mixes letters with digits), so
    // ("a".."bbb").include?("a1") == false. Faithful succ enumeration matches.
    expect(new Range("a", "bbb").isInclude("a1")).toBe(false);
  });

  it("string include raises on beginless/endless ranges", () => {
    // Ruby's Range#include? raises TypeError on beginless/endless string
    // ranges ("cannot determine inclusion in beginless/endless ranges").
    expect(() => new Range(null, "bbb").isInclude("z")).toThrow(TypeError);
    expect(() => new Range("a", null).isInclude("z")).toThrow(TypeError);
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
    const r = new Range(0, 10);
    expect([...r.step(2)]).toEqual([0, 2, 4, 6, 8, 10]);
  });
});
