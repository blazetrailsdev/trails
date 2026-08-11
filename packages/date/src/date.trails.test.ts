/**
 * Trails-only: Ruby's `::Date` is stdlib, so it has no Rails test to mirror.
 * These cover the members `I18n::Backend::Base#localize` duck-types.
 */

import { Temporal } from "@js-temporal/polyfill";
import { describe, it, expect, vi } from "vitest";
import {
  ArgumentError,
  Date as RubyDate,
  DateTime as RubyDateTime,
  ERANGE,
  Rational,
  dNewByFrags,
  dtNewByFrags,
  strftime,
  type DateParts,
} from "./date.js";
import { Time as RubyTime } from "./time.js";

/**
 * The gem-shaped `::Date` / `::DateTime` RFC 0088's opt-in answers. The statics
 * answer `Temporal` now ({@link RubyDate#toDate} / {@link RubyDateTime#toDatetime}),
 * and these are the exported builders those statics themselves call — the way
 * back to the object for the members the `Temporal` seat cannot carry: `zone`,
 * `offset` and `secFraction` (a `Rational` past nanosecond precision), plus the
 * gem's own `to_s` spelling.
 */
const gemDate = (str: string, comp?: boolean) => dNewByFrags(RubyDate._parse(str, comp));
const gemDateTime = (str: string, comp?: boolean) => dtNewByFrags(RubyDate._parse(str, comp));

