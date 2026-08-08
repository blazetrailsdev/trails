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
  Rational,
  dNewByFrags,
  dtNewByFrags,
  strftime,
  type DateParts,
} from "./date.js";
import { Time as RubyTime } from "./time.js";

/** The `y-mm-dd` a date names, for a one-line assertion. */
function ymd(date: RubyDate): string {
  return `${date.year}-${String(date.mon).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

describe("Date", () => {
  it("parses a y-m-d string, padded or not", () => {
    for (const str of ["2008-07-02", "2008-7-2"]) {
      const date = RubyDate.parse(str);
      expect([date.year, date.mon, date.day]).toEqual([2008, 7, 2]);
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
      expect([str, date.year, date.mon, date.day]).toEqual([str, 2008, 7, 2]);
    }
  });

  it("reads a two-digit head with a four-digit tail as d/m/y, as s3e does", () => {
    const date = RubyDate.parse("01/01/2012");
    expect([date.year, date.mon, date.day]).toEqual([2012, 1, 1]);
    expect(() => RubyDate.parse("12/13/2012")).toThrow("invalid date");
  });

  it('completes a fragment from today, as "Feb 3rd".to_date does', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2008-08-04T12:00:00Z"));
    try {
      expect(Temporal.Now.plainDateISO("UTC").year).toBe(2008);
      const date = RubyDate.parse("Feb 3rd");
      expect([date.year, date.mon, date.day]).toEqual([2008, 2, 3]);
    } finally {
      vi.useRealTimers();
    }
    const partial = RubyDate.parse("2008/07");
    expect([partial.year, partial.mon, partial.day]).toEqual([2008, 7, 1]);
  });

  it("reads a bare two-digit run as the day of this month, as parse_ddd does", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2008-08-04T12:00:00Z"));
    try {
      const date = RubyDate.parse("02");
      expect([date.year, date.mon, date.day]).toEqual([2008, 8, 2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads a three-digit run as this year's day of the year, as parse_ddd does", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2008-08-04T12:00:00Z"));
    try {
      const date = RubyDate.parse("102");
      expect([date.year, date.mon, date.day]).toEqual([2008, 4, 11]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads a five-digit run as a two-digit year and a day of the year", () => {
    const date = RubyDate.parse("20080");
    expect([date.year, date.mon, date.day]).toEqual([2020, 3, 20]);
  });

  it("reads a seven-digit run as a four-digit year and a day of the year", () => {
    const date = RubyDate.parse("2008070");
    expect([date.year, date.mon, date.day]).toEqual([2008, 3, 10]);
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
    expect([date.year, date.mon, date.day]).toEqual([2008, 3, 10]);
    expect(() => RubyDate.parse("10:30")).toThrow("invalid date");
  });

  it("reads the leftover digits as the missing mday or hour, as parse_frag does", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2008-08-04T12:00:00Z"));
    try {
      for (const str of ["11pm 5", "5 11pm"]) {
        expect(RubyDate._parse(str)).toEqual({ hour: 23, mday: 5 });
        const date = RubyDate.parse(str);
        expect([date.year, date.mon, date.day]).toEqual([2008, 8, 5]);
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
      expect([mday.year, mday.mon, mday.day]).toEqual([2008, 8, 3]);
      const mon = RubyDate.parse("Feb");
      expect([mon.year, mon.mon, mon.day]).toEqual([2008, 2, 1]);
    } finally {
      vi.useRealTimers();
    }
    const year = RubyDate.parse("'01");
    expect([year.year, year.mon, year.day]).toEqual([2001, 1, 1]);
  });

  it("reads the VMS date either way round, as parse_vms does", () => {
    for (const str of ["3-FEB-2001", "FEB-3-2001"]) {
      const date = RubyDate.parse(str);
      expect([str, date.year, date.mon, date.day]).toEqual([str, 2001, 2, 3]);
    }
  });

  it("reads an apostrophized VMS year as the year, as s3e does", () => {
    for (const str of ["'01-FEB-3", "3-FEB-'01"]) {
      const date = RubyDate.parse(str);
      expect([str, date.year, date.mon, date.day]).toEqual([str, 2001, 2, 3]);
    }
  });

  it("reads the era parse_eu and parse_us match, not only the trailing one", () => {
    expect(RubyDate.parse("july 4 1776 b.c.").year).toBe(-1775);
    expect(RubyDate.parse("1 jan 2008 ad").year).toBe(2008);
  });

  it("reads a JIS X 0301 date, as parse_jis does", () => {
    const heisei = RubyDate.parse("H13.02.03");
    expect([heisei.year, heisei.mon, heisei.day]).toEqual([2001, 2, 3]);
    const meiji = RubyDate.parse("M6.5.4");
    expect([meiji.year, meiji.mon, meiji.day]).toEqual([1873, 5, 4]);
  });

  it("reads the ISO spellings parse_iso does not take, as parse_iso2 does", () => {
    const ordinal = RubyDate.parse("2001-034");
    expect([ordinal.year, ordinal.mon, ordinal.day]).toEqual([2001, 2, 3]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2008-08-04T12:00:00Z"));
    try {
      for (const str of ["--0203", "--02-03"]) {
        const date = RubyDate.parse(str);
        expect([str, date.year, date.mon, date.day]).toEqual([str, 2008, 2, 3]);
      }
    } finally {
      vi.useRealTimers();
    }
    expect(RubyDate._parse("2001-W05-6")).toEqual({ cwyear: 2001, cweek: 5, cwday: 6 });
  });

  it("builds a week date from the commercial entry of rt_complete_frags' table", () => {
    const full = RubyDate.parse("2001-W05-6");
    expect([full.year, full.mon, full.day]).toEqual([2001, 2, 3]);
    const comp = RubyDate.parse("01-W05-6");
    expect([comp.year, comp.mon, comp.day]).toEqual([2001, 2, 3]);
    const week = RubyDate.parse("2001-W05");
    expect([week.year, week.mon, week.day]).toEqual([2001, 1, 29]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2008-08-04T12:00:00Z"));
    try {
      const today = RubyDate.parse("-W061");
      expect([today.year, today.mon, today.day]).toEqual([2008, 2, 4]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a week outside the year, as c_valid_commercial_p does", () => {
    expect(() => RubyDate.parse("2001-W54-1")).toThrow("invalid date");
    expect(() => RubyDate.parse("2001-W00-1")).toThrow("invalid date");
    const long = RubyDate.parse("2020-W53-1");
    expect([long.year, long.mon, long.day]).toEqual([2020, 12, 28]);
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
    expect([sun.year, sun.mon, sun.day]).toEqual([2001, 2, 4]);
    const wed = RubyDate.parse("2001-W05 wed");
    expect([wed.year, wed.mon, wed.day]).toEqual([2001, 1, 31]);
    const cwday = RubyDate.parse("2001-W05-6 sun");
    expect([cwday.year, cwday.mon, cwday.day]).toEqual([2001, 2, 3]);
  });

  it("prefers rt_complete_frags' wnum0 entry to the civil one on a year, a wday and a time", () => {
    for (const [str, expected] of [
      ["wed 10:00:00 '01", "2001-01-03"],
      ["'01 00:00:00 mon", "2001-01-01"],
      ["'26 12:00:00 sat", "2026-01-03"],
      ["mon 10:00:00 '90", "1990-01-01"],
    ] as const) {
      const date = RubyDate.parse(str);
      const mon = String(date.mon).padStart(2, "0");
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
      const mon = String(date.mon).padStart(2, "0");
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
    const parsed = RubyDateTime.parse(`2008-03-01T06:00:00.${"1".repeat(20)}`);
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
    expect(RubyDateTime.strptime(str, "%FT%T.%N").strftime("%FT%H:%M:%S.%20N")).toBe(
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
    expect(RubyDate._strptime("1000000000", "%s")).toEqual({ seconds: 1000000000 });
    expect(RubyDate._strptime("-1000000000", "%s")).toEqual({ seconds: -1000000000 });
    expect(RubyDate._strptime("1000000000500", "%Q")).toEqual({ seconds: 1000000000.5 });
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
    expect(RubyDate.parse("2008-07-02").wday).toBe(3);
    expect(RubyDate.parse("2008-07-06").wday).toBe(0);
  });

  it("does not answer sec or hour, so localize resolves it against date.formats", () => {
    const date = RubyDate.parse("2008-07-02");
    expect("sec" in date).toBe(false);
    expect("hour" in date).toBe(false);
  });

  it("formats the strftime directives the date formats use", () => {
    const date = RubyDate.parse("2008-07-02");
    expect(date.strftime("%Y-%m-%d")).toBe("2008-07-02");
    expect(date.strftime("%b %d")).toBe("Jul 02");
    expect(date.strftime("%B %d, %Y")).toBe("July 02, 2008");
    expect(date.strftime("%a %A")).toBe("Wed Wednesday");
  });

  it("formats the strftime directives the conformance mixins use", () => {
    const date = RubyDate.parse("2008-07-02");
    expect(date.strftime("%C")).toBe("20");
    expect(date.strftime("%u %w")).toBe("3 3");
    expect(date.strftime("%I %k %l")).toBe("12  0 12");
    expect(date.strftime("%L %N")).toBe("000 000000000");
    expect(date.strftime("%:z")).toBe("+00:00");
    expect(date.strftime("%n%t")).toBe("\n\t");
  });

  it("computes %s from the receiver's own fields, as date_strftime does", () => {
    expect(RubyDate.parse("2008-07-02").strftime("%s")).toBe("1214956800");
    expect(RubyDate.parse("1969-12-31").strftime("%s")).toBe("-86400");
    expect(new RubyDateTime(2008, 7, 2, 6, 30, 15).strftime("%s")).toBe("1214980215");
  });

  it("strips the padding for the %-d flag and leaves unknown directives alone", () => {
    const date = RubyDate.parse("2008-07-02");
    expect(date.strftime("%-m/%-d")).toBe("7/2");
    expect(date.strftime("%i")).toBe("%i");
  });

  it("formats the composite and week-based directives date_strftime expands", () => {
    // Every expectation is `ruby 3.3.11 -rdate`'s answer for the same receiver.
    const date = RubyDate.parse("2008-07-02");
    const dt = new RubyDateTime(2008, 3, 1, 6, 7, 8.5);
    expect(date.strftime("%T|%R|%r|%X")).toBe("00:00:00|00:00|12:00:00 AM|00:00:00");
    expect(dt.strftime("%T|%R|%r|%X")).toBe("06:07:08|06:07|06:07:08 AM|06:07:08");
    expect(date.strftime("%c")).toBe("Wed Jul  2 00:00:00 2008");
    expect(dt.strftime("%c")).toBe("Sat Mar  1 06:07:08 2008");
    expect(date.strftime("%D|%v")).toBe("07/02/08| 2-JUL-2008");
    expect(dt.strftime("%D|%v")).toBe("03/01/08| 1-MAR-2008");
    expect(date.strftime("%+")).toBe("Wed Jul  2 00:00:00 +00:00 2008");
    expect(date.strftime("%G|%V|%U|%W")).toBe("2008|27|26|26");
    expect(dt.strftime("%G|%V|%U|%W")).toBe("2008|09|08|08");
    // The week-based year runs back into the previous year here.
    expect(RubyDate.parse("2021-01-03").strftime("%U|%W|%V|%G|%g|%y")).toBe("01|00|53|2020|20|21");
    expect(date.strftime("%Q")).toBe("1214956800000");
    expect(dt.strftime("%Q")).toBe("1204351628500");
  });

  it("applies the %^ and %# case flags, as date_strftime does", () => {
    const dt = new RubyDateTime(2008, 3, 1, 6, 7, 8.5);
    expect(dt.strftime("%^a %#a %^P %P %p %#p %^v")).toBe("SAT SAT AM am AM am  1-MAR-2008");
  });

  it("pads and left-strips a composite directive, as the STRFTIME macro does", () => {
    const date = RubyDate.parse("2008-07-02");
    expect(date.strftime("%12T|%-T")).toBe("    00:00:00|00:00:00");
  });

  it("round-trips %T through strptime and strftime", () => {
    const parsed = RubyDateTime.strptime("2008-03-01T06:07:08.5", "%FT%T.%N");
    expect(parsed.strftime("%FT%T.%20N")).toBe("2008-03-01T06:07:08.50000000000000000000");
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

  it("resolves the ordinal and week-date arms", () => {
    expect(RubyDate.parse("2008070").strftime("%Y-%m-%d")).toBe("2008-03-10");
    expect(RubyDate.parse("2001-W05-6").strftime("%Y-%m-%d")).toBe("2001-02-03");
  });

  it("names a day off a Julian day, as date_s_jd does", () => {
    // Every expectation is `ruby 3.3.11 -rdate`'s `Date.jd(jd, Date::GREGORIAN)`
    // — the proleptic Gregorian reading `Temporal.PlainDate` is seated on.
    expect(RubyDate.jd(2440588).toS()).toBe("1970-01-01");
    expect(RubyDate.jd(2299161).toS()).toBe("1582-10-15");
    expect(RubyDate.jd(2299160).toS()).toBe("1582-10-14");
    expect(RubyDate.jd(2299160).yday).toBe(287);
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
  ): [number, number, number] | "E" => {
    try {
      const date = new RubyDate(year, month, day);
      return [date.year, date.mon, date.day];
    } catch {
      return "E";
    }
  };

  it("raises Date::Error on a civil date c_valid_civil_p rejects", () => {
    // Every expectation is `ruby 3.3.11 -rdate`'s `Date.new(y, m, d,
    // Date::GREGORIAN)` — the proleptic Gregorian reading `Temporal.PlainDate`
    // is seated on, where 1500 is not a leap year and no day is deleted.
    expect(() => new RubyDate(2001, 2, 29)).toThrow(RubyDate.Error);
    expect(civilOrError(1581, 12, 31)).toEqual([1581, 12, 31]);
    expect(civilOrError(1582, 10, 10)).toEqual([1582, 10, 10]);
    expect(civilOrError(1500, 2, 29)).toBe("E");
    expect(civilOrError(1900, 2, 29)).toBe("E");
    expect(civilOrError(2000, 2, 29)).toEqual([2000, 2, 29]);
    expect(civilOrError(2100, 2, 29)).toBe("E");
    expect(civilOrError(2100, 2, 28)).toEqual([2100, 2, 28]);
    expect(civilOrError(2001, 13, 1)).toBe("E");
    expect(civilOrError(-4712, 1, 1)).toEqual([-4712, 1, 1]);
  });
});

