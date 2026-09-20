import { describe, it, expect } from "vitest";

import { Temporal } from "@blazetrails/date";

import { hours } from "../duration.js";
import { TypeError as RubyTypeError } from "@blazetrails/ruby-compat";
import { Range } from "@blazetrails/ruby-compat/range";
import { instantFromDate } from "../testing/temporal-helpers.js";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../values/time-zone.js";
import { succ } from "@blazetrails/ruby-compat";
import "./range/compare-range.js";
import "./range/conversions.js";
import "./range/each.js";
import "./range/overlap.js";

function assertOperator<T>(o1: Range<T>, operator: "overlap", o2: Range<T>): void {
  expect(o1[operator](o2)).toBeTruthy();
}

function assertNotOperator<T>(o1: Range<T>, operator: "overlap", o2: Range<T>): void {
  expect(o1[operator](o2)).toBeFalsy();
}

function assertNotIncludes<T>(collection: Range<T>, obj: unknown): void {
  expect(collection.isInclude(obj as T)).toBe(false);
}

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
    const dateTime = Temporal.PlainDateTime.from("2005-12-10T00:00:00");
    expect(new Range(dateTime, dateTime)).toBeInstanceOf(Range);
    expect(new Range<unknown>(Infinity, Infinity)).toBeInstanceOf(Range);
    expect(new Range<unknown>(dateTime, Infinity)).toBeInstanceOf(Range);
  });

  it("overlap last inclusive", () => {
    expect(new Range(1, 5).overlap(new Range(5, 10))).toBeTruthy();
  });

  it("overlap last exclusive", () => {
    expect(new Range(1, 5, true).overlap(new Range(5, 10))).toBeFalsy();
  });

  it("overlap first inclusive", () => {
    expect(new Range(5, 10).overlap(new Range(1, 5))).toBeTruthy();
  });

  it("overlap first exclusive", () => {
    expect(new Range(5, 10).overlap(new Range(1, 5, true))).toBeFalsy();
  });

  it("overlap with beginless range", () => {
    expect(new Range(1, 5).overlap(new Range(null, 10))).toBeTruthy();
  });

  it("overlap with two beginless ranges", () => {
    expect(new Range(null, 5).overlap(new Range(null, 10))).toBeTruthy();
  });

  it("overlaps alias", () => {
    expect(new Range(1, 5).overlaps(new Range(5, 10))).toBeTruthy();
    expect(new Range(1, 5, true).overlaps(new Range(6, 10))).toBeFalsy();
  });

  it("overlap behaves like ruby", () => {
    assertNotOperator(new Range(0, 2), "overlap", new Range(-2, -1));
    assertNotOperator(new Range(0, 2), "overlap", new Range(-2, 0, true));
    assertOperator(new Range(0, 2), "overlap", new Range(-1, 0));
    assertOperator(new Range(0, 2), "overlap", new Range(1, 2));
    assertOperator(new Range(0, 2), "overlap", new Range(2, 3));
    assertNotOperator(new Range(0, 2), "overlap", new Range(3, 4));
    assertNotOperator(new Range(0, 2, true), "overlap", new Range(2, 3));
    assertOperator(new Range(null, 0), "overlap", new Range(-1, 0));
    assertOperator(new Range(null, 0, true), "overlap", new Range(-1, 0));
    assertOperator(new Range(null, 0), "overlap", new Range(0, 1));
    assertOperator(new Range(null, 0), "overlap", new Range(null, 1));
    assertNotOperator(new Range(null, 0), "overlap", new Range(1, 2));
    assertNotOperator(new Range(null, 0, true), "overlap", new Range(0, 1));
    assertNotOperator(new Range(0, null), "overlap", new Range(-2, -1));
    assertNotOperator(new Range(0, null), "overlap", new Range(null, 0, true));
    assertOperator(new Range(0, null), "overlap", new Range(-1, 0));
    assertOperator(new Range(0, null), "overlap", new Range(null, 0));
    assertOperator(new Range(0, null), "overlap", new Range(0, 1));
    assertOperator(new Range(0, null), "overlap", new Range(1, 2));
    assertOperator(new Range(0, null), "overlap", new Range(1, null));

    assertNotOperator(new Range(1, 3), "overlap", new Range("a", "d") as never);

    expect(() => new Range(0, null).overlap(1 as never)).toThrow(RubyTypeError);
    expect(() => new Range(0, null).overlap(null as never)).toThrow(RubyTypeError);

    assertOperator(new Range(1, 3), "overlap", new Range(2, 4));
    assertOperator(new Range(1, 3, true), "overlap", new Range(2, 3));
    assertOperator(new Range(2, 3), "overlap", new Range(1, 2));
    assertOperator(new Range(null, 3), "overlap", new Range(3, null));
    assertOperator(new Range(null, null), "overlap", new Range(3, null));
    assertOperator(new Range(null, null, true), "overlap", new Range(null, null));

    expect(() => new Range(1, 3).overlap(1 as never)).toThrow(RubyTypeError);

    assertNotOperator(new Range(1, 2), "overlap", new Range(2, 2, true));
    assertNotOperator(new Range(2, 2, true), "overlap", new Range(1, 2));

    assertNotOperator(new Range(4, 1), "overlap", new Range(2, 3));
    assertNotOperator(new Range(4, 1), "overlap", new Range(null, 3));
    assertNotOperator(new Range(4, 1), "overlap", new Range(2, null));

    assertNotOperator(new Range(1, 4), "overlap", new Range(3, 2));
    assertNotOperator(new Range(null, 4), "overlap", new Range(3, 2));
    assertNotOperator(new Range(1, null), "overlap", new Range(3, 2));

    assertNotOperator(new Range(4, 5), "overlap", new Range(2, 3));
    assertNotOperator(new Range(4, 5), "overlap", new Range(2, 4, true));

    assertNotOperator(new Range(1, 2), "overlap", new Range(3, 4));
    assertNotOperator(new Range(1, 3, true), "overlap", new Range(3, 4));

    assertNotOperator(new Range(4, 5), "overlap", new Range(2, 3));
    assertNotOperator(new Range(4, 5), "overlap", new Range(2, 4, true));

    assertNotOperator(new Range(1, 2), "overlap", new Range(3, 4));
    assertNotOperator(new Range(1, 3, true), "overlap", new Range(3, 4));
    assertNotOperator(new Range(null, 3, true), "overlap", new Range(3, null));
  });

  it("should include identical inclusive", () => {
    expect(new Range(1, 10).isInclude(new Range(1, 10))).toBeTruthy();
  });

  it("should include identical exclusive", () => {
    expect(new Range(1, 10, true).isInclude(new Range(1, 10, true))).toBeTruthy();
  });

  it("should include other with exclusive end", () => {
    expect(new Range(1, 10).isInclude(new Range(1, 11, true))).toBeTruthy();
  });

  it("include returns false for backwards", () => {
    expect(new Range(1, 10).isInclude(new Range(5, 3))).toBeFalsy();
  });

  it("include returns false for empty exclusive end", () => {
    expect(new Range(1, 5).isInclude(new Range(3, 3, true))).toBeFalsy();
  });

  it("include with endless range", () => {
    expect(new Range(1, null).isInclude(2)).toBeTruthy();
  });

  it("should include range with endless range", () => {
    expect(new Range(1, null).isInclude(new Range(2, 4))).toBeTruthy();
  });

  it("should not include range with endless range", () => {
    expect(new Range(1, null).isInclude(new Range(0, 4))).toBeFalsy();
  });

  it("include with beginless range", () => {
    expect(new Range(null, 2).isInclude(1)).toBeTruthy();
  });

  it("should include range with beginless range", () => {
    expect(new Range(null, 2).isInclude(new Range(-1, 1))).toBeTruthy();
  });

  it("should not include range with beginless range", () => {
    expect(new Range(null, 2).isInclude(new Range(-1, 3))).toBeFalsy();
  });

  it("should compare identical inclusive", () => {
    expect(new Range(1, 10).caseEquals(new Range(1, 10))).toBeTruthy();
  });

  it("should compare identical exclusive", () => {
    expect(new Range(1, 10, true).caseEquals(new Range(1, 10, true))).toBeTruthy();
  });

  it("should compare other with exclusive end", () => {
    expect(new Range(1, 10).caseEquals(new Range(1, 11, true))).toBeTruthy();
  });

  it("compare returns false for backwards", () => {
    expect(new Range(1, 10).caseEquals(new Range(5, 3))).toBeFalsy();
  });

  it("compare returns false for empty exclusive end", () => {
    expect(new Range(1, 5).caseEquals(new Range(3, 3, true))).toBeFalsy();
  });

  it("should compare range with endless range", () => {
    expect(new Range(1, null).caseEquals(new Range(2, 4))).toBeTruthy();
  });

  it("should not compare range with endless range", () => {
    expect(new Range(1, null).caseEquals(new Range(0, 4))).toBeFalsy();
  });

  it("should compare range with beginless range", () => {
    expect(new Range(null, 2).caseEquals(new Range(-1, 1))).toBeTruthy();
  });

  it("should not compare range with beginless range", () => {
    expect(new Range(null, 2).caseEquals(new Range(-1, 3))).toBeFalsy();
  });

  it("exclusive end should not include identical with inclusive end", () => {
    assertNotIncludes(new Range(1, 10, true), new Range(1, 10));
  });

  it("should not include overlapping first", () => {
    assertNotIncludes(new Range(2, 8), new Range(1, 3));
  });

  it("should not include overlapping last", () => {
    assertNotIncludes(new Range(2, 8), new Range(5, 9));
  });

  it("should include identical exclusive with floats", () => {
    expect(new Range(1.0, 10.0, true).isInclude(new Range(1.0, 10.0, true))).toBeTruthy();
  });

  it("cover is not override", () => {
    expect(Range.prototype.isInclude !== Range.prototype.cover).toBeTruthy();
  });
  it("overlap on time", () => {
    const t1 = new Date("2023-01-01"),
      t2 = new Date("2023-06-01");
    const t3 = new Date("2023-03-01"),
      t4 = new Date("2023-12-31");
    expect(new Range(t1, t2).overlap(new Range(t3, t4))).toBeTruthy();
  });

  it("no overlap on time", () => {
    const t1 = new Date("2023-01-01"),
      t2 = new Date("2023-03-01");
    const t3 = new Date("2023-06-01"),
      t4 = new Date("2023-12-31");
    expect(new Range(t1, t2).overlap(new Range(t3, t4))).toBeFalsy();
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

  it("cover on time with zone", () => {
    const twz = new TimeWithZone(
      instantFromDate(new Date(Date.UTC(2006, 10, 28, 10, 30))),
      TimeZone.find("Eastern Time (US & Canada)")!,
    );
    expect(new Range(twz.minus(hours(1)), twz).cover(twz)).toBeTruthy();
  });

  it("case equals on time with zone", () => {
    const twz = new TimeWithZone(
      instantFromDate(new Date(Date.UTC(2006, 10, 28, 10, 30))),
      TimeZone.find("Eastern Time (US & Canada)")!,
    );
    expect(new Range(twz.minus(hours(1)), twz).caseEquals(twz)).toBeTruthy();
  });

  it("date time with each", () => {
    const r = new Range(0, 4);
    expect([...r.each()]).toBeTruthy();
  });

  it("string include uses succ order not lexicographic", () => {
    const r = new Range("aaa", "bbb");
    expect(r.isInclude("aaa")).toBe(true);
    expect(r.isInclude("abc")).toBe(true);
    expect(r.isInclude("bbb")).toBe(true);
    expect(r.isInclude("bbc")).toBe(false);
    expect(r.isInclude("aa")).toBe(false);
    expect(r.isInclude("aaab")).toBe(false);

    const r2 = new Range("a", "bbb");
    expect(r2.isInclude("z")).toBe(true);
    expect(r2.isInclude("ab")).toBe(true);
    expect(new Range("a", "z").isInclude("mm")).toBe(false);
  });

  it("string include approximates succ for mixed character classes", () => {
    expect(new Range("a", "bbb").isInclude("a1")).toBe(false);
  });

  it("string include raises on beginless/endless ranges", () => {
    expect(() => new Range(null, "bbb").isInclude("z")).toThrow(TypeError);
    expect(() => new Range("a", null).isInclude("z")).toThrow(TypeError);
  });

  it("string succ carries within character classes", () => {
    expect(succ("abcd")).toBe("abce");
    expect(succ("az")).toBe("ba");
    expect(succ("zz")).toBe("aaa");
    expect(succ("Zz")).toBe("AAa");
    expect(succ("99")).toBe("100");
    expect(succ("a9")).toBe("b0");
    expect(succ("1.9")).toBe("2.0");
    expect(succ("<<")).toBe("<=");
    expect(succ("z.9")).toBe("z.10");
    expect(succ("a.z")).toBe("b.a");
    expect(succ("\u{1F600}")).toBe("\u{1F601}");
    const points = (str: string) => Array.from(str, (c) => c.codePointAt(0));
    expect(points(succ("\u{10FFFF}"))).toEqual([0x1, 0x10000]);
    expect(points(succ("\u{FFFF}"))).toEqual([0x1, 0x800]);
    expect(points(succ("\u{07FF}"))).toEqual([0x1, 0x80]);
  });

  it("date time with step", () => {
    const r = new Range(0, 10);
    expect([...r.step(2)]).toBeTruthy();
  });
});