/** The `y-mm-dd` a date names, for a one-line assertion. */
function ymd(date: RubyDate | Temporal.PlainDate): string {
  const mon = date instanceof RubyDate ? date.mon : date.month;
  return `${date.year}-${String(mon).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

describe("Date", () => {
  it("keeps a fractional Date#+ a Date backed by complex data, as d_lite_plus does", () => {
    const d = new RubyDate(2001, 1, 1).plus(new Rational(1, 2));
    expect(d).toBeInstanceOf(RubyDate);
    expect(d).not.toBeInstanceOf(RubyDateTime);
    expect(d.dayFraction).toEqual(new Rational(1, 2));
    expect("hour" in d).toBe(false);
    expect(new RubyDateTime(2001, 1, 1).plus(new Rational(1, 86400 * 3)).inspect()).toContain(
      "(1000000000/3)n",
    );
    expect(new RubyDate(2001, 1, 1).plus(1).toS()).toBe("2001-01-02");
    expect(new RubyDate(2001, 1, 1).plus(-1).toS()).toBe("2000-12-31");
  });

  it("discards date_initialize's add_frac under Date.new and keeps it under Date.civil", () => {
    const d = new RubyDate(2001, 2, 3.5);
    expect(d.dayFraction).toBe(0);
    expect(d.complexDatP()).toBe(false);
    expect(d.toS()).toBe("2001-02-03");
    expect(RubyDate.civil(2001, 2, 3.5).equals(RubyDate.civil(2001, 2, 3))).toBe(true);
  });

  it("seats Date.today's civil triple under GREGORIAN, so the reform only changes the start", () => {
    const today = RubyDate.today();
    const jd = new RubyDate(today.year, today.month, today.day, RubyDate.GREGORIAN).jd;
    for (const start of [RubyDate.JULIAN, RubyDate.GREGORIAN, RubyDate.ITALY]) {
      expect(RubyDate.today(start).equals(RubyDate.jd(jd, start))).toBe(true);
    }
  });

  it("raises TypeError when deconstruct_keys is handed neither nil nor an Array", () => {
    const d = new RubyDate(1999, 5, 23);
    expect(() => d.deconstructKeys("year" as unknown as string[])).toThrow(TypeError);
    expect(() => d.deconstructKeys("year" as unknown as string[])).toThrow(
      "wrong argument type String (expected Array or nil)",
    );
  });

  it("parses a y-m-d string, padded or not", () => {
    for (const str of ["2008-07-02", "2008-7-2"]) {
      const date = RubyDate.parse(str);
      expect([date.year, date.month, date.day]).toEqual([2008, 7, 2]);
    }
  });

  it("parses the spellings ::Date.parse takes, one per date_parse.c sub-parser", () => {
    for (const str of [
      "2008-07-02",
      "2008/07/02",
      "2008.07.02",
      "20080702",
      "Jul 2 2008",
      "July 2nd, 2008",
      "2 Jul 2008",
      "2nd July 2008",
      "2-Jul-2008",
      "Wed, 2 Jul 2008",
      "Wednesday, July 2, 2008",
      "2008-07-02T10:30:00",
      "2008070210",
      "20080702123456",
    ]) {
      const date = RubyDate.parse(str);
      expect([str, date.year, date.month, date.day]).toEqual([str, 2008, 7, 2]);
    }
  });

  it("reads a two-digit head with a four-digit tail as d/m/y, as s3e does", () => {
    const date = RubyDate.parse("01/01/2012");
    expect([date.year, date.month, date.day]).toEqual([2012, 1, 1]);
    expect(() => RubyDate.parse("12/13/2012")).toThrow("invalid date");
  });

  it('completes a fragment from today, as "Feb 3rd".to_date does', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2008-08-04T12:00:00Z"));
    try {
      expect(Temporal.Now.plainDateISO("UTC").year).toBe(2008);
      const date = RubyDate.parse("Feb 3rd");
      expect([date.year, date.month, date.day]).toEqual([2008, 2, 3]);
    } finally {
      vi.useRealTimers();
    }
    const partial = RubyDate.parse("2008/07");
    expect([partial.year, partial.month, partial.day]).toEqual([2008, 7, 1]);
  });

  it("reads a bare two-digit run as the day of this month, as parse_ddd does", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2008-08-04T12:00:00Z"));
    try {
      const date = RubyDate.parse("02");
      expect([date.year, date.month, date.day]).toEqual([2008, 8, 2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads a three-digit run as this year's day of the year, as parse_ddd does", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2008-08-04T12:00:00Z"));
    try {
      const date = RubyDate.parse("102");
      expect([date.year, date.month, date.day]).toEqual([2008, 4, 11]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads a five-digit run as a two-digit year and a day of the year", () => {
    const date = RubyDate.parse("20080");
    expect([date.year, date.month, date.day]).toEqual([2020, 3, 20]);
  });

  it("reads a seven-digit run as a four-digit year and a day of the year", () => {
    const date = RubyDate.parse("2008070");
    expect([date.year, date.month, date.day]).toEqual([2008, 3, 10]);
    expect(() => RubyDate.parse("2007366")).toThrow("invalid date");
  });

  it("raises when no combination of frags is there, as rt__valid_date_frags_p answers nil", () => {
    for (const str of ["10:30", "not a date"]) {
      const parts = RubyDate._parse(str);
      expect([str, parts.jd, parts.year, parts.cwyear]).toEqual([
        str,
        undefined,
        undefined,
        undefined,
      ]);
      expect(() => RubyDate.parse(str)).toThrow("invalid date");
    }
  });

  it("reads a narrow run followed by a fraction as a time of day, not a date", () => {
    expect(() => RubyDate.parse("07.2008")).toThrow("invalid date");
  });

  it("takes the time of day out of the string first, as parse_time does", () => {
    const date = RubyDate.parse("2008070 10:30");
    expect([date.year, date.month, date.day]).toEqual([2008, 3, 10]);
    expect(() => RubyDate.parse("10:30")).toThrow("invalid date");
  });

  it("reads the leftover digits as the missing mday or hour, as parse_frag does", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2008-08-04T12:00:00Z"));
    try {
      for (const str of ["11pm 5", "5 11pm"]) {
        expect(RubyDate._parse(str)).toEqual({ hour: 23, mday: 5 });
        const date = RubyDate.parse(str);
        expect([date.year, date.month, date.day]).toEqual([2008, 8, 5]);
      }
      expect(RubyDate._parse("11pm")).toEqual({ hour: 23 });
      expect(RubyDate._parse("3rd 5 bc")).toEqual({ mday: 3, hour: 5 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads the one-fragment strings parse_year, parse_mon and parse_mday take", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2008-08-04T12:00:00Z"));
    try {
      const mday = RubyDate.parse("3rd");
      expect([mday.year, mday.month, mday.day]).toEqual([2008, 8, 3]);
      const mon = RubyDate.parse("Feb");
      expect([mon.year, mon.month, mon.day]).toEqual([2008, 2, 1]);
    } finally {
      vi.useRealTimers();
    }
    const year = RubyDate.parse("'01");
    expect([year.year, year.month, year.day]).toEqual([2001, 1, 1]);
  });

  it("reads the VMS date either way round, as parse_vms does", () => {
    for (const str of ["3-FEB-2001", "FEB-3-2001"]) {
      const date = RubyDate.parse(str);
      expect([str, date.year, date.month, date.day]).toEqual([str, 2001, 2, 3]);
    }
  });

  it("reads an apostrophized VMS year as the year, as s3e does", () => {
    for (const str of ["'01-FEB-3", "3-FEB-'01"]) {
      const date = RubyDate.parse(str);
      expect([str, date.year, date.month, date.day]).toEqual([str, 2001, 2, 3]);
    }
  });

  it("reads the era parse_eu and parse_us match, not only the trailing one", () => {
    expect(RubyDate.parse("july 4 1776 b.c.").year).toBe(-1775);
    expect(RubyDate.parse("1 jan 2008 ad").year).toBe(2008);
  });

  it("reads a JIS X 0301 date, as parse_jis does", () => {
    const heisei = RubyDate.parse("H13.02.03");
    expect([heisei.year, heisei.month, heisei.day]).toEqual([2001, 2, 3]);
    const meiji = RubyDate.parse("M6.5.4");
    expect([meiji.year, meiji.month, meiji.day]).toEqual([1873, 5, 4]);
  });

  it("reads the ISO spellings parse_iso does not take, as parse_iso2 does", () => {
    const ordinal = RubyDate.parse("2001-034");
    expect([ordinal.year, ordinal.month, ordinal.day]).toEqual([2001, 2, 3]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2008-08-04T12:00:00Z"));
    try {
      for (const str of ["--0203", "--02-03"]) {
        const date = RubyDate.parse(str);
        expect([str, date.year, date.month, date.day]).toEqual([str, 2008, 2, 3]);
      }
    } finally {
      vi.useRealTimers();
    }
    expect(RubyDate._parse("2001-W05-6")).toEqual({ cwyear: 2001, cweek: 5, cwday: 6 });
  });

  it("builds a week date from the commercial entry of rt_complete_frags' table", () => {
    const full = RubyDate.parse("2001-W05-6");
    expect([full.year, full.month, full.day]).toEqual([2001, 2, 3]);
    const comp = RubyDate.parse("01-W05-6");
    expect([comp.year, comp.month, comp.day]).toEqual([2001, 2, 3]);
    const week = RubyDate.parse("2001-W05");
    expect([week.year, week.month, week.day]).toEqual([2001, 1, 29]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2008-08-04T12:00:00Z"));
    try {
      const today = RubyDate.parse("-W061");
      expect([today.year, today.month, today.day]).toEqual([2008, 2, 4]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a week outside the year, as c_valid_commercial_p does", () => {
    expect(() => RubyDate.parse("2001-W54-1")).toThrow("invalid date");
    expect(() => RubyDate.parse("2001-W00-1")).toThrow("invalid date");
    const long = RubyDate.parse("2020-W53-1");
    expect([long.year, long.month, long.day]).toEqual([2020, 12, 28]);
  });

  it("resolves a day of the week against today, as rt_complete_frags' wday entry does", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T12:00:00Z"));
    try {
      for (const [str, expected] of [
        ["sunday", "2026-08-02"],
        ["monday", "2026-08-03"],
        ["wednesday", "2026-08-05"],
        ["sat", "2026-08-08"],
        ["wed 10:00", "2026-08-05"],
      ] as const) {
        const date = RubyDate.parse(str);
        expect([str, `${date.year}-08-0${date.day}`]).toEqual([str, expected]);
      }
      expect(() => RubyDate.parse("wed 2008")).toThrow("invalid date");
      expect(() => RubyDate.parse("wed 10:00:00")).toThrow("invalid date");
      expect(() => RubyDate.parse("sunday 10:00:00")).toThrow("invalid date");
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to wday in the commercial arm, as rt__valid_date_frags_p does", () => {
    const sun = RubyDate.parse("2001-W05 sun");
    expect([sun.year, sun.month, sun.day]).toEqual([2001, 2, 4]);
    const wed = RubyDate.parse("2001-W05 wed");
    expect([wed.year, wed.month, wed.day]).toEqual([2001, 1, 31]);
    const cwday = RubyDate.parse("2001-W05-6 sun");
    expect([cwday.year, cwday.month, cwday.day]).toEqual([2001, 2, 3]);
  });

  it("prefers rt_complete_frags' wnum0 entry to the civil one on a year, a wday and a time", () => {
    for (const [str, expected] of [
      ["wed 10:00:00 '01", "2001-01-03"],
      ["'01 00:00:00 mon", "2001-01-01"],
      ["'26 12:00:00 sat", "2026-01-03"],
      ["mon 10:00:00 '90", "1990-01-01"],
    ] as const) {
      const date = RubyDate.parse(str);
      const mon = String(date.month).padStart(2, "0");
      const day = String(date.day).padStart(2, "0");
      expect([str, `${date.year}-${mon}-${day}`]).toEqual([str, expected]);
    }
    expect(() => RubyDate.parse("sun 10:00:00 '01")).toThrow("invalid date");
    expect(() => RubyDate.parse("thu 1:2:3 '99")).toThrow("invalid date");
    expect(() => RubyDate.parse("wed 10:00:00 '23")).toThrow("invalid date");
  });

  it("counts a negative week back from the year's end and a negative day back from Sunday, as c_valid_commercial_p does", () => {
    for (const [args, expected] of [
      [[2001, -1, -1], "2001-12-30"],
      [[2001, 5, -1], "2001-02-04"],
      [[2001, -1, 1], "2001-12-24"],
      [[2001, -52, 7], "2001-01-07"],
      [[2020, -1, -1], "2021-01-03"],
    ] as const) {
      const date = RubyDate.commercial(args[0], args[1], args[2]);
      const mon = String(date.month).padStart(2, "0");
      const day = String(date.day).padStart(2, "0");
      expect([args, `${date.year}-${mon}-${day}`]).toEqual([args, expected]);
    }
    expect(() => RubyDate.commercial(2001, -53, 1)).toThrow("invalid date");
  });

  it("counts a negative yday back from the year's last day, as c_valid_ordinal_p does", () => {
    for (const [args, expected] of [
      [[2001, -1], "2001-12-31"],
      [[2004, -60], "2004-11-02"],
      [[2001, -365], "2001-01-01"],
      [[2000, -366], "2000-01-01"],
    ] as const) {
      expect([args, ymd(RubyDate.ordinal(args[0], args[1]))]).toEqual([args, expected]);
    }
    expect(() => RubyDate.ordinal(2001, -366)).toThrow("invalid date");
    expect(() => RubyDate.ordinal(2001, 0)).toThrow("invalid date");
  });

  it("counts a negative mon back from December and a negative mday back from the month's end, as c_valid_civil_p does", () => {
    for (const [args, expected] of [
      [[2001, -1, -1], "2001-12-31"],
      [[2001, 2, -1], "2001-02-28"],
      [[2004, 2, -1], "2004-02-29"],
      [[2001, -11, 1], "2001-02-01"],
      [[2001, 12, -31], "2001-12-01"],
    ] as const) {
      expect([args, ymd(RubyDate.civil(args[0], args[1], args[2]))]).toEqual([args, expected]);
    }
    for (const args of [
      [2001, 2, -29],
      [2001, 0, 1],
      [2001, 13, 1],
      [2001, -13, 1],
    ] as const) {
      expect(() => RubyDate.civil(args[0], args[1], args[2])).toThrow("invalid date");
    }
  });

  it("expands a seconds frag into a jd and a time of day, as rt_rewrite_frags does", () => {
    const hash: DateParts = { seconds: 1000000000 };
    expect(ymd(dNewByFrags(hash))).toBe("2001-09-09");
    expect(hash).toEqual({ jd: 2452162, hour: 1, min: 46, sec: 40, secFraction: 0 });
    const offsetted: DateParts = { seconds: 1000000000, offset: -7200 };
    expect(ymd(dNewByFrags(offsetted))).toBe("2001-09-08");
    expect([offsetted.hour, offsetted.min, offsetted.sec]).toEqual([23, 46, 40]);
    const negative: DateParts = { seconds: -1 };
    expect(ymd(dNewByFrags(negative))).toBe("1969-12-31");
    expect([negative.hour, negative.min, negative.sec]).toEqual([23, 59, 59]);
  });

  it("carries a Rational offset into sec_fraction exactly, as f_add does", () => {
    const hash: DateParts = { seconds: 1234567890, offset: new Rational(171999, 5) };
    dNewByFrags(hash);
    expect([hash.hour, hash.min, hash.sec]).toEqual([9, 4, 49]);
    expect(String(hash.secFraction)).toBe("4/5");
  });

  it("answers a Rational sec_fraction for every argument, as ns_to_sec does", () => {
    // ruby 3.3.11 — `sec_fraction -> rational` (date_core.c:5623), which
    // `ns_to_sec`'s `rb_rational_new2` (:993-998) answers whatever it is handed:
    //   DateTime.new(2008, 3, 1, 6, 0, Rational(2)).sec_fraction #=> (0/1)
    //   DateTime.new(2001, 2, 3, 4, 5, 6.5).sec_fraction         #=> (1/2)
    expect(new RubyDateTime(2008, 3, 1, 6, 0, new Rational(2, 1)).secFraction).toEqual(
      new Rational(0, 1),
    );
    expect(new RubyDateTime(2001, 2, 3, 4, 5, 6.5).secFraction).toEqual(new Rational(1, 2));
  });

  it("keeps a fraction literal past Number.MAX_SAFE_INTEGER exact, as an Integer numerator does", () => {
    // ruby 3.3.11:
    //   DateTime.parse("2008-03-01T06:00:00." + "1" * 20).sec_fraction
    //   #=> (11111111111111111111/100000000000000000000)
    const parsed = gemDateTime(`2008-03-01T06:00:00.${"1".repeat(20)}`);
    expect(parsed.secFraction).toEqual(new Rational(11111111111111111111n, 100000000000000000000n));
    // The same denominator drives %N's long division, which stays exact too.
    expect(parsed.strftime("%20N")).toBe("11111111111111111111");
  });

  it("keeps a %N numerator past Number.MAX_SAFE_INTEGER exact, as str2num does", () => {
    // ruby 3.3.11:
    //   Date._strptime("2008-03-01T06:00:00." + "1" * 20, "%FT%T.%N")[:sec_fraction]
    //   #=> (11111111111111111111/100000000000000000000)
    const str = `2008-03-01T06:00:00.${"1".repeat(20)}`;
    expect(RubyDate._strptime(str, "%FT%T.%N")?.secFraction).toEqual(
      new Rational(11111111111111111111n, 100000000000000000000n),
    );
    //   DateTime.strptime(..., "%FT%T.%N").strftime("%FT%H:%M:%S.%20N")
    //   #=> "2008-03-01T06:00:00.11111111111111111111"
    // (`%T` on the way out is the separate `strftime-lacks-composite-conversions`.)
    expect(dtNewByFrags(RubyDate._strptime(str, "%FT%T.%N")).strftime("%FT%H:%M:%S.%20N")).toBe(
      `2008-03-01T06:00:00.${"1".repeat(20)}`,
    );
  });

  it("parses a time of day under DateTime's own default format", () => {
    // ruby 3.3.11:
    //   DateTime._strptime("2001-02-03T04:05:06+07:00")
    //   #=> {:year=>2001, :mon=>2, :mday=>3, :hour=>4, :min=>5, :sec=>6,
    //        :zone=>"+07:00", :offset=>25200}
    //   Date._strptime("2001-02-03T04:05:06+07:00")
    //   #=> {:year=>2001, :mon=>2, :mday=>3, :leftover=>"T04:05:06+07:00"}
    expect(RubyDateTime._strptime("2001-02-03T04:05:06+07:00")).toEqual({
      year: 2001,
      mon: 2,
      mday: 3,
      hour: 4,
      min: 5,
      sec: 6,
      zone: "+07:00",
      offset: 25200,
    });
    expect(RubyDate._strptime("2001-02-03T04:05:06+07:00")).toEqual({
      year: 2001,
      mon: 2,
      mday: 3,
      leftover: "T04:05:06+07:00",
    });
  });

  it("answers the frag hash date__strptime fills, as Date._strptime does", () => {
    expect(RubyDate._strptime("2001-02-03", "%Y-%m-%d")).toEqual({ year: 2001, mon: 2, mday: 3 });
    expect(RubyDate._strptime("2001-W05-6", "%G-W%V-%u")).toEqual({
      cwyear: 2001,
      cweek: 5,
      cwday: 6,
    });
    expect(RubyDate._strptime("2001 04 6", "%Y %U %w")).toEqual({
      year: 2001,
      wnum0: 4,
      wday: 6,
    });
    expect(RubyDate._strptime("sat3feb01", "%a%d%b%y")).toEqual({
      wday: 6,
      mday: 3,
      mon: 2,
      year: 2001,
    });
    expect(RubyDate._strptime("11:22:33 pm", "%I:%M:%S %p")).toEqual({
      hour: 23,
      min: 22,
      sec: 33,
    });
    expect(RubyDate._strptime("bogus", "%Y")).toBeNull();
  });

  it("completes the century of a two-digit year, as date__strptime's _cent does", () => {
    expect(RubyDate._strptime("68", "%y")).toEqual({ year: 2068 });
    expect(RubyDate._strptime("69", "%y")).toEqual({ year: 1969 });
    expect(RubyDate._strptime("19 69", "%C %y")).toEqual({ year: 1969 });
  });

  it("records the tail the format did not consume, as date__strptime's leftover does", () => {
    expect(RubyDate._strptime("2001-02-03 leftovers", "%F")).toEqual({
      year: 2001,
      mon: 2,
      mday: 3,
      leftover: " leftovers",
    });
  });

  it("reads a zone through date_zone_to_diff, as date__strptime's %z does", () => {
    expect(RubyDate._strptime("2001-02-03T04:05:06+09:00", "%FT%T%z")).toEqual({
      year: 2001,
      mon: 2,
      mday: 3,
      hour: 4,
      min: 5,
      sec: 6,
      zone: "+09:00",
      offset: 32400,
    });
  });

  it("sets the seconds frag from %s and %Q, the only producers rt_rewrite_frags has", () => {
    // ruby 3.3.11:
    //   Date._strptime("1000000000", "%s")     #=> {:seconds=>1000000000}
    //   Date._strptime("-1000000000", "%s")    #=> {:seconds=>-1000000000}
    //   Date._strptime("1000000000500", "%Q")  #=> {:seconds=>(2000000001/2)}
    //   Date._strptime("1234567890123", "%Q")  #=> {:seconds=>(1234567890123/1000)}
    //   Date._strptime("-1234567890123", "%Q") #=> {:seconds=>(-1234567890123/1000)}
    //   Date._strptime("9007199254740993", "%s") #=> {:seconds=>9007199254740993}
    expect(RubyDate._strptime("1000000000", "%s")).toEqual({ seconds: 1000000000n });
    expect(RubyDate._strptime("-1000000000", "%s")).toEqual({ seconds: -1000000000n });
    expect(RubyDate._strptime("1000000000500", "%Q")).toEqual({
      seconds: new Rational(2000000001n, 2n),
    });
    expect(RubyDate._strptime("1234567890123", "%Q")).toEqual({
      seconds: new Rational(1234567890123n, 1000n),
    });
    expect(RubyDate._strptime("-1234567890123", "%Q")).toEqual({
      seconds: new Rational(-1234567890123n, 1000n),
    });
    expect(RubyDate._strptime("9007199254740993", "%s")).toEqual({
      seconds: 9007199254740993n,
    });
  });

  it("expands an exact %Q through rt_rewrite_frags, as DateTime.strptime does", () => {
    // ruby 3.3.11:
    //   DateTime.strptime("1234567890123", "%Q").to_s #=> "2009-02-13T23:31:30+00:00"
    expect(dtNewByFrags(RubyDate._strptime("1234567890123", "%Q")).toS()).toBe(
      "2009-02-13T23:31:30+00:00",
    );
  });

  it("builds the date the frags name, as Date.strptime does", () => {
    for (const [str, fmt] of [
      ["2001-02-03", "%Y-%m-%d"],
      ["03-02-2001", "%d-%m-%Y"],
      ["2001-034", "%Y-%j"],
      ["2001-W05-6", "%G-W%V-%u"],
      ["2001 04 6", "%Y %U %w"],
      ["2001 05 6", "%Y %W %u"],
      ["sat3feb01", "%a%d%b%y"],
    ] as const) {
      expect(ymd(RubyDate.strptime(str, fmt))).toBe("2001-02-03");
    }
    expect(() => RubyDate.strptime("bogus", "%Y")).toThrow("invalid date");
  });

  it("reaches rt_rewrite_frags through %s and %Q, as Date.strptime does", () => {
    // ruby 3.3.11:
    //   Date.strptime("1000000000", "%s")    #=> #<Date: 2001-09-09>
    //   Date.strptime("1000000000500", "%Q") #=> #<Date: 2001-09-09>
    expect(ymd(RubyDate.strptime("1000000000", "%s"))).toBe("2001-09-09");
    expect(ymd(RubyDate.strptime("1000000000500", "%Q"))).toBe("2001-09-09");
  });

  it("skips rt_rewrite_frags and rt_complete_frags for a civil date, as d_new_by_frags does", () => {
    expect(ymd(dNewByFrags({ year: 2008, mon: 7, mday: 2, seconds: 1000000000 }))).toBe(
      "2008-07-02",
    );
  });

  it("negates the year of a BC date, as parse_bc does", () => {
    expect(RubyDate.parse("4004-01-02 BC").year).toBe(-4003);
    expect(RubyDate.parse("feb 3 4004 b.c.e.").year).toBe(-4003);
    expect(RubyDate.parse("70-1-2 BC").year).toBe(-69);
    expect(() => RubyDate.parse("4004 BC")).toThrow("invalid date");
  });

  it("leaves a signed year uncompleted, as date_parse.c does", () => {
    expect(RubyDate.parse("-08-07-02").year).toBe(-8);
    expect(RubyDate.parse("+08-07-02").year).toBe(8);
  });

  it("takes an apostrophe-marked token as the year, as s3e does", () => {
    expect(RubyDate._parse("'01-02-03")).toEqual({ year: 2001, mon: 2, mday: 3 });
    expect(RubyDate._parse("'01/02/03")).toEqual({ year: 2001, mon: 2, mday: 3 });
    expect(RubyDate._parse("'01.02.03")).toEqual({ year: 2001, mon: 2, mday: 3 });
    expect(RubyDate._parse("'01-02-'03")).toEqual({ year: 2003, mon: 2, mday: 1 });
    expect(RubyDate._parse("'01/02/'03")).toEqual({ year: 2003, mon: 2, mday: 1 });
    expect(RubyDate._parse("'01.02.'03")).toEqual({ year: 2003, mon: 2, mday: 1 });
    expect(RubyDate._parse("2008-07-'02")).toEqual({ year: 2002, mon: 7, mday: 2008 });
  });

  it("takes a leading + only where parse_iso does, as date_parse.c does", () => {
    expect(RubyDate._parse("+01-02-03")).toEqual({ year: 1, mon: 2, mday: 3 });
    expect(RubyDate._parse("+01/02/03")).toEqual({ year: 2001, mon: 2, mday: 3 });
    expect(RubyDate._parse("+01.02.03")).toEqual({ year: 2001, mon: 2, mday: 3 });
  });

  it("completes a two-digit year unless comp is false, as Ruby does", () => {
    expect(RubyDate.parse("080702").year).toBe(2008);
    expect(RubyDate.parse("690702").year).toBe(1969);
    expect(RubyDate.parse("080702", false).year).toBe(8);
  });

  it("sets :wday from the day name it strips, as parse_day_cb does", () => {
    expect(RubyDate._parse("Wed, 2 Jul 2008")).toEqual({ wday: 3, year: 2008, mon: 7, mday: 2 });
    expect(RubyDate._parse("Wednesday, July 2, 2008")).toEqual({
      wday: 3,
      year: 2008,
      mon: 7,
      mday: 2,
    });
    expect(RubyDate._parse("sat 2008-07-02")).toEqual({ wday: 6, year: 2008, mon: 7, mday: 2 });
    expect(RubyDate._parse("Wed")).toEqual({ wday: 3 });
  });

  it("answers a Rational offset for a fraction past two places, as date_zone_to_diff does", () => {
    for (const [zone, s] of [
      ["+9.5555", "171999/5"],
      ["-9.5555", "-171999/5"],
      ["+9.12345678", "102638889/3125"],
    ] as const) {
      const offset = RubyDate._parse(`2008-07-02 10:30:00 ${zone}`)?.offset;
      expect(offset).toBeInstanceOf(Rational);
      expect(String(offset)).toBe(s);
    }
  });

  it("answers the offset a zone names, as date_zone_to_diff does", () => {
    for (const [zone, offset] of [
      ["+09:00", 32400],
      ["gmt+9", 32400],
      ["utc-4", -14400],
      ["-09:30", -34200],
      ["+0930", 34200],
      ["+9", 32400],
      ["+9.5", 34200],
      ["+9.555", 34398],
      ["JST", 32400],
      ["Z", 0],
      ["IST", 19800],
      ["Pacific Standard Time", -28800],
      ["JST dst", 36000],
      ["jst standard time", 32400],
      ["nosuchzone", null],
      ["+24:00", null],
      ["+9:99", null],
    ] as const) {
      expect(RubyDate._parse(`2008-07-02 10:30:00 ${zone}`)?.offset).toBe(offset);
    }
  });

  it("answers the offset of a bracketed zone, as parse_ddd_cb does", () => {
    expect(RubyDate._parse("20080702[+9:JST]")).toMatchObject({ zone: "JST", offset: 32400 });
    expect(RubyDate._parse("20080702[9:JST]")).toMatchObject({ zone: "JST", offset: 32400 });
    expect(RubyDate._parse("20080702[9]")).toMatchObject({ zone: "9", offset: 32400 });
  });

  it("raises on an unparseable string", () => {
    expect(() => RubyDate.parse("not a date")).toThrow(ArgumentError);
    expect(() => RubyDate.parse("not a date")).toThrow("invalid date");
  });

  it("answers an empty Hash for a string no sub-parser matched", () => {
    expect(RubyDate._parse("not a date")).toEqual({});
    expect(RubyDate._parse("1 BCE")).toEqual({});
    expect(() => RubyDate.parse("1 BCE")).toThrow("invalid date");
  });

  it("raises Date::Error, which subclasses ArgumentError as it does in Ruby", () => {
    expect(() => RubyDate.parse("not a date")).toThrow(RubyDate.Error);
    expect(() => RubyDate.parse("2008-02-30")).toThrow(RubyDate.Error);
    expect(() => RubyDate.parse("not a date")).toThrow(ArgumentError);
    expect(new RubyDate.Error("invalid date").name).toBe("Date::Error");
  });

  it("counts wday from Sunday, as Ruby does", () => {
    expect(gemDate("2008-07-02").wday).toBe(3);
    expect(gemDate("2008-07-06").wday).toBe(0);
  });

  it("does not answer sec or hour, so localize resolves it against date.formats", () => {
    const date = RubyDate.parse("2008-07-02");
    expect("sec" in date).toBe(false);
    expect("hour" in date).toBe(false);
  });

  it("formats the strftime directives the date formats use", () => {
    const date = RubyDate.parse("2008-07-02");
    expect(strftime(date, "%Y-%m-%d")).toBe("2008-07-02");
    expect(strftime(date, "%b %d")).toBe("Jul 02");
    expect(strftime(date, "%B %d, %Y")).toBe("July 02, 2008");
    expect(strftime(date, "%a %A")).toBe("Wed Wednesday");
  });

  it("formats the strftime directives the conformance mixins use", () => {
    const date = RubyDate.parse("2008-07-02");
    expect(strftime(date, "%C")).toBe("20");
    expect(strftime(date, "%u %w")).toBe("3 3");
    expect(strftime(date, "%I %k %l")).toBe("12  0 12");
    expect(strftime(date, "%L %N")).toBe("000 000000000");
    expect(strftime(date, "%:z")).toBe("+00:00");
    expect(strftime(date, "%n%t")).toBe("\n\t");
  });

  it("computes %s from the receiver's own fields, as date_strftime does", () => {
    expect(strftime(RubyDate.parse("2008-07-02"), "%s")).toBe("1214956800");
    expect(strftime(RubyDate.parse("1969-12-31"), "%s")).toBe("-86400");
    expect(new RubyDateTime(2008, 7, 2, 6, 30, 15).strftime("%s")).toBe("1214980215");
  });

  it("strips the padding for the %-d flag and leaves unknown directives alone", () => {
    const date = RubyDate.parse("2008-07-02");
    expect(strftime(date, "%-m/%-d")).toBe("7/2");
    expect(strftime(date, "%i")).toBe("%i");
  });

  it("formats the composite and week-based directives date_strftime expands", () => {
    // Every expectation is `ruby 3.3.11 -rdate`'s answer for the same receiver.
    const date = RubyDate.parse("2008-07-02");
    const dt = new RubyDateTime(2008, 3, 1, 6, 7, 8.5);
    expect(strftime(date, "%T|%R|%r|%X")).toBe("00:00:00|00:00|12:00:00 AM|00:00:00");
    expect(dt.strftime("%T|%R|%r|%X")).toBe("06:07:08|06:07|06:07:08 AM|06:07:08");
    expect(strftime(date, "%c")).toBe("Wed Jul  2 00:00:00 2008");
    expect(dt.strftime("%c")).toBe("Sat Mar  1 06:07:08 2008");
    expect(strftime(date, "%D|%v")).toBe("07/02/08| 2-JUL-2008");
    expect(dt.strftime("%D|%v")).toBe("03/01/08| 1-MAR-2008");
    expect(strftime(date, "%+")).toBe("Wed Jul  2 00:00:00 +00:00 2008");
    expect(strftime(date, "%G|%V|%U|%W")).toBe("2008|27|26|26");
    expect(dt.strftime("%G|%V|%U|%W")).toBe("2008|09|08|08");
    // The week-based year runs back into the previous year here.
    expect(strftime(RubyDate.parse("2021-01-03"), "%U|%W|%V|%G|%g|%y")).toBe("01|00|53|2020|20|21");
    expect(strftime(date, "%Q")).toBe("1214956800000");
    expect(dt.strftime("%Q")).toBe("1204351628500");
  });

  it("applies the %^ and %# case flags, as date_strftime does", () => {
    const dt = new RubyDateTime(2008, 3, 1, 6, 7, 8.5);
    expect(dt.strftime("%^a %#a %^P %P %p %#p %^v")).toBe("SAT SAT AM am AM am  1-MAR-2008");
  });

  it("pads and left-strips a composite directive, as the STRFTIME macro does", () => {
    const date = RubyDate.parse("2008-07-02");
    expect(strftime(date, "%12T|%-T")).toBe("    00:00:00|00:00:00");
  });

  it("round-trips %T through strptime and strftime", () => {
    const parsed = RubyDateTime.strptime("2008-03-01T06:07:08.5", "%FT%T.%N");
    expect(strftime(parsed, "%FT%T.%20N")).toBe("2008-03-01T06:07:08.50000000000000000000");
  });

  it("honours the width prefix ahead of every directive, as date_strftime does", () => {
    // Every expectation is `ruby 3.3.11 -rdate`'s answer for the same receiver.
    const dt = new RubyDateTime(2008, 3, 1, 6, 7, 8.5);
    expect(dt.strftime("%12S")).toBe("000000000008");
    expect(dt.strftime("%6m")).toBe("000003");
    expect(dt.strftime("%4d")).toBe("0001");
    expect(dt.strftime("%2j")).toBe("61");
    expect(dt.strftime("%1Y")).toBe("2008");
    expect(dt.strftime("%3u")).toBe("006");
    expect(dt.strftime("%4s")).toBe("1204351628");
    expect(dt.strftime("%5e")).toBe("    1");
    expect(dt.strftime("%2L")).toBe("50");
    expect(dt.strftime("%20N")).toBe("50000000000000000000");
    expect(new RubyDate(2008, 3, 1).strftime("%6m")).toBe("000003");
  });

  it("fills a width on the text and recursive arms, as FILL_PADDING does", () => {
    const dt = new RubyDateTime(2008, 3, 1, 6, 7, 8.5);
    expect(dt.strftime("%12A")).toBe("    Saturday");
    expect(dt.strftime("%012A")).toBe("0000Saturday");
    expect(dt.strftime("%_12A")).toBe("    Saturday");
    expect(dt.strftime("%10F")).toBe("2008-03-01");
    expect(dt.strftime("%10x")).toBe("  03/01/08");
    expect(dt.strftime("%12%")).toBe("           %");
    expect(dt.strftime("%6n")).toBe("     \n");
  });

  it("reads the padding character off the _ and 0 flags", () => {
    const dt = new RubyDateTime(2008, 3, 1, 6, 7, 8.5);
    expect(dt.strftime("%_S")).toBe(" 8");
    expect(dt.strftime("%_m")).toBe(" 3");
    expect(dt.strftime("%0S")).toBe("08");
    expect(dt.strftime("%00S")).toBe("08");
  });

  it("subtracts the punctuation from a width on the %z arm", () => {
    const dt = new RubyDateTime(2008, 3, 1, 6, 7, 8.5);
    expect(dt.strftime("%5z")).toBe("+0000");
    expect(dt.strftime("%8z")).toBe("+0000000");
    expect(dt.strftime("%-z")).toBe("+000");
    const east = new RubyDateTime(2008, 3, 1, 6, 0, 0, "+05:30");
    expect(east.strftime("%8:z")).toBe("+0005:30");
    expect(east.strftime("%-:::z")).toBe("+5:30");
    expect(east.strftime("%_9z")).toBe("     +530");
  });

  it("leaves a width-qualified unknown directive alone", () => {
    const dt = new RubyDateTime(2008, 3, 1, 6, 7, 8.5);
    expect(dt.strftime("%9q")).toBe("%9q");
    // `FLAG_FOUND` (date_strftime.c:90-93) — a flag AFTER a width is unknown,
    // where the same flag before it is honoured.
    expect(dt.strftime("%3-S")).toBe("%3-S");
    expect(dt.strftime("%3_S")).toBe("%3_S");
    expect(dt.strftime("%-3S")).toBe("8");
    expect(dt.strftime("%_3S")).toBe("  8");
    expect(dt.strftime("%0-S")).toBe("8");
    expect(dt.strftime("%3^b")).toBe("%3^b");
    expect(dt.strftime("%Ez")).toBe("%Ez");
  });

  it("accepts and ignores the E and O locale extensions, as date_strftime does", () => {
    // Every expectation is `ruby 3.3.11 -rdate`'s.
    const dt = new RubyDateTime(2008, 3, 1, 6, 7, 8.5);
    expect(dt.strftime("%Oy")).toBe("08");
    expect(dt.strftime("%Ey")).toBe("08");
    expect(dt.strftime("%OV")).toBe("09");
    expect(dt.strftime("%OH")).toBe("06");
    expect(dt.strftime("%EX")).toBe("06:07:08");
    expect(dt.strftime("%Ec")).toBe("Sat Mar  1 06:07:08 2008");
    // Each whitelist is load-bearing in both directions: `z` is in neither, and
    // `y` is in `O`'s but `V` is not in `E`'s.
    expect(dt.strftime("%Oz")).toBe("%Oz");
    expect(dt.strftime("%Ez")).toBe("%Ez");
    expect(dt.strftime("%EV")).toBe("%EV");
    expect(dt.strftime("%E")).toBe("%E");
    expect(dt.strftime("%O")).toBe("%O");
    // `FLAG_FOUND` reads the LOCALE_E/LOCALE_O bits, so a width behind the
    // extension is unknown — and a width in front of it never reaches the
    // whitelist at all.
    expect(dt.strftime("%E3y")).toBe("%E3y");
    expect(dt.strftime("%O3S")).toBe("%O3S");
  });

  it("resolves the ordinal and week-date arms", () => {
    expect(strftime(RubyDate.parse("2008070"), "%Y-%m-%d")).toBe("2008-03-10");
    expect(strftime(RubyDate.parse("2001-W05-6"), "%Y-%m-%d")).toBe("2001-02-03");
  });

  it("reads wday, yday and the epoch off the Julian day, as m_wday and tmx_m_secs do", () => {
    // Every expectation is `ruby 3.3.11 -rdate`'s. `Date.new` / `DateTime.new`
    // default to `Date::ITALY`, so a date at or before the reform is a Julian
    // one and runs days apart from the proleptic Gregorian reading
    // `Temporal.PlainDate` answers — two days at year 1, eleven at -1234.
    expect(new RubyDateTime(1, 1, 1).strftime("%A|%a|%u|%w|%s")).toBe(
      "Saturday|Sat|6|6|-62135769600",
    );
    expect(new RubyDateTime(-1, 3, 1).strftime("%A|%a|%u|%w|%s")).toBe(
      "Saturday|Sat|6|6|-62193830400",
    );
    expect(new RubyDateTime(-1234, 3, 1).strftime("%A|%a|%u|%w|%s")).toBe(
      "Friday|Fri|5|5|-101104329600",
    );
    // The Julian leap day the Gregorian calendar does not have: 1500 is a leap
    // year under `Date::ITALY`, so 1 March is the 61st day of it.
    expect(new RubyDate(1500, 3, 1).yday).toBe(61);
    expect(new RubyDate(1500, 3, 1).wday).toBe(0);
    expect(new RubyDate(1500, 3, 1).jd).toBe(2268993);
    // Post-reform is byte-identical to the proleptic reading.
    expect(new RubyDateTime(2008, 3, 1, 6, 7, 8).strftime("%A|%a|%u|%w|%s|%j")).toBe(
      "Saturday|Sat|6|6|1204351628|061",
    );
    expect(new RubyDate(1970, 1, 1).jd).toBe(2440588);
  });

  it("names a day off a Julian day, as date_s_jd does", () => {
    // Every expectation is `ruby 3.3.11 -rdate`'s `Date.jd(jd)` — under the
    // default `Date::ITALY`, so 2299160 is the Julian 1582-10-04 the reform
    // deleted ten days after, not the proleptic Gregorian 1582-10-14.
    expect(strftime(RubyDate.jd(2440588), "%Y-%m-%d")).toBe("1970-01-01");
    expect(strftime(RubyDate.jd(2299161), "%Y-%m-%d")).toBe("1582-10-15");
    expect(strftime(RubyDate.jd(2299160), "%Y-%m-%d")).toBe("1582-10-04");
    expect(strftime(RubyDate.jd(2299160), "%j")).toBe("277");
  });

  it("reads a Temporal subject's wday and yday off the Julian day too", () => {
    // `temporalSubject` fills the same `StrftimeSubject` the gem-shaped path
    // does, so the two must answer one date identically — `Temporal`'s own
    // `dayOfWeek`/`dayOfYear` are proleptic (1500-03-01 is a Thursday and the
    // 60th day there, a Sunday and the 61st under `Date::ITALY`), which would
    // put `%A` days from the `%s` epochSeconds derives from the Julian day.
    for (const [y, m, d] of [
      [1, 1, 1],
      [-1234, 3, 1],
      [1500, 3, 1],
      [1582, 10, 4],
      [1582, 10, 15],
      [1970, 1, 1],
      [2008, 3, 1],
    ]) {
      expect(strftime(new Temporal.PlainDate(y, m, d), "%A|%u|%w|%s|%j")).toBe(
        new RubyDate(y, m, d).strftime("%A|%u|%w|%s|%j"),
      );
    }
    expect(strftime(new Temporal.PlainDate(1500, 3, 1), "%A|%j")).toBe("Sunday|061");
  });

  it("pads the year to four digits the way date_strftime's %Y does", () => {
    expect(new RubyDate(1, 1, 1).toS()).toBe("0001-01-01");
    expect(new RubyDate(99, 12, 31).toS()).toBe("0099-12-31");
    expect(new RubyDate(999, 6, 15).toS()).toBe("0999-06-15");
    expect(new RubyDate(-1, 1, 1).toS()).toBe("-0001-01-01");
    expect(new RubyDate(-12345, 1, 1).toS()).toBe("-12345-01-01");
    expect(new RubyDate(12345, 1, 1).toS()).toBe("12345-01-01");
    expect(new RubyDate(1, 1, 1).strftime("%F")).toBe("0001-01-01");
    // `%C` and `%y` go through the C's floored `div`/`mod`, so a BC year
    // answers `ruby 3.3.11 -rdate`'s `"-1"` and `"99"`, not `"-1"` and `"-1"`.
    expect(new RubyDate(-1, 3, 1).strftime("%Y|%-Y|%6Y|%C|%y")).toBe("-0001|-1|-00001|-1|99");
  });

  const civilOrError = (
    year: number,
    month: number,
    day: number,
  ): [number | bigint, number, number] | "E" => {
    try {
      const date = new RubyDate(year, month, day);
      return [date.year, date.mon, date.day];
    } catch {
      return "E";
    }
  };

  it("raises Date::Error on a civil date c_valid_civil_p rejects", () => {
    // Every expectation is `ruby 3.3.11 -rdate`'s `Date.new(y, m, d)` under the
    // default `Date::ITALY`, where 1582-10-10 is one of the ten days the reform
    // deleted.
    expect(() => new RubyDate(2001, 2, 29)).toThrow(RubyDate.Error);
    expect(civilOrError(1581, 12, 31)).toEqual([1581, 12, 31]);
    expect(civilOrError(1582, 10, 10)).toBe("E");
    expect(civilOrError(1500, 2, 29)).toEqual([1500, 2, 29]);
    // c_find_ldom's scan makes February 1500 twenty-nine days long, as the
    // Julian calendar has it, so the negative mday counts back from the 29th.
    expect(civilOrError(1500, 2, -1)).toEqual([1500, 2, 29]);
    expect(civilOrError(1582, 10, -1)).toEqual([1582, 10, 31]);
    expect(civilOrError(1900, 2, -1)).toEqual([1900, 2, 28]);
    expect(civilOrError(1900, 2, 29)).toBe("E");
    expect(civilOrError(2000, 2, 29)).toEqual([2000, 2, 29]);
    expect(civilOrError(2100, 2, 29)).toBe("E");
    expect(civilOrError(2100, 2, 28)).toEqual([2100, 2, 28]);
    expect(civilOrError(2001, 13, 1)).toBe("E");
    expect(civilOrError(-4712, 1, 1)).toEqual([-4712, 1, 1]);
  });

  it("builds a Julian-only civil date, as the HAVE_JD state does", () => {
    // ruby 3.3.11 -rdate: Julian leap years have no century rule, so 1500,
    // 1400 and 1300 are all leap under `Date::ITALY` and 29 February is a real
    // day none of them has a proleptic Gregorian spelling for.
    //   Date.new(1500, 2, 29) #=> "1500-02-29", jd 2268992, wday 6
    //   Date.new(1400, 2, 29) #=> "1400-02-29", jd 2232467, wday 0
    //   Date.new(1300, 2, 29) #=> "1300-02-29", jd 2195942, wday 1
    for (const [y, jd, wday] of [
      [1500, 2268992, 6],
      [1400, 2232467, 0],
      [1300, 2195942, 1],
    ] as const) {
      const date = new RubyDate(y, 2, 29);
      expect(date.toS()).toBe(`${y}-02-29`);
      expect(date.jd).toBe(jd);
      expect(date.wday).toBe(wday);
      expect(date.yday).toBe(60);
      // The `Temporal.PlainDate` seat is where the spelling runs out, not the
      // gem-shaped object: `to_date` is the only thing that raises.
      expect(() => date.toDate()).toThrow(RubyDate.Error);
    }
  });

  it("takes guess_style's proleptic arms for an infinite start, as date_initialize does", () => {
    // ruby 3.3.11 -rdate — `Date::GREGORIAN` is proleptic Gregorian everywhere,
    // so 1500 has no leap day and 1582-10-10 is a real day the reform never
    // deleted; `Date::JULIAN` is proleptic Julian everywhere, so 1900 does have
    // one:
    //   Date.new(1500, 2, 29, Date::GREGORIAN) #=> Date::Error: invalid date
    //   Date.new(1500, 2, 28, Date::GREGORIAN).jd #=> 2268982
    //   Date.new(1582, 10, 10, Date::GREGORIAN).to_s #=> "1582-10-10"
    //   Date.new(1900, 2, 29, Date::JULIAN).to_s #=> "1900-02-29"
    //   Date.new(2000, 1, 1, Date::JULIAN).jd #=> 2451558
    expect(() => new RubyDate(1500, 2, 29, RubyDate.GREGORIAN)).toThrow("invalid date");
    expect(new RubyDate(1500, 2, 28, RubyDate.GREGORIAN).jd).toBe(2268982);
    expect(new RubyDate(1582, 10, 10, RubyDate.GREGORIAN).toS()).toBe("1582-10-10");
    expect(new RubyDate(1900, 2, 29, RubyDate.JULIAN).toS()).toBe("1900-02-29");
    expect(new RubyDate(2000, 1, 1, RubyDate.JULIAN).jd).toBe(2451558);
    // datetime_initialize takes the same two arms:
    //   DateTime.new(1500, 2, 29, 0, 0, 0, 0, Date::GREGORIAN) #=> Date::Error
    //   DateTime.new(1900, 2, 29, 1, 2, 3, 0, Date::JULIAN).to_s
    //     #=> "1900-02-29T01:02:03+00:00"
    expect(() => new RubyDateTime(1500, 2, 29, 0, 0, 0, 0, RubyDate.GREGORIAN)).toThrow(
      "invalid date",
    );
    expect(new RubyDateTime(1900, 2, 29, 1, 2, 3, 0, RubyDate.JULIAN).toS()).toBe(
      "1900-02-29T01:02:03+00:00",
    );
    // A year past REFORM_END_YEAR takes the proleptic Gregorian arm under the
    // default start too, and answers the same day:
    //   Date.new(600000, 1, 1).jd #=> 220866560
    expect(new RubyDate(600000, 1, 1).jd).toBe(220866560);
  });

  it("carries decode_year's nth, so a year past a double stays exact", () => {
    // ruby 3.3.11 -rdate — the year and the day are Bignums, split into a
    // `nth` and an `int` residue by decode_year/decode_jd
    // (date_core.c:1342-1412):
    //   Date.new(2**70, 1, 1).to_s #=> "1180591620717411303424-01-01"
    //   Date.new(2**70, 1, 1).jd   #=> 431202235029879099711900
    //   Date.new(2**70, 1, 1).year #=> 1180591620717411303424
    //   Date.new(2**70, 1, 1).wday #=> 4
    //   Date.new(2**70, 1, 1).julian? #=> false
    const d = new RubyDate(2n ** 70n, 1, 1);
    expect(d.toS()).toBe("1180591620717411303424-01-01");
    expect(d.jd).toBe(431202235029879099711900n);
    expect(d.year).toBe(1180591620717411303424n);
    expect(d.wday).toBe(4);
    expect(d.mon).toBe(1);
    expect(d.day).toBe(1);
    expect(d.isJulian).toBe(false);
    // The residue year is validated as the real one is, so a day the residue's
    // February does not have raises:
    //   Date.new(2**70, 3, 1).to_s #=> "1180591620717411303424-03-01"
    //   Date.new(2**70, 2, 30) #=> Date::Error: invalid date
    expect(new RubyDate(2n ** 70n, 3, 1).toS()).toBe("1180591620717411303424-03-01");
    expect(() => new RubyDate(2n ** 70n, 2, 30)).toThrow("invalid date");
    // A negative nth is the mirror, and strftime spells the whole year:
    //   Date.new(-(2**70), 1, 1).to_s #=> "-1180591620717411303424-01-01"
    //   Date.new(2**70, 1, 1).strftime("%C|%y|%A") #=> "11805916207174113034|24|Thursday"
    expect(new RubyDate(-(2n ** 70n), 1, 1).toS()).toBe("-1180591620717411303424-01-01");
    expect(d.strftime("%C|%y|%A")).toBe("11805916207174113034|24|Thursday");
    // date_s_jd runs decode_jd on the day it is given:
    //   Date.jd(2**70).jd #=> 1180591620717411303424
    // DateTime carries the same nth on ComplexDateData:
    //   DateTime.new(2**70, 1, 1, 1, 2, 3).to_s
    //     #=> "1180591620717411303424-01-01T01:02:03+00:00"
    expect(new RubyDateTime(2n ** 70n, 1, 1, 1, 2, 3).toS()).toBe(
      "1180591620717411303424-01-01T01:02:03+00:00",
    );
  });

  it("threads decode_jd through the frags builders and the jd statics", () => {
    // ruby 3.3.11 -rdate — `d_new_by_frags` (date_core.c:4315) and
    // `dt_new_by_frags` (:8311) decode the Julian day rt__valid_*_p answered
    // back into the stored `nth`, which is the same object `Date.jd` /
    // `DateTime.jd` build (date_core.c:7697):
    //   Date.jd(2**70).to_s #=> "3232350070754114273-01-08"
    //   Date.jd(2**70).jd   #=> 1180591620717411303424
    //   Date.jd(2**70).wday #=> 3
    //   DateTime.jd(2**70, 1, 2, 3).to_s
    //     #=> "3232350070754114273-01-08T01:02:03+00:00"
    const d = dNewByFrags({ jd: 2n ** 70n });
    expect(d.toS()).toBe("3232350070754114273-01-08");
    expect(d.jd).toBe(1180591620717411303424n);
    expect(d.year).toBe(3232350070754114273n);
    expect(d.wday).toBe(3);
    const dt = dtNewByFrags({ jd: 2n ** 70n, hour: 1, min: 2, sec: 3 });
    expect(dt.toS()).toBe("3232350070754114273-01-08T01:02:03+00:00");
    expect(dt.jd).toBe(1180591620717411303424n);
  });

  it("truncates a fractional year through valid_civil_p, as decode_year does", () => {
    // ruby 3.3.11 -rdate — valid_civil_p (date_core.c:2246-2277) runs
    // decode_year before c_valid_civil_p's `int y`, and the truncation is of
    // the 4712-SHIFTED year, so it rounds toward -4712 rather than toward zero:
    //   Date.new(-2000.5, 1, 1).to_s #=> "-2001-01-01"
    //   Date.new(1600.5, 1, 1).to_s  #=> "1600-01-01"
    //   Date.new(1600.5, 1, 1).jd    #=> 2305448
    //   Date.new(-2000.5, 1, 1, Date::JULIAN).to_s #=> "-2001-01-01"
    expect(new RubyDate(-2000.5, 1, 1).toS()).toBe("-2001-01-01");
    expect(new RubyDate(1600.5, 1, 1).toS()).toBe("1600-01-01");
    expect(new RubyDate(1600.5, 1, 1).jd).toBe(2305448);
    expect(new RubyDate(-2000.5, 1, 1, RubyDate.JULIAN).toS()).toBe("-2001-01-01");
  });

  it("raises from every static that answers the seat for a Julian-only spelling", () => {
    // ruby 3.3.11 -rdate answers "1500-02-29" from all six — the gem's `::Date`
    // value is the gem object, so `date_to_date` (date_core.c:8977-8981) is
    // `self` and never raises. trails' `::Date` value is `Temporal.PlainDate`,
    // proleptic Gregorian, which has no 1500-02-29; RFC 0088's mapping table
    // names this the seat's limit rather than narrowing the default return.
    //   Date.civil(1500, 2, 29) / Date.jd(2268992) / Date.ordinal(1500, 60) /
    //   Date.commercial(1500, 9, 6) / Date.parse("1500-02-29") /
    //   Date.strptime("1500-02-29", "%Y-%m-%d")
    const statics: Array<() => Temporal.PlainDate> = [
      () => RubyDate.civil(1500, 2, 29),
      () => RubyDate.jd(2268992),
      () => RubyDate.ordinal(1500, 60),
      () => RubyDate.commercial(1500, 9, 6),
      () => RubyDate.parse("1500-02-29"),
      () => RubyDate.strptime("1500-02-29", "%Y-%m-%d"),
    ];
    for (const build of statics) {
      expect(build).toThrow(RubyDate.Error);
      expect(build).toThrow("invalid date");
    }

    // The gem-shaped builders the same statics run over answer it, so the
    // spelling is reachable — only the Temporal seat cannot hold it.
    expect(dNewByFrags(RubyDate._parse("1500-02-29")).toS()).toBe("1500-02-29");
  });

  /**
   * `valid_ordinal_p` / `valid_commercial_p` (date_core.c:2199-2227, :2274-2302)
   * wrap the int-level `c_valid_*_p` in the same `guess_style` branch
   * `valid_civil_p` (:2246-2277) has: a year past `REFORM_END_YEAR` is
   * proleptic Gregorian, so it is `decode_year`d into a `nth` and a residue
   * year FIRST and validated there. One `CM_PERIOD` is `CM_PERIOD_GCY` = 584388
   * Gregorian years (date_core.c:207-208), so year 600000 is past one.
   *
   * ruby 3.3.11 -rdate:
   *   Date.ordinal(600000, 60).to_s      #=> "600000-02-29"
   *   Date.ordinal(600000, 60).jd        #=> 220866619
   *   Date.commercial(600000, 9, 6).to_s #=> "600000-03-04"
   *   Date.commercial(600000, 9, 6).jd   #=> 220866623
   *
   * All four spellings agreeing is the point, and what they now agree on is the
   * raise: the seat takes the WHOLE day (`encode_jd`) and no
   * `Temporal.PlainDate` holds a year one `CM_PERIOD_GCY` past the residue.
   * They agreed on a residue-year date until
   * `date-seat-drops-nth-and-spells-the-residue-year` — `+015600-02-29` for all
   * four — which is the shared-but-wrong answer that story was filed for; the
   * provenance this test is about is unchanged, since hardcoding `nth = 0`
   * would still make ordinal/commercial disagree with civil.
   *
   * The frags path over the same wrappers (`rt__valid_ordinal_p`,
   * `rt__valid_commercial_p`, date_core.c:4125-4168) keeps MRI's whole answer,
   * `nth` and all, since it answers the gem-shaped object.
   */
  it("takes ordinal's and commercial's nth from valid_*_p, as civil already does", () => {
    for (const build of [
      () => RubyDate.civil(600000, 2, 29),
      () => RubyDate.ordinal(600000, 60),
      () => RubyDate.civil(600000, 3, 4),
      () => RubyDate.commercial(600000, 9, 6),
    ]) {
      expect(build).toThrow(RubyDate.Error);
      expect(build).toThrow("invalid date");
    }

    const o = dNewByFrags({ year: 600000, yday: 60 });
    expect([o.toS(), o.jd, o.year]).toEqual(["600000-02-29", 220866619, 600000]);
    const c = dNewByFrags({ cwyear: 600000, cweek: 9, cwday: 6 });
    expect([c.toS(), c.jd]).toEqual(["600000-03-04", 220866623]);
  });

  it("raises from the seat for a day past Temporal's range, decoded nth and all", () => {
    // The `nth` a Julian day past CM_PERIOD carries (date_core.c:1393-1412) is
    // ~year 580000 at its smallest, and `Temporal.PlainDate` stops at ±271821 —
    // so every static that answers the seat raises for one, the same way and
    // for the same reason the Julian-only spelling above does. MRI answers a
    // `::Date`/`::DateTime`, its own gem object:
    //   Date.jd(2**70).to_s #=> "3232350070754114273-01-08"
    //   DateTime.jd(2**70, 1, 2, 3).to_s
    //     #=> "3232350070754114273-01-08T01:02:03+00:00"
    expect(() => RubyDate.jd(2n ** 70n)).toThrow(RubyDate.Error);
    expect(() => RubyDateTime.jd(2n ** 70n, 1, 2, 3)).toThrow(RubyDate.Error);

    // The decode itself is intact underneath: the gem-shaped builders those
    // statics run over answer the day, `nth` and all.
    expect(dNewByFrags({ jd: 2n ** 70n }).toS()).toBe("3232350070754114273-01-08");
    expect(dtNewByFrags({ jd: 2n ** 70n, hour: 1, min: 2, sec: 3 }).toS()).toBe(
      "3232350070754114273-01-08T01:02:03+00:00",
    );

    // A year one CM_PERIOD_GCY (584388) past the residue is the smallest such
    // day, and it is the one the residue reading answered a plausible date for
    // — 600000 came back spelled "+015600-..." from every one of these.
    //   Date.civil(600000, 2, 29).to_s      #=> "600000-02-29"
    //   Date.ordinal(600000, 60).to_s       #=> "600000-02-29"
    //   Date.commercial(600000, 9, 6).to_s  #=> "600000-03-04"
    //   Date.civil(600000, 2, 29).jd        #=> 220866619
    for (const build of [
      () => RubyDate.civil(600000, 2, 29),
      () => RubyDate.ordinal(600000, 60),
      () => RubyDate.commercial(600000, 9, 6),
      () => RubyDate.weeknum(600000, 9, 6),
    ]) {
      expect(build).toThrow(RubyDate.Error);
      expect(build).toThrow("invalid date");
    }
    expect(dNewByFrags({ year: 600000, yday: 60 }).toS()).toBe("600000-02-29");
    expect(dNewByFrags({ year: 600000, yday: 60 }).jd).toBe(220866619);
  });

  it("takes a start argument, and Date::JULIAN/GREGORIAN select every day", () => {
    // ruby 3.3.11:
    //   Date.new(1582, 10, 10, Date::GREGORIAN).to_s #=> "1582-10-10"
    //   Date.new(1582, 10, 10, Date::GREGORIAN).jd   #=> 2299156
    //   Date.new(1582, 10, 10)                       #=> raises Date::Error
    //   Date.jd(2299160, Date::GREGORIAN).to_s       #=> "1582-10-14"
    //   Date.jd(2299160).to_s                        #=> "1582-10-04"
    //   Date.new(2001, 2, 3, Date::JULIAN).jd        #=> 2451957
    //   Date.new(2001, 2, 3).jd                      #=> 2451944
    //   Date.new(1500, 3, 1, Date::GREGORIAN).yday   #=> 60
    //   Date.new(1500, 3, 1).yday                    #=> 61
    expect(new RubyDate(1582, 10, 10, RubyDate.GREGORIAN).toS()).toBe("1582-10-10");
    expect(new RubyDate(1582, 10, 10, RubyDate.GREGORIAN).jd).toBe(2299156);
    expect(() => new RubyDate(1582, 10, 10)).toThrow(RubyDate.Error);
    expect(ymd(RubyDate.jd(2299160, RubyDate.GREGORIAN))).toBe("1582-10-14");
    expect(ymd(RubyDate.jd(2299160))).toBe("1582-10-04");
    expect(new RubyDate(2001, 2, 3, RubyDate.JULIAN).jd).toBe(2451957);
    expect(new RubyDate(2001, 2, 3).jd).toBe(2451944);
    expect(new RubyDate(1500, 3, 1, RubyDate.GREGORIAN).yday).toBe(60);
    expect(new RubyDate(1500, 3, 1).yday).toBe(61);
  });

  it("takes a start argument on every static that builds a date", () => {
    // ruby 3.3.11:
    //   Date.ordinal(1582, 355, Date::GREGORIAN).to_s      #=> "1582-12-21"
    //   Date.ordinal(1582, 355).to_s                       #=> "1582-12-31"
    //   Date.commercial(1582, 41, 4, Date::GREGORIAN).to_s #=> "1582-10-14"
    //   Date.commercial(1582, 41, 4).to_s                  #=> "1582-10-21"
    //   Date.parse("1582-10-10", true, Date::GREGORIAN).to_s          #=> "1582-10-10"
    //   Date.strptime("1582-10-10", "%F", Date::GREGORIAN).to_s       #=> "1582-10-10"
    expect(ymd(RubyDate.ordinal(1582, 355, RubyDate.GREGORIAN))).toBe("1582-12-21");
    expect(ymd(RubyDate.ordinal(1582, 355))).toBe("1582-12-31");
    expect(ymd(RubyDate.commercial(1582, 41, 4, RubyDate.GREGORIAN))).toBe("1582-10-14");
    expect(ymd(RubyDate.commercial(1582, 41, 4))).toBe("1582-10-21");
    expect(ymd(RubyDate.parse("1582-10-10", true, RubyDate.GREGORIAN))).toBe("1582-10-10");
    expect(ymd(RubyDate.strptime("1582-10-10", "%F", RubyDate.GREGORIAN))).toBe("1582-10-10");
    expect(() => RubyDate.parse("1582-10-10")).toThrow(RubyDate.Error);
  });

  it("answers start, julian?, gregorian? and new_start off the start it carries", () => {
    // ruby 3.3.11:
    //   Date.new(2001, 2, 3).start                     #=> 2299161.0
    //   Date.new(2001, 2, 3, Date::ENGLAND).start      #=> 2361222.0
    //   Date.new(2001, 2, 3, Date::JULIAN).start       #=> Infinity
    //   Date.new(2001, 2, 3, Date::GREGORIAN).start    #=> -Infinity
    //   Date.new(2001, 2, 3, 0).start                  #=> 2299161.0
    //   Date.new(1582, 10, 15).julian?                 #=> false
    //   Date.new(1582, 10, 15).gregorian?              #=> true
    //   Date.new(1582, 10, 4).julian?                  #=> true
    //   Date.new(2001, 2, 3, Date::JULIAN).julian?     #=> true
    //   Date.new(2001, 2, 3, Date::GREGORIAN).julian?  #=> false
    //   Date.new(1752, 9, 2, Date::ENGLAND).julian?    #=> true
    //   Date.new(1752, 9, 2, Date::ENGLAND).jd         #=> 2361221
    //   Date.new(1752, 9, 2).jd                        #=> 2361210
    expect(new RubyDate(2001, 2, 3).start).toBe(2299161);
    expect(new RubyDate(2001, 2, 3, RubyDate.ENGLAND).start).toBe(2361222);
    expect(new RubyDate(2001, 2, 3, RubyDate.JULIAN).start).toBe(Infinity);
    expect(new RubyDate(2001, 2, 3, RubyDate.GREGORIAN).start).toBe(-Infinity);
    // `val2sg` (date_core.c:3320-3327): a start outside the reform window is
    // ignored and DEFAULT_SG taken, as `val2off` ignores a bad offset.
    expect(new RubyDate(2001, 2, 3, 0).start).toBe(2299161);
    expect(new RubyDate(2001, 2, 3, NaN).start).toBe(2299161);

    expect(new RubyDate(1582, 10, 15).isJulian).toBe(false);
    expect(new RubyDate(1582, 10, 15).isGregorian).toBe(true);
    expect(new RubyDate(1582, 10, 4).isJulian).toBe(true);
    expect(new RubyDate(2001, 2, 3, RubyDate.JULIAN).isJulian).toBe(true);
    expect(new RubyDate(2001, 2, 3, RubyDate.GREGORIAN).isJulian).toBe(false);
    expect(new RubyDate(1752, 9, 2, RubyDate.ENGLAND).isJulian).toBe(true);
    expect(new RubyDate(1752, 9, 2, RubyDate.ENGLAND).jd).toBe(2361221);
    expect(new RubyDate(1752, 9, 2).jd).toBe(2361210);
  });

  it("re-reads the same Julian day under a new start, as new_start does", () => {
    // ruby 3.3.11:
    //   d0 = Date.new(2000, 2, 3)
    //   d0.new_start(Date::JULIAN).to_s #=> "2000-01-21"
    //   d0.new_start(Date::JULIAN).jd   #=> 2451578
    //   d0.new_start.start              #=> 2299161.0
    //   d0.julian.to_s                  #=> "2000-01-21"
    //   d0.italy.to_s                   #=> "2000-02-03"
    //   d0.england.to_s                 #=> "2000-02-03"
    //   d0.england.start                #=> 2361222.0
    //   d0.gregorian.to_s               #=> "2000-02-03"
    const d0 = new RubyDate(2000, 2, 3);
    expect(d0.isJulian).toBe(false);
    expect(d0.newStart(RubyDate.JULIAN).isJulian).toBe(true);
    expect(d0.newStart(RubyDate.JULIAN).toS()).toBe("2000-01-21");
    expect(d0.newStart(RubyDate.JULIAN).jd).toBe(2451578);
    expect(d0.newStart(RubyDate.ENGLAND).newStart().start).toBe(2299161);
    expect(d0.julian().toS()).toBe("2000-01-21");
    expect(d0.italy().toS()).toBe("2000-02-03");
    expect(d0.england().toS()).toBe("2000-02-03");
    expect(d0.england().start).toBe(2361222);
    expect(d0.gregorian().toS()).toBe("2000-02-03");
  });

  it("answers eql? only for a Date, where == admits a Numeric", () => {
    const d = new RubyDate(2002, 3, 19);
    expect(d.isEql(new RubyDate(2002, 3, 19))).toBe(true);
    expect(d.isEql(new RubyDate(2002, 3, 20))).toBe(false);
    expect(d.isEql(new RubyDateTime(2002, 3, 19, 0, 0, 0))).toBe(true);
    expect(d.isEql(new RubyDateTime(2002, 3, 19, 0, 0, 1))).toBe(false);

    expect(d.equals(d.ajd)).toBe(true);
    expect(d.isEql(d.ajd)).toBe(false);
    expect(d.isEql("2002-03-19")).toBe(false);
  });

  it("raises on a Bignum year to_time cannot narrow, where MRI's NUM2LONG raises", () => {
    // ruby 3.3.11:
    //   Date.new(10 ** 20).year.class #=> Integer (Bignum)
    //   Date.new(10 ** 20).to_time    #=> RangeError: bignum too big to convert into `long'
    // `m_real_year` (date_core.c:1746-1762) answers the Bignum, and
    // `date_to_time`'s `f_local3` (date_core.c:8949-8971) hands it straight to
    // `Time.local`, which cannot take it. Narrowing it through a JS `number`
    // instead would answer some other year entirely.
    const d = new RubyDate(10n ** 20n);
    expect(typeof d.year).toBe("bigint");
    expect(() => d.toTime()).toThrow(RangeError);
    expect(() => d.toTime()).toThrow("bignum too big to convert into `long'");
    expect(() => new RubyDateTime(10n ** 20n, 1, 1, 6, 30, 0).toTime()).toThrow(
      "bignum too big to convert into `long'",
    );
  });

  it("hashes eql?-equal dates alike", () => {
    expect(new RubyDate(2002, 3, 19).hash()).toBe(new RubyDate(2002, 3, 19).hash());
    expect(new RubyDate(2002, 3, 19).hash()).not.toBe(new RubyDate(2002, 3, 20).hash());
    expect(new RubyDate(2002, 3, 19).hash()).toBe(new RubyDateTime(2002, 3, 19, 0, 0, 0).hash());
  });
});