describe("DateTime", () => {
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
    expect(RubyDateTime.parse("2008-03-01T06:00:00+09:00").toS()).toBe("2008-03-01T06:00:00+09:00");
    expect(new RubyDate(2008, 3, 1).toS()).toBe("2008-03-01");
  });

  it("carries the offset the parsed string named", () => {
    // ruby 3.3.11:
    //   DateTime.parse("2008-03-01T06:00:00+09:00").zone #=> "+09:00"
    //   ...strftime("%Y-%m-%dT%H:%M:%S %z %:z %::z %:::z %Z")
    //     #=> "2008-03-01T06:00:00 +0900 +09:00 +09:00:00 +09 +09:00"
    const datetime = RubyDateTime.parse("2008-03-01T06:00:00+09:00");
    expect(datetime).toBeInstanceOf(RubyDateTime);
    expect(datetime.zone).toBe("+09:00");
    expect(datetime.strftime("%Y-%m-%dT%H:%M:%S %z %:z %::z %:::z %Z")).toBe(
      "2008-03-01T06:00:00 +0900 +09:00 +09:00:00 +09 +09:00",
    );
  });

  it("spells a half-hour and a named zone's offset", () => {
    // ruby 3.3.11:
    //   DateTime.parse("2008-03-01T06:00:00-04:30").zone #=> "-04:30"
    //   DateTime.parse("2008-03-01T06:00:00 EST").zone   #=> "-05:00"
    //   DateTime.parse("2008-03-01T06:00:00+05:45").offset #=> (23/96)
    expect(RubyDateTime.parse("2008-03-01T06:00:00-04:30").zone).toBe("-04:30");
    expect(RubyDateTime.parse("2008-03-01T06:00:00-04:30").strftime("%z %::z")).toBe(
      "-0430 -04:30:00",
    );
    expect(RubyDateTime.parse("2008-03-01T06:00:00 EST").zone).toBe("-05:00");
    expect(RubyDateTime.parse("2008-03-01T06:00:00+05:45").offset).toEqual(new Rational(23, 96));
  });

  it("truncates a Rational offset fragment to an int, as NUM2INT does", () => {
    // ruby 3.3.11:
    //   Date._parse("2008-03-01T06:00:00+9.5555")[:offset] #=> (171999/5)
    //   DateTime.parse("2008-03-01T06:00:00+9.5555").offset #=> (34399/86400)
    //   DateTime.parse("2008-03-01T06:00:00+9.5555").zone   #=> "+09:33"
    expect(RubyDate._parse("2008-03-01T06:00:00+9.5555").offset).toEqual(new Rational(171999, 5));
    expect(RubyDateTime.parse("2008-03-01T06:00:00+9.5555").offset).toEqual(
      new Rational(34399, 86400),
    );
    expect(RubyDateTime.parse("2008-03-01T06:00:00+9.5555").zone).toBe("+09:33");
  });

  it("defaults to +00:00 when the source named no zone", () => {
    // ruby 3.3.11: DateTime.parse("2008-07-02").strftime("%Y-%m-%dT%H:%M:%S %z")
    //   #=> "2008-07-02T00:00:00 +0000"
    expect(RubyDateTime.parse("2008-07-02").strftime("%Y-%m-%dT%H:%M:%S %z")).toBe(
      "2008-07-02T00:00:00 +0000",
    );
    expect(RubyDateTime.parse("2008-07-02").zone).toBe("+00:00");
    expect(new RubyDateTime(2008, 3, 1, 6).zone).toBe("+00:00");
  });

  it("rolls a 24:00:00 time of day onto the next day, as jd_local_to_utc does", () => {
    // ruby 3.3.11: d = DateTime.parse("2008-03-01T24:00:00")
    //   [d.year, d.mon, d.mday, d.hour] #=> [2008, 3, 2, 0]
    const datetime = RubyDateTime.parse("2008-03-01T24:00:00");
    expect([datetime.year, datetime.mon, datetime.day, datetime.hour]).toEqual([2008, 3, 2, 0]);
    expect(RubyDateTime.parse("2008-03-01T24:00:00+09:00").day).toBe(2);
  });

  it("ignores an offset the zone table would not answer, as dt_new_by_frags does", () => {
    // ruby 3.3.11:
    //   Date._parse("2008-03-01T06:00:00+99:00")[:offset] #=> nil
    //   DateTime.parse("2008-03-01T06:00:00+99:00").zone   #=> "+00:00"
    expect(RubyDate._parse("2008-03-01T06:00:00+99:00").offset).toBeNull();
    expect(RubyDateTime.parse("2008-03-01T06:00:00+99:00").zone).toBe("+00:00");
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
    const datetime = RubyDateTime.parse("2008-03-01T06:00:00.123456789+09:00");
    expect(datetime.strftime("%N")).toBe("123456789");
    expect(datetime.secFraction).toEqual(new Rational(123456789, 1000000000));
    // ruby 3.3.11:
    //   DateTime.parse("2008-03-01T06:00:00.9999999999").strftime("%N")
    //     #=> "999999999"   (sf is (9999999999/10000000000); %N truncates)
    expect(RubyDateTime.parse("2008-03-01T06:00:00.9999999999").strftime("%N")).toBe("999999999");
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
    const datetime = RubyDateTime.parse("2008-03-01T06:00:00.9999999999");
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
      expect(strftime(plain, format)).toBe(date.strftime(format));
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
    const datetime = RubyDateTime.parse("2008-03-01T06:00:00+09:00");
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

  it("carries a Temporal sub-second into %L and %N", () => {
    const plain = Temporal.PlainDateTime.from("2008-03-01T06:00:00.123456789");
    expect(strftime(plain, "%L %N %6N %12N")).toBe("123 123456789 123456 123456789000");
  });
});
