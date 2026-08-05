/**
 * Trails-only: Ruby's `::Date` is stdlib, so it has no Rails test to mirror.
 * These cover the members `I18n::Backend::Base#localize` duck-types.
 */

import { Temporal } from "@js-temporal/polyfill";
import { describe, it, expect, vi } from "vitest";
import { ArgumentError, Date as RubyDate, DateTime as RubyDateTime, Rational } from "./date.js";
import { Time as RubyTime } from "./time.js";

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

  it("strips the padding for the %-d flag and leaves unknown directives alone", () => {
    const date = RubyDate.parse("2008-07-02");
    expect(date.strftime("%-m/%-d")).toBe("7/2");
    expect(date.strftime("%Q")).toBe("%Q");
  });

  it("rejects a day the calendar reform deleted, under the default start", () => {
    expect(() => RubyDate.parse("1582-10-10")).toThrow("invalid date");
    expect(RubyDate.parse("1582-10-04").strftime("%Y-%m-%d")).toBe("1582-10-04");
    expect(RubyDate.parse("1582-10-15").strftime("%Y-%m-%d")).toBe("1582-10-15");
  });

  it("takes the reform start as its third argument", () => {
    expect(RubyDate.parse("1582-10-10", true, RubyDate.GREGORIAN).strftime("%Y-%m-%d")).toBe(
      "1582-10-10",
    );
    expect(RubyDate.parse("1582-10-14", true, RubyDate.JULIAN).strftime("%Y-%m-%d")).toBe(
      "1582-10-14",
    );
    expect(() => RubyDate.parse("1752-09-05", true, RubyDate.ENGLAND)).toThrow("invalid date");
    expect(RubyDate.parse("1752-09-05", true, RubyDate.ITALY).strftime("%Y-%m-%d")).toBe(
      "1752-09-05",
    );
  });

  it("finds the first day of a year the reform truncated, rather than assuming 1 January", () => {
    expect(RubyDate.commercial(1582, 41, 1).strftime("%Y-%m-%d")).toBe("1582-10-18");
    expect(RubyDate.commercial(1582, 41, 1, RubyDate.GREGORIAN).strftime("%Y-%m-%d")).toBe(
      "1582-10-11",
    );
    expect(RubyDate.commercial(2001, -1, -1).strftime("%Y-%m-%d")).toBe("2001-12-30");
  });

  it("resolves the ordinal and week-date arms across the reform", () => {
    expect(RubyDate.parse("2008070").strftime("%Y-%m-%d")).toBe("2008-03-10");
    expect(RubyDate.parse("2001-W05-6").strftime("%Y-%m-%d")).toBe("2001-02-03");
  });
});

describe("DateTime", () => {
  it("answers sec and hour, so localize resolves it against time.formats", () => {
    const datetime = new RubyDateTime(2008, 3, 1, 6);
    expect("sec" in datetime).toBe(true);
    expect("hour" in datetime).toBe(true);
  });

  it("formats %Z as the UTC offset, as ::DateTime does", () => {
    expect(new RubyDateTime(2008, 3, 1, 6).strftime("%a, %d %b %Y %H:%M:%S %Z")).toBe(
      "Sat, 01 Mar 2008 06:00:00 +00:00",
    );
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