describe("DateTime", () => {
  it("leaves the inherited Date's day to get_s_jd on the proleptic-Gregorian arm", () => {
    // `datetime_initialize`'s negative `guess_style` arm stores
    // `HAVE_CIVIL | HAVE_TIME` with an `rjd` of `0` (date_core.c:7851-7870), so
    // the inherited half must be seeded civil-only — seeding it with the day
    // seat would leave `get_s_jd` (date_core.c:1168-1187) answering day 0
    // rather than the date. `DateTime` overrides every reader that would
    // notice, so the base method is reached directly here.
    const proto = Object.getPrototypeOf(RubyDateTime.prototype);
    let base = proto;
    while (base !== null && !Object.hasOwn(base, "mLocalJd")) base = Object.getPrototypeOf(base);
    const getSJd = (base as { mLocalJd(): number }).mLocalJd;

    const proleptic = new RubyDateTime(2001, 2, 3, 4, 5, 6, 0, RubyDate.GREGORIAN);
    expect(getSJd.call(proleptic)).toBe(2451944);
    expect(proleptic.jd).toBe(2451944);

    // The other arm resolves the day up front, so both halves agree there too.
    const civil = new RubyDateTime(2001, 2, 3, 4, 5, 6, 0, RubyDate.ITALY);
    expect(civil.jd).toBe(2451944);
  });

  it("keeps decode_year's nth through the proleptic-Gregorian arm", () => {
    // The base is handed the ORIGINAL year, not the residue `ry`
    // `valid_gregorian_p` decoded, so it re-derives the same `nth`; the residue
    // would have collapsed it to zero.
    const big = new RubyDateTime(2n ** 70n, 1, 1, 0, 0, 0, 0, RubyDate.GREGORIAN);
    expect(big.year).toBe(2n ** 70n);
    expect(big.jd).toBe(new RubyDateTime(2n ** 70n, 1, 1, 0, 0, 0, 0, RubyDate.ITALY).jd);
  });

  it("answers sec and hour, so localize resolves it against time.formats", () => {
    const datetime = new RubyDateTime(2008, 3, 1, 6);
    expect("sec" in datetime).toBe(true);
    expect("hour" in datetime).toBe(true);
  });

  it("rolls a 24:00:00 time of day to midnight of the next day, as canon24oc does", () => {
    // ruby 3.3.11:
    //   DateTime.new(2008, 3, 1, 24).to_s               #=> "2008-03-02T00:00:00+00:00"
    //   DateTime.new(2008, 3, 1, 24, 0, 0.5).to_s       #=> "2008-03-02T00:00:00+00:00"
    //   DateTime.new(2008, 3, 1, 24, 0, 0.5).sec_fraction #=> (1/2)
    //   DateTime.new(2008, 3, 1, 24.5).to_s             #=> "2008-03-02T00:30:00+00:00"
    //   DateTime.new(2008, 3, 1, 24, 0, 0, "+09:00").to_s #=> "2008-03-02T00:00:00+09:00"
    //   DateTime.new(2008, 3, 1, 23, 59, 59).to_s       #=> "2008-03-01T23:59:59+00:00"
    expect(new RubyDateTime(2008, 3, 1, 24).toS()).toBe("2008-03-02T00:00:00+00:00");
    expect(new RubyDateTime(2008, 3, 1, 24, 0, 0.5).toS()).toBe("2008-03-02T00:00:00+00:00");
    expect(new RubyDateTime(2008, 3, 1, 24, 0, 0.5).secFraction).toEqual(new Rational(1, 2));
    expect(new RubyDateTime(2008, 3, 1, 24.5).toS()).toBe("2008-03-02T00:30:00+00:00");
    expect(new RubyDateTime(2008, 3, 1, 24, 0, 0, "+09:00").toS()).toBe(
      "2008-03-02T00:00:00+09:00",
    );
    expect(new RubyDateTime(2008, 3, 1, 23, 59, 59).toS()).toBe("2008-03-01T23:59:59+00:00");
  });

  it("formats %Z as the UTC offset, as ::DateTime does", () => {
    expect(new RubyDateTime(2008, 3, 1, 6).strftime("%a, %d %b %Y %H:%M:%S %Z")).toBe(
      "Sat, 01 Mar 2008 06:00:00 +00:00",
    );
  });

  it("answers an ISO 8601 string with the time of day, as dt_lite_to_s does", () => {
    // ruby 3.3.11:
    //   DateTime.new(2008, 3, 1, 6, 0, 0).to_s                  #=> "2008-03-01T06:00:00+00:00"
    //   DateTime.parse("2008-03-01T06:00:00+09:00").to_s        #=> "2008-03-01T06:00:00+09:00"
    //   Date.new(2008, 3, 1).to_s                               #=> "2008-03-01"
    expect(new RubyDateTime(2008, 3, 1, 6, 0, 0).toS()).toBe("2008-03-01T06:00:00+00:00");
    expect(gemDateTime("2008-03-01T06:00:00+09:00").toS()).toBe("2008-03-01T06:00:00+09:00");
    expect(new RubyDate(2008, 3, 1).toS()).toBe("2008-03-01");
  });

  it("carries the offset the parsed string named", () => {
    // ruby 3.3.11:
    //   DateTime.parse("2008-03-01T06:00:00+09:00").zone #=> "+09:00"
    //   ...strftime("%Y-%m-%dT%H:%M:%S %z %:z %::z %:::z %Z")
    //     #=> "2008-03-01T06:00:00 +0900 +09:00 +09:00:00 +09 +09:00"
    const datetime = gemDateTime("2008-03-01T06:00:00+09:00");
    expect(datetime).toBeInstanceOf(RubyDateTime);
    expect(datetime.zone).toBe("+09:00");
    expect(datetime.strftime("%Y-%m-%dT%H:%M:%S %z %:z %::z %:::z %Z")).toBe(
      "2008-03-01T06:00:00 +0900 +09:00 +09:00:00 +09 +09:00",
    );
  });

  it("carries the offset into the default return too, not only the gem-shaped one", () => {
    // ruby 3.3.11:
    //   DateTime.parse("2008-03-01T06:00:00+09:00").to_s   #=> "2008-03-01T06:00:00+09:00"
    //   DateTime.parse("2008-03-01T06:00:00").to_s         #=> "2008-03-01T06:00:00+00:00"
    //   DateTime.strptime("2008-03-01T06:00:00+09:00").to_s
    //     #=> "2008-03-01T06:00:00+09:00"
    const zoned = RubyDateTime.parse("2008-03-01T06:00:00+09:00");
    expect(zoned).toBeInstanceOf(Temporal.ZonedDateTime);
    expect((zoned as Temporal.ZonedDateTime).offset).toBe("+09:00");
    expect(strftime(zoned, "%Y-%m-%dT%H:%M:%S%:z")).toBe("2008-03-01T06:00:00+09:00");

    // A string that named no zone leaves `of` at 0, which is the value
    // `::DateTime` has no zone to spell — a bare PlainDateTime.
    const plain = RubyDateTime.parse("2008-03-01T06:00:00");
    expect(plain).toBeInstanceOf(Temporal.PlainDateTime);
    expect(strftime(plain, "%Y-%m-%dT%H:%M:%S%:z")).toBe("2008-03-01T06:00:00+00:00");

    expect(
      strftime(RubyDateTime.strptime("2008-03-01T06:00:00+09:00"), "%Y-%m-%dT%H:%M:%S%:z"),
    ).toBe("2008-03-01T06:00:00+09:00");
  });

  it("truncates a sub-minute offset in the seat, as of2str's own spelling does", () => {
    // ruby 3.3.11:
    //   Date._parse("2008-03-01T06:00:00-00:44:30")[:offset] #=> -2670
    //   DateTime.parse("2008-03-01T06:00:00-00:44:30").zone  #=> "-00:44"
    // `date_zone_to_diff` (date_parse.c:523-528) keeps the 30 seconds; a
    // Temporal offset time zone is minute-precision and `of2str`
    // (date_core.c:1973-1980) drops them too, so the seat agrees with `#zone`.
    expect(RubyDate._parse("2008-03-01T06:00:00-00:44:30").offset).toBe(-2670);
    expect(gemDateTime("2008-03-01T06:00:00-00:44:30").zone).toBe("-00:44");
    const seat = RubyDateTime.parse("2008-03-01T06:00:00-00:44:30");
    expect(seat).toBeInstanceOf(Temporal.ZonedDateTime);
    expect((seat as Temporal.ZonedDateTime).offset).toBe("-00:44");
    expect((seat as Temporal.ZonedDateTime).toPlainDateTime().toString()).toBe(
      "2008-03-01T06:00:00",
    );
  });

  it("names an instant the truncated offset moves, which the gem-shaped object still holds", () => {
    // ruby 3.3.11:
    //   DateTime.parse("2008-03-01T06:00:00-00:44:30").to_time.to_i #=> 1204353870
    //   #=> 2008-03-01 06:44:30 UTC
    // The seat's zone is minute-precision (`of2str`, date_core.c:1973-1980), so
    // its instant is 06:44:00 UTC — 30 seconds early, the size of the seconds
    // `date_zone_to_diff` (date_parse.c:523-528) kept and Temporal cannot. The
    // exact offset stays reachable on the gem-shaped object, which is where a
    // caller who needs the moment MRI names reads it from.
    const seat = RubyDateTime.parse("2008-03-01T06:00:00-00:44:30") as Temporal.ZonedDateTime;
    expect(Number(seat.epochNanoseconds / 1000000000n)).toBe(1204353870 - 30);

    const gem = gemDateTime("2008-03-01T06:00:00-00:44:30");
    expect(gem.offset.mul(86400).toI()).toBe(-2670);
  });

  it("spells a half-hour and a named zone's offset", () => {
    // ruby 3.3.11:
    //   DateTime.parse("2008-03-01T06:00:00-04:30").zone #=> "-04:30"
    //   DateTime.parse("2008-03-01T06:00:00 EST").zone   #=> "-05:00"
    //   DateTime.parse("2008-03-01T06:00:00+05:45").offset #=> (23/96)
    expect(gemDateTime("2008-03-01T06:00:00-04:30").zone).toBe("-04:30");
    expect(gemDateTime("2008-03-01T06:00:00-04:30").strftime("%z %::z")).toBe("-0430 -04:30:00");
    expect(gemDateTime("2008-03-01T06:00:00 EST").zone).toBe("-05:00");
    expect(gemDateTime("2008-03-01T06:00:00+05:45").offset).toEqual(new Rational(23, 96));
  });

  it("truncates a Rational offset fragment to an int, as NUM2INT does", () => {
    // ruby 3.3.11:
    //   Date._parse("2008-03-01T06:00:00+9.5555")[:offset] #=> (171999/5)
    //   DateTime.parse("2008-03-01T06:00:00+9.5555").offset #=> (34399/86400)
    //   DateTime.parse("2008-03-01T06:00:00+9.5555").zone   #=> "+09:33"
    expect(RubyDate._parse("2008-03-01T06:00:00+9.5555").offset).toEqual(new Rational(171999, 5));
    expect(gemDateTime("2008-03-01T06:00:00+9.5555").offset).toEqual(new Rational(34399, 86400));
    expect(gemDateTime("2008-03-01T06:00:00+9.5555").zone).toBe("+09:33");
  });

  it("defaults to +00:00 when the source named no zone", () => {
    // ruby 3.3.11: DateTime.parse("2008-07-02").strftime("%Y-%m-%dT%H:%M:%S %z")
    //   #=> "2008-07-02T00:00:00 +0000"
    expect(strftime(RubyDateTime.parse("2008-07-02"), "%Y-%m-%dT%H:%M:%S %z")).toBe(
      "2008-07-02T00:00:00 +0000",
    );
    expect(gemDateTime("2008-07-02").zone).toBe("+00:00");
    expect(new RubyDateTime(2008, 3, 1, 6).zone).toBe("+00:00");
  });

  it("rolls a 24:00:00 time of day onto the next day, as jd_local_to_utc does", () => {
    // ruby 3.3.11: d = DateTime.parse("2008-03-01T24:00:00")
    //   [d.year, d.mon, d.mday, d.hour] #=> [2008, 3, 2, 0]
    const datetime = RubyDateTime.parse("2008-03-01T24:00:00");
    expect([datetime.year, datetime.month, datetime.day, datetime.hour]).toEqual([2008, 3, 2, 0]);
    expect(RubyDateTime.parse("2008-03-01T24:00:00+09:00").day).toBe(2);
  });

  it("ignores an offset the zone table would not answer, as dt_new_by_frags does", () => {
    // ruby 3.3.11:
    //   Date._parse("2008-03-01T06:00:00+99:00")[:offset] #=> nil
    //   DateTime.parse("2008-03-01T06:00:00+99:00").zone   #=> "+00:00"
    expect(RubyDate._parse("2008-03-01T06:00:00+99:00").offset).toBeNull();
    expect(gemDateTime("2008-03-01T06:00:00+99:00").zone).toBe("+00:00");
    expect(dtNewByFrags({ year: 2008, mon: 3, mday: 1, offset: 999999 }).zone).toBe("+00:00");
  });

  it("reads the offset argument as a day fraction, as val2off does", () => {
    // Every row transcribed from ruby 3.3.11, e.g.
    //   DateTime.new(2000,1,1,0,0,0, 1).zone        #=> "+24:00"   (1 day)
    //   DateTime.new(2000,1,1,0,0,0, 9).zone        #=> "+00:00"   (rejected)
    //   DateTime.new(2000,1,1,0,0,0, "+09:00").zone #=> "+09:00"
    for (const [offset, zone] of [
      // The Fixnum arm (date_core.c:2376-2385) takes only -1, 0 and 1.
      [1, "+24:00"],
      [-1, "-24:00"],
      [0, "+00:00"],
      [9, "+00:00"],
      [24, "+00:00"],
      [-5, "+00:00"],
      // The Float arm (:2386-2397), bounded at ±DAY_IN_SECONDS. `1.0` is `1`
      // in JS, so it lands on the Fixnum arm — which answers the same second.
      [0.5, "+12:00"],
      [-0.5, "-12:00"],
      [1.0, "+24:00"],
      // The String arm (:2435-2449), through date_zone_to_diff.
      ["+09:00", "+09:00"],
      ["+05:45", "+05:45"],
      ["JST", "+09:00"],
      ["nonsense", "+00:00"],
      ["+99:00", "+00:00"],
    ] as const) {
      expect(new RubyDateTime(2000, 1, 1, 0, 0, 0, offset).zone).toBe(zone);
    }
    // The Rational arm (:2398-2434). A day_to_sec whose denominator reduces to
    // 1 is taken as-is and never bounds-checked (:2421-2422), which is why two
    // whole days east is accepted where the integer `2` is rejected.
    for (const [num, den, zone] of [
      [1, 2, "+12:00"],
      [-1, 2, "-12:00"],
      [1, 3, "+08:00"],
      [3, 2, "+36:00"],
      [2, 1, "+48:00"],
      [5, 1, "+120:00"],
    ] as const) {
      expect(new RubyDateTime(2000, 1, 1, 0, 0, 0, new Rational(num, den)).zone).toBe(zone);
    }
  });

  it("raises Date::Error on a string naming no date, as dt_new_by_frags does", () => {
    // ruby 3.3.11: DateTime.parse("not a date") #=> Date::Error: invalid date
    expect(() => RubyDateTime.parse("not a date")).toThrow("invalid date");
  });

  it("keeps a constructed fractional second, so %N and %L answer real digits", () => {
    // ruby 3.3.11:
    //   d = DateTime.new(2008, 3, 1, 6, 0, Rational(1, 2))
    //   d.strftime("%N")  #=> "500000000"
    //   d.strftime("%L")  #=> "500"
    //   d.sec_fraction    #=> (1/2)
    //   d.sec             #=> 0
    const datetime = new RubyDateTime(2008, 3, 1, 6, 0, 0.5);
    expect(datetime.strftime("%N")).toBe("500000000");
    expect(datetime.strftime("%L")).toBe("500");
    expect(datetime.secFraction).toEqual(new Rational(1, 2));
    expect(datetime.sec).toBe(0);
    // ruby 3.3.11: DateTime.new(2008, 3, 1, 6, 0, 1.5).sec #=> 1
    expect(new RubyDateTime(2008, 3, 1, 6, 0, 1.5).sec).toBe(1);
  });

  it("keeps a parsed fractional second across the offset conversion", () => {
    // ruby 3.3.11:
    //   d = DateTime.parse("2008-03-01T06:00:00.123456789+09:00")
    //   d.strftime("%N") #=> "123456789"
    //   d.sec_fraction   #=> (123456789/1000000000)
    const datetime = gemDateTime("2008-03-01T06:00:00.123456789+09:00");
    expect(datetime.strftime("%N")).toBe("123456789");
    expect(datetime.secFraction).toEqual(new Rational(123456789, 1000000000));
    // ruby 3.3.11:
    //   DateTime.parse("2008-03-01T06:00:00.9999999999").strftime("%N")
    //     #=> "999999999"   (sf is (9999999999/10000000000); %N truncates)
    expect(strftime(RubyDateTime.parse("2008-03-01T06:00:00.9999999999"), "%N")).toBe("999999999");
  });

  it("rounds the fractional second to a nanosecond, where Time#nsec truncates", () => {
    // ruby 3.3.11 — d_lite_plus's T_FLOAT arm rounds (date_core.c:6097):
    //   DateTime.new(2008, 3, 1, 6, 0, 0.3).strftime("%N")          #=> "300000000"
    //   DateTime.new(2008, 3, 1, 6, 0, 0.1234567895).strftime("%N") #=> "123456790"
    //   DateTime.new(2008, 3, 1, 6, 0, 6.1234567891).strftime("%N") #=> "123456789"
    //   DateTime.new(2008, 3, 1, 6, 0, 0.000000001).strftime("%N")  #=> "000000001"
    // where Time.utc(2008, 3, 1, 6, 0, 0.3).nsec #=> 299999999
    expect(new RubyDateTime(2008, 3, 1, 6, 0, 0.3).strftime("%N")).toBe("300000000");
    expect(new RubyDateTime(2008, 3, 1, 6, 0, 0.1234567895).strftime("%N")).toBe("123456790");
    expect(new RubyDateTime(2008, 3, 1, 6, 0, 6.1234567891).strftime("%N")).toBe("123456789");
    expect(new RubyDateTime(2008, 3, 1, 6, 0, 0.000000001).strftime("%N")).toBe("000000001");
  });

  it("answers zeros for an integer second, as ::Date does with no time of day", () => {
    // ruby 3.3.11:
    //   DateTime.new(2008, 3, 1, 6, 0, 0).strftime("%N") #=> "000000000"
    //   DateTime.new(2008, 3, 1, 6, 0, 0).sec_fraction   #=> (0/1)
    //   Date.new(2008, 3, 1).strftime("%N")              #=> "000000000"
    expect(new RubyDateTime(2008, 3, 1, 6, 0, 0).strftime("%N")).toBe("000000000");
    expect(new RubyDateTime(2008, 3, 1, 6, 0, 0).secFraction).toEqual(new Rational(0, 1));
    expect(new RubyDate(2008, 3, 1).strftime("%N")).toBe("000000000");
  });

  it("raises Date::Error on a fraction in any but the last argument supplied", () => {
    // ruby 3.3.11 — num2int_with_frac's `argc > n` (date_core.c:3296-3304):
    //   DateTime.new(2008, 3, 1, 6, 0.5, 0) #=> Date::Error: invalid fraction
    //   DateTime.new(2008, 3, 1, 6.5, 0)    #=> Date::Error: invalid fraction
    //   DateTime.new(2008, 3, 1.5, 0)       #=> Date::Error: invalid fraction
    expect(() => new RubyDateTime(2008, 3, 1, 6, 0.5, 0)).toThrow("invalid fraction");
    expect(() => new RubyDateTime(2008, 3, 1, 6.5, 0)).toThrow("invalid fraction");
    expect(() => new RubyDateTime(2008, 3, 1, 6.5, 0, 0)).toThrow("invalid fraction");
    expect(() => new RubyDateTime(2008, 3, 1.5, 0)).toThrow("invalid fraction");
    expect(() => new RubyDateTime(2008, 3, 1.5, 6)).toThrow("invalid fraction");
    // The second's bound is `positive_inf`, so a later argument never makes its
    // fraction illegal:
    //   DateTime.new(2008, 3, 1, 6, 0, 0.5, 3600).sec_fraction #=> (1/2)
    expect(new RubyDateTime(2008, 3, 1, 6, 0, 0.5, 3600).secFraction).toEqual(new Rational(1, 2));
  });

  it("counts the offset and the start among the positions the fraction bound reads", () => {
    // ruby 3.3.11 — num2int_with_frac's `argc > n` counts EVERY position, so an
    // offset or a start makes an earlier fraction illegal:
    //   DateTime.new(2008, 3, 1, 6, 0.5, 0, "+09:00")          #=> Date::Error: invalid fraction
    //   DateTime.new(2008, 3, 1, 6, 0.5, 0, 0, Date::ITALY)    #=> Date::Error: invalid fraction
    //   DateTime.new(2008, 3, 1.5, 0, 0, 0, "+09:00")          #=> Date::Error: invalid fraction
    expect(() => new RubyDateTime(2008, 3, 1, 6, 0.5, undefined, "+09:00")).toThrow(
      "invalid fraction",
    );
    expect(
      () => new RubyDateTime(2008, 3, 1, 6, 0.5, undefined, undefined, RubyDate.ITALY),
    ).toThrow("invalid fraction");
    expect(() => new RubyDateTime(2008, 3, 1.5, undefined, undefined, undefined, "+09:00")).toThrow(
      "invalid fraction",
    );
  });

  it("carries the fraction of a legal non-final argument through add_frac", () => {
    // ruby 3.3.11:
    //   DateTime.new(2008, 3, 1, 6, 0.5).to_s   #=> "2008-03-01T06:00:30+00:00"
    //   DateTime.new(2008, 3, 1, 6, 0.5).sec_fraction #=> (0/1)
    //   DateTime.new(2008, 3, 1, 6, 0.25).to_s  #=> "2008-03-01T06:00:15+00:00"
    //   DateTime.new(2008, 3, 1, 6.5).to_s      #=> "2008-03-01T06:30:00+00:00"
    //   DateTime.new(2008, 3, 1, 23.75).to_s    #=> "2008-03-01T23:45:00+00:00"
    //   DateTime.new(2008, 3, 1.5).to_s         #=> "2008-03-01T12:00:00+00:00"
    const halfMinute = new RubyDateTime(2008, 3, 1, 6, 0.5);
    expect(halfMinute.strftime("%H:%M:%S")).toBe("06:00:30");
    expect(halfMinute.secFraction).toEqual(new Rational(0, 1));
    expect(new RubyDateTime(2008, 3, 1, 6, 0.25).strftime("%H:%M:%S")).toBe("06:00:15");
    expect(new RubyDateTime(2008, 3, 1, 6.5).strftime("%H:%M:%S")).toBe("06:30:00");
    expect(new RubyDateTime(2008, 3, 1, 23.75).strftime("%H:%M:%S")).toBe("23:45:00");
    expect(new RubyDateTime(2008, 3, 1.5).strftime("%F %H:%M:%S")).toBe("2008-03-01 12:00:00");
  });

  it("takes the leading digits of the fraction at the width %N and %L are given", () => {
    // ruby 3.3.11 — date_strftime.c:275-315 reads the width off the directive:
    //   d = DateTime.new(2008, 3, 1, 6, 0, Rational(1, 2))
    //   d.strftime("%1N")  #=> "5"
    //   d.strftime("%3N")  #=> "500"
    //   d.strftime("%6N")  #=> "500000"
    //   d.strftime("%9N")  #=> "500000000"
    //   d.strftime("%12N") #=> "500000000000"
    //   d.strftime("%3L")  #=> "500"
    //   d.strftime("%12L") #=> "500000000000"
    const datetime = new RubyDateTime(2008, 3, 1, 6, 0, 0.5);
    expect(datetime.strftime("%1N")).toBe("5");
    expect(datetime.strftime("%3N")).toBe("500");
    expect(datetime.strftime("%6N")).toBe("500000");
    expect(datetime.strftime("%9N")).toBe("500000000");
    expect(datetime.strftime("%12N")).toBe("500000000000");
    expect(datetime.strftime("%3L")).toBe("500");
    expect(datetime.strftime("%12L")).toBe("500000000000");
    // Bare %N and %L keep their nine and three digits.
    // ruby 3.3.11: d.strftime("%N %L") #=> "500000000 500"
    expect(datetime.strftime("%N %L")).toBe("500000000 500");
  });

  it("truncates rather than rounds, so a sub-nanosecond tail survives a wide %N", () => {
    // ruby 3.3.11:
    //   d = DateTime.parse("2008-03-01T06:00:00.9999999999")
    //   d.strftime("%3N")  #=> "999"
    //   d.strftime("%9N")  #=> "999999999"
    //   d.strftime("%12N") #=> "999999999900"
    const datetime = gemDateTime("2008-03-01T06:00:00.9999999999");
    expect(datetime.strftime("%3N")).toBe("999");
    expect(datetime.strftime("%9N")).toBe("999999999");
    expect(datetime.strftime("%12N")).toBe("999999999900");
    //   d.strftime("%15N") #=> "999999999900000"
    //   d.strftime("%20N") #=> "99999999990000000000"
    expect(datetime.strftime("%15N")).toBe("999999999900000");
    expect(datetime.strftime("%20N")).toBe("99999999990000000000");
    // ruby 3.3.11:
    //   DateTime.new(2008, 3, 1, 6, 0, Rational(1, 2)).strftime("%20N")
    //     #=> "50000000000000000000"
    expect(new RubyDateTime(2008, 3, 1, 6, 0, 0.5).strftime("%20N")).toBe("50000000000000000000");
  });

  it("keeps a Rational second exact at any width, as ComplexDateData's sf is", () => {
    // ruby 3.3.11:
    //   d = DateTime.new(2008, 3, 1, 6, 0, Rational(1, 3))
    //   d.to_s           #=> "2008-03-01T06:00:00+00:00"
    //   d.sec            #=> 0
    //   d.sec_fraction   #=> (1/3)
    //   d.strftime("%L")   #=> "333"
    //   d.strftime("%N")   #=> "333333333"
    //   d.strftime("%12N") #=> "333333333333"
    //   d.strftime("%30N") #=> "333333333333333333333333333333"
    const datetime = new RubyDateTime(2008, 3, 1, 6, 0, new Rational(1, 3));
    expect(datetime.toS()).toBe("2008-03-01T06:00:00+00:00");
    expect(datetime.sec).toBe(0);
    expect(datetime.secFraction).toEqual(new Rational(1, 3));
    expect(datetime.strftime("%L")).toBe("333");
    expect(datetime.strftime("%N")).toBe("333333333");
    expect(datetime.strftime("%12N")).toBe("333333333333");
    expect(datetime.strftime("%30N")).toBe("333333333333333333333333333333");
  });

  it("splits a Rational second over one, as d_lite_plus's T_RATIONAL arm does", () => {
    // ruby 3.3.11:
    //   DateTime.new(2008, 3, 1, 6, 0, Rational(3, 2)).to_s #=> "2008-03-01T06:00:01+00:00"
    //   DateTime.new(2008, 3, 1, 6, 0, Rational(3, 2)).sec_fraction #=> (1/2)
    expect(new RubyDateTime(2008, 3, 1, 6, 0, new Rational(3, 2)).toS()).toBe(
      "2008-03-01T06:00:01+00:00",
    );
    expect(new RubyDateTime(2008, 3, 1, 6, 0, new Rational(3, 2)).secFraction).toEqual(
      new Rational(1, 2),
    );
    // ruby 3.3.11: DateTime.new(2008, 3, 1, 6, 0, Rational(2)).sec_fraction #=> (0/1)
    expect(new RubyDateTime(2008, 3, 1, 6, 0, new Rational(2, 1)).sec).toBe(2);
  });

  it("folds 24:00 with a Rational second through canon24oc, as fr2 + 1 day does", () => {
    // ruby 3.3.11:
    //   DateTime.new(2008, 3, 1, 24, 0, Rational(1, 3)).to_s #=> "2008-03-02T00:00:00+00:00"
    //   DateTime.new(2008, 3, 1, 24, 0, Rational(1, 3)).sec_fraction #=> (1/3)
    const datetime = new RubyDateTime(2008, 3, 1, 24, 0, new Rational(1, 3));
    expect(datetime.toS()).toBe("2008-03-02T00:00:00+00:00");
    expect(datetime.secFraction).toEqual(new Rational(1, 3));
  });

  it("raises invalid fraction for a Rational minute behind a second, as num2int_with_frac does", () => {
    // ruby 3.3.11:
    //   DateTime.new(2008, 3, 1, 6, Rational(1, 3), 0) #=> Date::Error: invalid fraction
    expect(() => new RubyDateTime(2008, 3, 1, 6, new Rational(1, 3), 0)).toThrow(
      "invalid fraction",
    );
  });

  it("answers zeros at every width for a ::Date, which has no time of day", () => {
    // ruby 3.3.11:
    //   Date.new(2008, 3, 1).strftime("%3N")  #=> "000"
    //   Date.new(2008, 3, 1).strftime("%12N") #=> "000000000000"
    //   Date.new(2008, 3, 1).strftime("%12L") #=> "000000000000"
    expect(new RubyDate(2008, 3, 1).strftime("%3N")).toBe("000");
    expect(new RubyDate(2008, 3, 1).strftime("%12N")).toBe("000000000000");
    expect(new RubyDate(2008, 3, 1).strftime("%12L")).toBe("000000000000");
  });

  it("builds from a jd, an ordinal, a civil or a commercial date with a time of day and a start", () => {
    // ruby 3.3.11 — DateTime has singleton methods of its own for all four
    // (date_core.c:9971-9975), unlike Date's, which take a time of day, an
    // offset and a trailing start:
    //   DateTime.jd(2451944).to_s                    #=> "2001-02-03T00:00:00+00:00"
    //   DateTime.jd(2451944, 4, 5, 6, "+7").to_s     #=> "2001-02-03T04:05:06+07:00"
    //   DateTime.jd(2299160, 0, 0, 0, 0, Date::GREGORIAN).to_s
    //                                                #=> "1582-10-14T00:00:00+00:00"
    //   DateTime.jd(2299160).to_s                    #=> "1582-10-04T00:00:00+00:00"
    //   DateTime.ordinal(2001, 34, 4, 5, 6, "+7").to_s #=> "2001-02-03T04:05:06+07:00"
    //   DateTime.ordinal(1582, 355, 1, 2, 3, 0, Date::GREGORIAN).to_s
    //                                                #=> "1582-12-21T01:02:03+00:00"
    //   DateTime.civil(2001, 2, 3, 4, 5, 6, "+7").to_s #=> "2001-02-03T04:05:06+07:00"
    //   DateTime.commercial(2001, 5, 6, 4, 5, 6, "+7").to_s
    //                                                #=> "2001-02-03T04:05:06+07:00"
    //   DateTime.commercial(1582, 41, 4, 0, 0, 0, 0, Date::GREGORIAN).to_s
    //                                                #=> "1582-10-14T00:00:00+00:00"
    //   DateTime.commercial(1582, 41, 4).to_s        #=> "1582-10-21T00:00:00+00:00"
    //   DateTime.jd(2451944, 24).to_s                #=> "2001-02-04T00:00:00+00:00"
    //   DateTime.jd(2451944, 0, 0, 0.5).sec_fraction #=> (1/2)
    const iso = (v: Temporal.PlainDateTime | Temporal.ZonedDateTime) =>
      v instanceof Temporal.ZonedDateTime ? v.toString({ timeZoneName: "never" }) : v.toString();

    expect(iso(RubyDateTime.jd(2451944))).toBe("2001-02-03T00:00:00");
    expect(iso(RubyDateTime.jd(2451944, 4, 5, 6, "+7"))).toBe("2001-02-03T04:05:06+07:00");
    expect(iso(RubyDateTime.jd(2299160, 0, 0, 0, 0, RubyDate.GREGORIAN))).toBe(
      "1582-10-14T00:00:00",
    );
    expect(iso(RubyDateTime.jd(2299160))).toBe("1582-10-04T00:00:00");
    expect(iso(RubyDateTime.ordinal(2001, 34, 4, 5, 6, "+7"))).toBe("2001-02-03T04:05:06+07:00");
    expect(iso(RubyDateTime.ordinal(1582, 355, 1, 2, 3, 0, RubyDate.GREGORIAN))).toBe(
      "1582-12-21T01:02:03",
    );
    expect(iso(RubyDateTime.civil(2001, 2, 3, 4, 5, 6, "+7"))).toBe("2001-02-03T04:05:06+07:00");
    expect(iso(RubyDateTime.commercial(2001, 5, 6, 4, 5, 6, "+7"))).toBe(
      "2001-02-03T04:05:06+07:00",
    );
    expect(iso(RubyDateTime.commercial(1582, 41, 4, 0, 0, 0, 0, RubyDate.GREGORIAN))).toBe(
      "1582-10-14T00:00:00",
    );
    expect(iso(RubyDateTime.commercial(1582, 41, 4))).toBe("1582-10-21T00:00:00");

    // `num2num_with_frac` / `num2int_with_frac` (date_core.c:3286-3304): a
    // fraction is legal only in the LAST argument SUPPLIED, and an explicitly
    // passed later zero is supplied.
    //   DateTime.jd(2451944.5).to_s        #=> "2001-02-03T12:00:00+00:00"
    //   DateTime.jd(2451944, 1.5).to_s     #=> "2001-02-03T01:30:00+00:00"
    //   DateTime.jd(2451944, 1.5, 0)       #=> raises Date::Error "invalid fraction"
    //   DateTime.jd(2451944.5, 0)          #=> raises Date::Error "invalid fraction"
    //   DateTime.jd(Rational(1, 2)).to_s   #=> "-4712-01-01T12:00:00+00:00"
    //   DateTime.ordinal(2001, 34.5).to_s  #=> "2001-02-03T12:00:00+00:00"
    //   DateTime.ordinal(2001, 34.5, 0)    #=> raises Date::Error "invalid fraction"
    //   DateTime.commercial(2001, 5, 6.5).to_s #=> "2001-02-03T12:00:00+00:00"
    expect(iso(RubyDateTime.jd(2451944.5))).toBe("2001-02-03T12:00:00");
    expect(iso(RubyDateTime.jd(2451944, 1.5))).toBe("2001-02-03T01:30:00");
    expect(() => RubyDateTime.jd(2451944, 1.5, 0)).toThrow("invalid fraction");
    expect(() => RubyDateTime.jd(2451944.5, 0)).toThrow("invalid fraction");
    // Temporal pads a negative ISO year to six digits where the gem's `to_s`
    // does not; the day and the time of day are the gem's.
    expect(iso(RubyDateTime.jd(new Rational(1, 2)))).toBe("-004712-01-01T12:00:00");
    expect(iso(RubyDateTime.ordinal(2001, 34.5))).toBe("2001-02-03T12:00:00");
    expect(() => RubyDateTime.ordinal(2001, 34.5, 0)).toThrow("invalid fraction");
    expect(iso(RubyDateTime.commercial(2001, 5, 6.5))).toBe("2001-02-03T12:00:00");

    // canon24oc and add_frac, the tail all four share with DateTime.new.
    expect(iso(RubyDateTime.jd(2451944, 24))).toBe("2001-02-04T00:00:00");
    const half = RubyDateTime.jd(2451944, 0, 0, 0.5);
    expect(half).toBeInstanceOf(Temporal.PlainDateTime);
    expect((half as Temporal.PlainDateTime).millisecond).toBe(500);
  });

  it("takes a start argument after the offset, and keeps the time of day across new_start", () => {
    // ruby 3.3.11:
    //   dt = DateTime.new(1582, 10, 10, 6, 30, 0, "+02:00", Date::GREGORIAN)
    //   dt.to_s                       #=> "1582-10-10T06:30:00+02:00"
    //   dt.jd                         #=> 2299156
    //   dt.start                      #=> -Infinity
    //   dt.new_start(Date::ITALY).to_s #=> "1582-09-30T06:30:00+02:00"
    //   DateTime.parse("1582-10-10T06:30:00+02:00", true, Date::GREGORIAN).to_s
    //     #=> "1582-10-10T06:30:00+02:00"
    const dt = new RubyDateTime(1582, 10, 10, 6, 30, 0, "+02:00", RubyDate.GREGORIAN);
    expect(dt.toS()).toBe("1582-10-10T06:30:00+02:00");
    expect(dt.jd).toBe(2299156);
    expect(dt.start).toBe(-Infinity);
    expect(dt.newStart(RubyDate.ITALY).toS()).toBe("1582-09-30T06:30:00+02:00");

    // `m_julian_p` (date_core.c:1683-1703) reads the STORED UTC day, not the
    // local one `jd` answers, so an offset that carries the date across the
    // reform flips the answer while `jd` is the same on both.
    //   DateTime.new(1582, 10, 15, 0, 30, 0, "+02:00").jd       #=> 2299161
    //   DateTime.new(1582, 10, 15, 0, 30, 0, "+02:00").julian?  #=> true
    //   DateTime.new(1582, 10, 15, 23, 30, 0, "-02:00").jd      #=> 2299161
    //   DateTime.new(1582, 10, 15, 23, 30, 0, "-02:00").julian? #=> false
    // `dup_obj` copies the receiver's own class, so the aliases answer a
    // DateTime with its time of day intact:
    //   DateTime.new(1582, 10, 10, 6, 30, 0, "+02:00", Date::GREGORIAN).italy.to_s
    //     #=> "1582-09-30T06:30:00+02:00"
    expect(dt.italy()).toBeInstanceOf(RubyDateTime);
    expect(dt.italy().toS()).toBe("1582-09-30T06:30:00+02:00");

    const east = new RubyDateTime(1582, 10, 15, 0, 30, 0, "+02:00");
    const west = new RubyDateTime(1582, 10, 15, 23, 30, 0, "-02:00");
    expect([east.jd, west.jd]).toEqual([2299161, 2299161]);
    expect([east.isJulian, west.isJulian]).toEqual([true, false]);
    // The `Temporal.ZonedDateTime` seat spells its own zone in brackets after
    // the offset, which the gem's `to_s` has no counterpart for.
    expect(
      RubyDateTime.parse("1582-10-10T06:30:00+02:00", true, RubyDate.GREGORIAN).toString(),
    ).toBe("1582-10-10T06:30:00+02:00[+02:00]");
    expect(() => RubyDateTime.parse("1582-10-10T06:30:00+02:00")).toThrow(RubyDate.Error);
  });

  it("new_offset fills the day and day-fraction in on the proleptic-Gregorian seat", () => {
    // `set_of` (`date_core.c:5890-5897`) runs `get_c_jd` / `get_c_df` before it
    // writes the new offset, because `datetime_initialize`'s proleptic-Gregorian
    // arm (`:7851-7870`) stores the civil triple and the time of day alone.
    //   d = DateTime.new(2001, 2, 3, 4, 5, 6, "-02:00", Date::GREGORIAN)
    //   d.new_offset("+09:00").to_s #=> "2001-02-03T15:05:06+09:00"
    const d = new RubyDateTime(2001, 2, 3, 4, 5, 6, "-02:00", RubyDate.GREGORIAN);
    const shifted = d.newOffset("+09:00");
    expect([shifted.jd, shifted.hour, shifted.min, shifted.sec]).toEqual([2451944, 15, 5, 6]);
  });
});

describe("Time", () => {
  it("formats %Z as UTC, where ::DateTime gives the offset", () => {
    expect(RubyTime.utc(2008, 3, 1, 6, 0).strftime("%a, %d %b %Y %H:%M:%S %Z")).toBe(
      "Sat, 01 Mar 2008 06:00:00 UTC",
    );
  });

  it("picks the meridian off the hour", () => {
    expect(RubyTime.utc(2008, 3, 1, 6, 0).strftime("%p%P")).toBe("AMam");
    expect(RubyTime.utc(2008, 3, 1, 18, 0).strftime("%p%P")).toBe("PMpm");
  });

  it("hands to_datetime's seat the whole second, the sub-second and the offset apart", () => {
    // ruby 3.3.11:
    //   Time.new(2008, 3, 1, 6, 0, 7.456789, 3600).to_datetime.strftime("%H:%M:%S.%9N%:z")
    //     #=> "06:00:07.456788999+01:00"
    //   Time.new(2008, 3, 1, 6, 0, 7.456789, -1800).to_datetime.zone #=> "-00:30"
    // `time_to_datetime` (date_core.c:8901-8935) passes `s`, `sf` in
    // nanoseconds and `of` in SECONDS as three separate fields of
    // `d_complex_new_internal`; folding `s` into `sf` or spelling `of` as a
    // fraction of a day is a lossier hand-over of the same values. A HALF-hour
    // offset is the one that catches the fraction spelling: `Rational(1800,
    // 86400)` and the seconds it came from only agree when nothing rounds.
    const dt = new RubyTime(2008, 3, 1, 6, 0, 7.456789, 3600).toDatetime();
    expect((dt as Temporal.ZonedDateTime).offset).toBe("+01:00");
    expect((dt as Temporal.ZonedDateTime).toPlainDateTime().toString()).toBe(
      "2008-03-01T06:00:07.456788999",
    );

    const west = new RubyTime(2008, 3, 1, 6, 0, 7.456789, -1800).toDatetime();
    expect((west as Temporal.ZonedDateTime).offset).toBe("-00:30");
    expect((west as Temporal.ZonedDateTime).toPlainDateTime().toString()).toBe(
      "2008-03-01T06:00:07.456788999",
    );
  });

  it("rolls a 60th second into the next minute, as ::Time does", () => {
    // ruby 3.3.11:
    //   Time.utc(2015, 6, 30, 23, 59, 60)             #=> 2015-07-01 00:00:00 UTC
    //   Time.utc(2015, 6, 30, 23, 59, 60).sec         #=> 0
    //   Time.utc(2015, 6, 30, 23, 59, 60).strftime("%S") #=> "00"
    //   Time.utc(2015, 6, 30, 23, 59, 60).to_datetime.to_s
    //     #=> "2015-07-01T00:00:00+00:00"
    //   Time.utc(2015, 6, 30, 23, 59, 61)             #=> ArgumentError
    // MRI admits the 60th second and, with no `right/` zoneinfo loaded, rolls
    // it; `Temporal` rejects it in the slot, so the roll is spelled in the
    // constructor. This is what leaves `time_to_datetime`'s `s == 60` fold
    // (`date_core.c:8913-8915`) unreachable on both runtimes.
    const t = RubyTime.utc(2015, 6, 30, 23, 59, 60);
    expect(t.sec).toBe(0);
    expect(t.strftime("%Y-%m-%d %H:%M:%S")).toBe("2015-07-01 00:00:00");
    expect(t.toDatetime().toString()).toBe("2015-07-01T00:00:00");
    expect(() => RubyTime.utc(2015, 6, 30, 23, 59, 61)).toThrow(ArgumentError);
  });

  it("keeps the day the offset carries across midnight", () => {
    // ruby 3.3.11:
    //   Time.new(2008, 3, 1, 23, 30, 0, 3600).to_datetime.to_s  #=> "2008-03-01T23:30:00+01:00"
    //   Time.new(2008, 3, 1, 0, 30, 0, -3600).to_datetime.to_s   #=> "2008-03-01T00:30:00-01:00"
    // The seat stores the day already taken to UTC (`jd_local_to_utc`), so a
    // local time within `of` of a day boundary is where a dropped conversion
    // would show up.
    expect(new RubyTime(2008, 3, 1, 23, 30, 0, 3600).toDatetime().toString()).toBe(
      "2008-03-01T23:30:00+01:00[+01:00]",
    );
    expect(new RubyTime(2008, 3, 1, 0, 30, 0, -3600).toDatetime().toString()).toBe(
      "2008-03-01T00:30:00-01:00[-01:00]",
    );
  });
});

describe("strftime over a Temporal subject", () => {
  const FORMATS = [
    "%Y-%m-%d",
    "%b %d",
    "%B %d, %Y",
    "%a %A",
    "%C",
    "%u %w",
    "%I %k %l",
    "%H:%M:%S",
    "%L %N",
    "%z %:z %::z %Z",
    "%s",
    "%j",
    "%G-W%V-%u",
    "%c",
    "%+",
  ];

  it("formats a PlainDate as the gem-shaped ::Date does", () => {
    const date = RubyDate.parse("2008-07-02");
    const plain = Temporal.PlainDate.from("2008-07-02");
    for (const format of FORMATS) {
      expect(strftime(plain, format)).toBe(strftime(date, format));
    }
    // ::Date is midnight, UTC — `%s` and the zone directives come off that.
    expect(strftime(plain, "%s %z %Z")).toBe("1214956800 +0000 +00:00");
  });

  it("formats a PlainDateTime as the gem-shaped ::DateTime does", () => {
    const datetime = new RubyDateTime(2008, 3, 1, 6, 7, 8);
    const plain = Temporal.PlainDateTime.from("2008-03-01T06:07:08");
    for (const format of FORMATS) {
      expect(strftime(plain, format)).toBe(datetime.strftime(format));
    }
  });

  it("carries a ZonedDateTime's offset into %z, %Z and %s", () => {
    const datetime = gemDateTime("2008-03-01T06:00:00+09:00");
    const zoned = Temporal.ZonedDateTime.from("2008-03-01T06:00:00+09:00[+09:00]");
    for (const format of FORMATS) {
      expect(strftime(zoned, format)).toBe(datetime.strftime(format));
    }
    expect(strftime(zoned, "%z %:z %Z %s")).toBe("+0900 +09:00 +09:00 1204318800");
  });

  it("reads an Instant as UTC", () => {
    const instant = Temporal.Instant.from("2008-03-01T06:00:00Z");
    expect(strftime(instant, "%Y-%m-%dT%H:%M:%S %z %Z %s")).toBe(
      "2008-03-01T06:00:00 +0000 +00:00 1204351200",
    );
  });

  /**
   * `date_strftime` writes every field into the ONE buffer
   * `date_strftime_alloc` sized and gives up against
   * `char *endp = s + maxsize` (date_strftime.c:54, date_core.c:7081-7097), so
   * a format whose fields are individually short still fails once their TOTAL
   * runs past it. Thirteen copies is the smallest count whose precision
   * (100_000) is itself inside `1024 * flen` (= 106_496); twelve copies raise
   * on the precision instead.
   *
   * ruby 3.3.11 -rdate:
   *   Date.new(2001, 2, 3).strftime("%100000Y" * 13) #=> Errno::ERANGE
   */
  it("bounds the accumulated output, not one field, at 1024 * format length", () => {
    const d = Temporal.PlainDate.from("2001-02-03");
    expect(() => strftime(d, "%100000Y".repeat(13))).toThrow(ERANGE);
  });

  /**
   * `date_strftime_alloc` runs a pass at `size` BEFORE testing
   * `size >= 1024 * flen` (date_core.c:7081-7095), so `1024 * flen` is the size
   * the loop gives up AT, not the size it stops growing at: a format needing
   * more than it still answers whenever the next doubling fits. `%6145Y` needs
   * 6145 characters against a `1024 * flen` of 6144, and the pass at 8192
   * produces it.
   *
   * ruby 3.3.11 -rdate:
   *   Date.new(2001, 2, 3).strftime("%6145Y").length #=> 6145
   */
  it("answers a format one doubling past 1024 * format length", () => {
    const d = Temporal.PlainDate.from("2001-02-03");
    expect(strftime(d, "%6145Y")).toHaveLength(6145);
  });

  it("carries a Temporal sub-second into %L and %N", () => {
    const plain = Temporal.PlainDateTime.from("2008-03-01T06:00:00.123456789");
    expect(strftime(plain, "%L %N %6N %12N")).toBe("123 123456789 123456 123456789000");
  });
});

describe("Date::Infinity", () => {
  it("answers false for Date#infinite?", () => {
    expect(new RubyDate(2001, 2, 3).isInfinite()).toBe(false);
  });

  it("reduces its argument to a sign", () => {
    expect(new RubyDate.Infinity().toF()).toBe(Number.POSITIVE_INFINITY);
    expect(new RubyDate.Infinity(-7).toF()).toBe(Number.NEGATIVE_INFINITY);
    expect(new RubyDate.Infinity(0).toF()).toBe(0);
  });

  it("builds from a NaN and stores Ruby's nil, raising per reader off it", () => {
    const nan = new RubyDate.Infinity(Number.NaN);
    expect(() => nan.isInfinite()).toThrow("undefined method 'nonzero?' for nil");
    expect(() => nan.isNan()).toThrow("undefined method 'zero?' for nil");
    expect(() => nan.negate()).toThrow("undefined method '-@' for nil");
    expect(() => nan.identity()).toThrow("undefined method '+@' for nil");
    expect(() => nan.coerce(1)).toThrow("undefined method '-@' for nil");
    expect(() => nan.toF()).toThrow("undefined method '>' for nil");

    expect(nan.compareTo(1000)).toBeNull();
    expect(nan.compareTo(Number.POSITIVE_INFINITY)).toBeNull();
    expect(nan.compareTo(new RubyDate.Infinity())).toBeNull();
    expect(nan.compareTo(new RubyDate.Infinity(Number.NaN))).toBe(0);

    expect(nan.isZero()).toBe(false);
    expect(nan.isFinite()).toBe(false);
    expect(nan.abs().toF()).toBe(Number.POSITIVE_INFINITY);
  });

  it("is neither zero nor finite, and is nan only at sign zero", () => {
    const inf = new RubyDate.Infinity();
    expect(inf.isZero()).toBe(false);
    expect(inf.isFinite()).toBe(false);
    expect(inf.isInfinite()).toBe(1);
    expect(inf.negate().isInfinite()).toBe(-1);
    expect(new RubyDate.Infinity(0).isInfinite()).toBeNull();
    expect(inf.isNan()).toBe(false);
    expect(new RubyDate.Infinity(0).isNan()).toBe(true);
  });

  it("answers a positive infinity for abs, and flips sign for -@ / +@", () => {
    expect(new RubyDate.Infinity(-1).abs().toF()).toBe(Number.POSITIVE_INFINITY);
    expect(new RubyDate.Infinity(1).negate().toF()).toBe(Number.NEGATIVE_INFINITY);
    expect(new RubyDate.Infinity(-1).identity().toF()).toBe(Number.NEGATIVE_INFINITY);
  });

  it("compares against another Infinity, a Float infinity and a Numeric", () => {
    const pos = new RubyDate.Infinity();
    const neg = new RubyDate.Infinity(-1);
    expect(pos.compareTo(neg)).toBe(1);
    expect(neg.compareTo(pos)).toBe(-1);
    expect(pos.compareTo(new RubyDate.Infinity())).toBe(0);

    expect(pos.compareTo(Number.POSITIVE_INFINITY)).toBe(0);
    expect(neg.compareTo(Number.POSITIVE_INFINITY)).toBe(-1);
    expect(pos.compareTo(Number.NEGATIVE_INFINITY)).toBe(1);
    expect(neg.compareTo(Number.NEGATIVE_INFINITY)).toBe(0);

    expect(pos.compareTo(1000)).toBe(1);
    expect(neg.compareTo(new Rational(1, 2))).toBe(-1);
  });

  it("falls back to the other value's coerce, and answers nil without one", () => {
    const coercible = { coerce: () => [-1, 1] as [number, number] };
    expect(new RubyDate.Infinity().compareTo(coercible)).toBe(-1);
    expect(new RubyDate.Infinity().compareTo("foo")).toBeNull();

    const equal = { coerce: () => [1, 1] as [number, number] };
    expect(new RubyDate.Infinity().compareTo(equal)).toBe(0);

    const incomparable = { coerce: () => [Number.NaN, 1] as [number, number] };
    expect(new RubyDate.Infinity().compareTo(incomparable)).toBeNull();

    const bothInfinite = {
      coerce: () => [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY] as [number, number],
    };
    expect(new RubyDate.Infinity().compareTo(bothInfinite)).toBe(0);
  });

  it("coerces a Numeric to the pair Ruby answers, and supers to Numeric#coerce otherwise", () => {
    expect(new RubyDate.Infinity().coerce(1)).toEqual([-1, 1]);
    expect(new RubyDate.Infinity(-1).coerce(new Rational(1, 2))).toEqual([1, -1]);

    expect(new RubyDate.Infinity().coerce("1.5")).toEqual([1.5, Number.POSITIVE_INFINITY]);
    expect(() => new RubyDate.Infinity().coerce("foo")).toThrow('invalid value for Float(): "foo"');
    expect(() => new RubyDate.Infinity().coerce(null)).toThrow("can't convert nil into Float");
    expect(() => new RubyDate.Infinity().coerce(new RubyDate(2001, 2, 3))).toThrow(
      "can't convert Date into Float",
    );
  });
});

describe("Date::Infinity as a Range endpoint", () => {
  it("derives the Comparable operators from its own spaceship", () => {
    const pos = new RubyDate.Infinity();
    const neg = new RubyDate.Infinity(-1);

    expect(pos.greaterThan(1000)).toBe(true);
    expect(pos.greaterThanOrEqual(1000)).toBe(true);
    expect(pos.lessThan(1000)).toBe(false);
    expect(pos.lessThanOrEqual(1000)).toBe(false);
    expect(neg.lessThan(new Rational(1, 2))).toBe(true);
    expect(pos.greaterThan(neg)).toBe(true);
    expect(pos.lessThan(Number.POSITIVE_INFINITY)).toBe(false);
    expect(pos.greaterThanOrEqual(Number.POSITIVE_INFINITY)).toBe(true);
  });

  it("places a value between the two infinities", () => {
    const pos = new RubyDate.Infinity();
    const neg = new RubyDate.Infinity(-1);
    expect(pos.isBetween(neg, pos)).toBe(true);
    expect(neg.isBetween(neg, pos)).toBe(true);
    expect(pos.isBetween(neg, neg)).toBe(false);
  });

  it("equals answers false for an incomparable operand where the operators raise", () => {
    const pos = new RubyDate.Infinity();
    expect(pos.equals(pos)).toBe(true);
    expect(pos.equals(new RubyDate.Infinity())).toBe(true);
    expect(pos.equals(new RubyDate.Infinity(-1))).toBe(false);
    expect(pos.equals("foo")).toBe(false);
    expect(() => pos.lessThan("foo")).toThrow(ArgumentError);
    expect(() => pos.isBetween("foo", pos)).toThrow(
      /comparison of Date::Infinity with String failed/,
    );
  });
});

/**
 * Trails-only: `Init_date_core` registers `date_s_valid_civil_p` and
 * `date_s_gregorian_leap_p` under a second name each (`date_core.c:9659`,
 * `:9676`), and no test in `vendor/date/test/date/` calls either spelling.
 */
describe("Date's second registration names", () => {
  it("valid_date? is valid_civil? — the same C function", () => {
    expect(RubyDate.isValidDate(2001, 2, 3)).toBe(true);
    expect(RubyDate.isValidDate(2001, 2, 29)).toBe(false);
    expect(RubyDate.isValidDate(1582, 10, 5, RubyDate.ITALY)).toBe(false);
    expect(RubyDate.isValidDate(1582, 10, 5, RubyDate.GREGORIAN)).toBe(true);
    expect(RubyDate.isValidDate("2001", 2, 3)).toBe(false);
  });

  it("leap? is gregorian_leap? — the same C function", () => {
    expect(RubyDate.isLeap(2000)).toBe(true);
    expect(RubyDate.isLeap(1900)).toBe(false);
    expect(RubyDate.isLeap(2004)).toBe(true);
    expect(() => RubyDate.isLeap("2000")).toThrow(TypeError);
  });
});

/**
 * Ruby's Rational arithmetic does NOT fold a denominator of one back to an
 * Integer — on ruby 3.3.11 `(Rational(1,2) * 12).class` is `Rational`, `(6/1)`
 * — so `date_core.c`'s `FIXNUM_P` branches see a reducible Rational as a
 * Rational, and only `wholenum_p`, a predicate, tests for the fold. The gem's
 * own tests pass Integers throughout and never pin which arm a Rational takes,
 * which is why these live here.
 */
describe("a reducible Rational operand at the C's Integer branches", () => {
  it("takes d_lite_rshift's f_idiv/f_mod arm, never the FIXNUM_P one", () => {
    // ruby 3.3.11 -rdate:
    //   Date.new(2000,1,31).next_year(Rational(1,2)).to_s #=> "2000-07-31"
    //   (Date.new(2000,1,31) >> Rational(1,2)).to_s       #=> "2000-01-31"
    //   (Date.new(2000,1,31) >> Rational(3,2)).to_s       #=> "2000-02-29"
    //   (Date.new(2000,1,31) >> Rational(23,2)).to_s      #=> "2000-12-31"
    //   Date.new(2000,1,31).next_year(Rational(4,2)).to_s #=> "2002-01-31"
    // 23/2 is the case that pins the arm: FIX2INT truncates the 11.5 months
    // f_mod leaves, which is the else arm's arithmetic and not a Fixnum one.
    expect(new RubyDate(2000, 1, 31).nextYear(new Rational(1, 2)).toS()).toBe("2000-07-31");
    expect(new RubyDate(2000, 1, 31).rshift(new Rational(1, 2)).toS()).toBe("2000-01-31");
    expect(new RubyDate(2000, 1, 31).rshift(new Rational(3, 2)).toS()).toBe("2000-02-29");
    expect(new RubyDate(2000, 1, 31).rshift(new Rational(23, 2)).toS()).toBe("2000-12-31");
    expect(new RubyDate(2000, 1, 31).nextYear(new Rational(4, 2)).toS()).toBe("2002-01-31");
  });

  it("takes d_lite_plus's wholenum_p re-dispatch for a whole Rational", () => {
    // ruby 3.3.11 -rdate: wholenum_p is a predicate over the denominator, so a
    // Rational(2,1) addend re-dispatches through rb_rational_num as the Integer
    // 2 and the sum is a whole day.
    //   (Date.new(2001,1,1) + Rational(2,1)).to_s #=> "2001-01-03"
    //   (Date.new(2001,1,1) + Rational(2,1)).jd   #=> 2451913
    const d = new RubyDate(2001, 1, 1).plus(new Rational(2, 1));
    expect(d.toS()).toBe("2001-01-03");
    expect(d.jd).toBe(2451913);
  });
});

/**
 * Trails-only: `check_limit` measures `RSTRING_LEN(str)` — bytes
 * (`date_core.c:4468-4479`) — and the gem's own tests are all ASCII, where a
 * byte count and a JS UTF-16 code-unit count agree. They diverge on any
 * multi-byte string, both in whether the raise fires and in the number the
 * message reports.
 */
describe("check_limit measures bytes, not UTF-16 code units", () => {
  it("raises for a string whose byte length crosses the limit its length does not", () => {
    // 40 code units, 120 UTF-8 bytes.
    const str = "日".repeat(40);
    expect(str.length).toBe(40);
    expect(() => RubyDate._parse(str, false, { limit: 100 })).toThrow(ArgumentError);
    expect(() => RubyDate._parse(str, false, { limit: 100 })).toThrow(
      "string length (120) exceeds the limit 100",
    );
    expect(() => RubyDate._parse(str, false, { limit: 120 })).not.toThrow();
  });
});

/**
 * Trails-only: `test_dup` (`test/date/test_switch_hitter.rb:611-623`) only ever
 * dups a `Date` and a `DateTime`, so the arm `d_lite_initialize_copy` raises on
 * (`date_core.c:5172-5175`) has no gem test at all.
 */
describe("initialize_copy", () => {
  it("cannot load complex into simple", () => {
    // ruby 3.3.11 -rdate: ::Date allocates simple (date_core.c:9636), so a
    // fractional Date — which d_lite_plus made complex — has nowhere to go.
    //   (Date.new(2001,1,1) + Rational(1,2)).dup
    //   #=> ArgumentError: cannot load complex into simple
    const d = new RubyDate(2001, 1, 1).plus(new Rational(1, 2));
    expect(() => d.dup()).toThrow(ArgumentError);
    expect(() => d.dup()).toThrow("cannot load complex into simple");
  });

  it("refuses a frozen receiver", () => {
    // ruby 3.3.11 -rdate: rb_check_frozen(copy) (date_core.c:5142) —
    //   Date.new(2001,2,3).freeze.send(:initialize_copy, Date.new(2002,1,1))
    //   #=> FrozenError: can't modify frozen Date
    const d = Object.freeze(new RubyDate(2001, 2, 3));
    expect(() => d.initializeCopy(new RubyDate(2002, 1, 1))).toThrow(TypeError);
    expect(() => d.initializeCopy(new RubyDate(2002, 1, 1))).toThrow("can't modify frozen Date");
  });

  it("carries a DateTime's day-fraction, sub-second and offset across", () => {
    // The complex arm's `adat->c = bdat->c` (date_core.c:5176) with values the
    // gem's own test_dup cannot distinguish from zero. ruby 3.3.11 -rdate:
    //   DateTime.new(2001,2,3,4,5,6,"+09:00").dup.offset #=> (3/8)
    const dt = new RubyDateTime(2001, 2, 3, 4, 5, 6, "+09:00").dup();
    expect(dt.toS()).toBe("2001-02-03T04:05:06+09:00");
    expect(dt.offset.toString()).toBe("3/8");
  });

  it("returns the receiver when it is its own source", () => {
    // The C's `copy == date` early return (date_core.c:5144-5145).
    const d = new RubyDate(2001, 2, 3);
    expect(d.initializeCopy(d)).toBe(d);
  });
});
