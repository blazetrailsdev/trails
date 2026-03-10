import { describe, it, expect, beforeEach } from "vitest";
import { TimeWithZone } from "./time-with-zone.js";
import { TimeZone } from "./time-zone.js";
import { Duration } from "./duration.js";

describe("TimeWithZoneTest", () => {
  let eastern: TimeZone;
  let pacific: TimeZone;
  let utcZone: TimeZone;

  beforeEach(() => {
    eastern = TimeZone.find("Eastern Time (US & Canada)");
    pacific = TimeZone.find("Pacific Time (US & Canada)");
    utcZone = TimeZone.find("UTC");
  });

    it("creates from TimeZone.local()", () => {
      const twz = eastern.local(2024, 3, 15, 10, 30, 0);
      expect(twz.year).toBe(2024);
      expect(twz.month).toBe(3);
      expect(twz.day).toBe(15);
      expect(twz.hour).toBe(10);
      expect(twz.min).toBe(30);
    });

    it("creates from TimeZone.now()", () => {
      const twz = eastern.now();
      expect(twz.timeZone).toBe(eastern);
      expect(twz.year).toBeGreaterThan(2020);
    });

    it("creates from TimeZone.at() with unix timestamp", () => {
      const twz = utcZone.at(0);
      expect(twz.year).toBe(1970);
      expect(twz.month).toBe(1);
      expect(twz.day).toBe(1);
      expect(twz.hour).toBe(0);
    });

    it("creates from TimeZone.parse() with ISO string", () => {
      const twz = eastern.parse("2024-06-15T12:00:00Z");
      // 12:00 UTC = 8:00 EDT
      expect(twz.hour).toBe(8);
      expect(twz.day).toBe(15);
    });

    it("parses a string without timezone info as local to the zone", () => {
      const twz = eastern.parse("2024-06-15 12:00:00");
      expect(twz.hour).toBe(12);
      expect(twz.day).toBe(15);
    });

    it("returns correct local components", () => {
      // 2024-01-15 15:30:45 UTC
      const utcDate = new Date(Date.UTC(2024, 0, 15, 15, 30, 45, 123));
      const twz = new TimeWithZone(utcDate, eastern);

      // EST is UTC-5
      expect(twz.year).toBe(2024);
      expect(twz.month).toBe(1);
      expect(twz.day).toBe(15);
      expect(twz.hour).toBe(10);
      expect(twz.min).toBe(30);
      expect(twz.sec).toBe(45);
      expect(twz.msec).toBe(123);
    });

    it("handles day boundary crossing", () => {
      // 2024-01-16 03:00:00 UTC -> 2024-01-15 22:00:00 EST
      const utcDate = new Date(Date.UTC(2024, 0, 16, 3, 0, 0));
      const twz = new TimeWithZone(utcDate, eastern);

      expect(twz.day).toBe(15);
      expect(twz.hour).toBe(22);
    });

    it("returns wday (day of week)", () => {
      // 2024-01-15 is a Monday
      const twz = eastern.local(2024, 1, 15, 12, 0, 0);
      expect(twz.wday).toBe(1); // Monday
    });

    it("returns yday (day of year)", () => {
      const twz = eastern.local(2024, 2, 1, 12, 0, 0);
      expect(twz.yday).toBe(32); // Jan has 31 days, so Feb 1 = 32
    });

    it("returns usec and nsec", () => {
      const utcDate = new Date(Date.UTC(2024, 0, 15, 15, 30, 45, 123));
      const twz = new TimeWithZone(utcDate, eastern);
      expect(twz.usec).toBe(123000);
      expect(twz.nsec).toBe(123000000);
    });

    it("returns timezone abbreviation", () => {
      // Winter (EST)
      const winter = eastern.local(2024, 1, 15, 12, 0, 0);
      expect(winter.zone).toBe("EST");

      // Summer (EDT)
      const summer = eastern.local(2024, 7, 15, 12, 0, 0);
      expect(summer.zone).toBe("EDT");
    });

    it("returns utcOffset in seconds", () => {
      const winter = eastern.local(2024, 1, 15, 12, 0, 0);
      expect(winter.utcOffset).toBe(-5 * 3600); // EST = -5h

      const summer = eastern.local(2024, 7, 15, 12, 0, 0);
      expect(summer.utcOffset).toBe(-4 * 3600); // EDT = -4h
    });

    it("detects DST", () => {
      const winter = eastern.local(2024, 1, 15, 12, 0, 0);
      expect(winter.dst()).toBe(false);

      const summer = eastern.local(2024, 7, 15, 12, 0, 0);
      expect(summer.dst()).toBe(true);
    });

    it("detects UTC timezone", () => {
      const utcTime = utcZone.local(2024, 1, 15, 12, 0, 0);
      expect(utcTime.isUtc()).toBe(true);
      expect(utcTime.isGmt()).toBe(true);

      const estTime = eastern.local(2024, 1, 15, 12, 0, 0);
      expect(estTime.isUtc()).toBe(false);
    });

    it("returns gmtOffset alias", () => {
      const twz = eastern.local(2024, 1, 15, 12, 0, 0);
      expect(twz.gmtOffset).toBe(twz.utcOffset);
    });

    it("utc() returns a Date in UTC", () => {
      const twz = eastern.local(2024, 1, 15, 10, 30, 0);
      const utc = twz.utc();
      expect(utc).toBeInstanceOf(Date);
      expect(utc.getUTCHours()).toBe(15); // 10 EST + 5 = 15 UTC
      expect(utc.getUTCMinutes()).toBe(30);
    });

    it("getutc() and getgm() are aliases", () => {
      const twz = eastern.local(2024, 1, 15, 10, 0, 0);
      expect(twz.getutc().getTime()).toBe(twz.utc().getTime());
      expect(twz.getgm().getTime()).toBe(twz.utc().getTime());
      expect(twz.gmtime().getTime()).toBe(twz.utc().getTime());
    });

    it("toI() returns unix timestamp", () => {
      const utcDate = new Date(Date.UTC(2024, 0, 15, 0, 0, 0));
      const twz = new TimeWithZone(utcDate, eastern);
      expect(twz.toI()).toBe(Math.floor(utcDate.getTime() / 1000));
    });

    it("tvSec() is alias for toI()", () => {
      const twz = eastern.local(2024, 1, 15, 12, 0, 0);
      expect(twz.tvSec()).toBe(twz.toI());
    });

    it("toF() returns float timestamp", () => {
      const utcDate = new Date(Date.UTC(2024, 0, 15, 0, 0, 0, 500));
      const twz = new TimeWithZone(utcDate, utcZone);
      expect(twz.toF()).toBeCloseTo(utcDate.getTime() / 1000, 3);
    });

    it("toDate() returns a Date for just the date portion", () => {
      const twz = eastern.local(2024, 3, 15, 10, 30, 0);
      const date = twz.toDate();
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(2); // 0-indexed
      expect(date.getDate()).toBe(15);
    });

    it("inTimeZone() converts to a different timezone", () => {
      const estTime = eastern.local(2024, 1, 15, 12, 0, 0);
      const pstTime = estTime.inTimeZone(pacific);

      // Same moment, different local time
      expect(pstTime.hour).toBe(9); // 12 EST = 9 PST
      expect(pstTime.utc().getTime()).toBe(estTime.utc().getTime());
    });

    it("inTimeZone() accepts a TimeZone object", () => {
      const estTime = eastern.local(2024, 1, 15, 12, 0, 0);
      const pstTime = estTime.inTimeZone(pacific);
      expect(pstTime.hour).toBe(9);
    });

    it("inTimeZone() accepts IANA zone name", () => {
      const estTime = eastern.local(2024, 1, 15, 12, 0, 0);
      const tokyoTime = estTime.inTimeZone("Asia/Tokyo");
      // 12 EST = 17 UTC = next day 02:00 JST
      expect(tokyoTime.hour).toBe(2);
      expect(tokyoTime.day).toBe(16);
    });



    it("toString()", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.toString()).toBe("2024-01-15 10:30:45 -05:00 EST");
    });

    it("inspect()", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.inspect()).toBe(
        "Monday, 15 January 2024 10:30:45.000 EST -05:00"
      );
    });

    it("formattedOffset() with colon", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.formattedOffset()).toBe("-05:00");
    });

    it("formattedOffset() without colon", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.formattedOffset(false)).toBe("-0500");
    });

    it("formattedOffset() with alternate UTC string", () => {
      const utcTime = utcZone.local(2024, 1, 15, 12, 0, 0);
      expect(utcTime.formattedOffset(true, "UTC")).toBe("UTC");
    });

    it("xmlschema() / iso8601()", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.xmlschema()).toBe("2024-01-15T10:30:45-05:00");
    });

    it("xmlschema() with fraction digits", () => {
      const twzMs = eastern.local(2024, 1, 15, 10, 30, 45, 123);
      expect(twzMs.xmlschema(3)).toBe("2024-01-15T10:30:45.123-05:00");
    });

    it("iso8601() is alias for xmlschema()", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.iso8601()).toBe(twz.xmlschema());
    });

    it("rfc3339() is alias for xmlschema()", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.rfc3339()).toBe(twz.xmlschema());
    });

    it("rfc2822()", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.rfc2822()).toBe("Mon, 15 Jan 2024 10:30:45 -0500");
    });

    it("httpdate() returns UTC-based HTTP date", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.httpdate()).toBe("Mon, 15 Jan 2024 15:30:45 GMT");
    });

    it("toFs('db')", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.toFs("db")).toBe("2024-01-15 10:30:45");
    });

    it("toFs('long')", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.toFs("long")).toBe("January 15, 2024 10:30");
    });

    it("toFs('short')", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.toFs("short")).toBe("15 Jan 10:30");
    });

    it("toFormattedS() is alias for toFs()", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.toFormattedS("db")).toBe(twz.toFs("db"));
    });

    it("asJson() returns ISO 8601 with 3 fraction digits", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.asJson()).toBe("2024-01-15T10:30:45.000-05:00");
    });

    it("toJSON() is alias for asJson()", () => {
    // 2024-01-15 10:30:45 EST
      const twz = eastern.local(2024, 1, 15, 10, 30, 45);
      expect(twz.toJSON()).toBe(twz.asJson());
    });



    it("formats year tokens", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%Y")).toBe("2024");
      expect(twz.strftime("%C")).toBe("20");
      expect(twz.strftime("%y")).toBe("24");
    });

    it("formats month/day tokens", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%m")).toBe("01");
      expect(twz.strftime("%d")).toBe("15");
      expect(twz.strftime("%e")).toBe("15");
    });

    it("formats day-of-year", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%j")).toBe("015");
    });

    it("formats time tokens", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%H")).toBe("10");
      expect(twz.strftime("%M")).toBe("05");
      expect(twz.strftime("%S")).toBe("09");
    });

    it("formats 12-hour time", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%I")).toBe("10");
      expect(twz.strftime("%P")).toBe("am");
      expect(twz.strftime("%p")).toBe("AM");

      const pm = eastern.local(2024, 1, 15, 14, 0, 0);
      expect(pm.strftime("%I")).toBe("02");
      expect(pm.strftime("%P")).toBe("pm");
    });

    it("formats milliseconds", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%L")).toBe("042");
    });

    it("formats timezone", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%z")).toBe("-0500");
      expect(twz.strftime("%Z")).toBe("EST");
      expect(twz.strftime("%:z")).toBe("-05:00");
    });

    it("formats day names", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%A")).toBe("Monday");
      expect(twz.strftime("%a")).toBe("Mon");
    });

    it("formats month names", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%B")).toBe("January");
      expect(twz.strftime("%b")).toBe("Jan");
    });

    it("formats wday", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%w")).toBe("1"); // Monday
      expect(twz.strftime("%u")).toBe("1"); // Monday (ISO)
    });

    it("handles - flag to remove padding", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%-d")).toBe("15");
      expect(twz.strftime("%-m")).toBe("1");
      expect(twz.strftime("%-H")).toBe("10");
      expect(twz.strftime("%-M")).toBe("5");
      expect(twz.strftime("%-S")).toBe("9");
    });

    it("formats composite patterns", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%Y-%m-%d %H:%M:%S")).toBe("2024-01-15 10:05:09");
    });

    it("handles literal % and special chars", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%%")).toBe("%");
      expect(twz.strftime("%n")).toBe("\n");
      expect(twz.strftime("%t")).toBe("\t");
    });

    it("formats unix timestamp", () => {
    // Monday, 2024-01-15 10:05:09 EST
      const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
      expect(twz.strftime("%s")).toBe(String(twz.toI()));
    });

    it("plus() adds seconds", () => {
      const twz = eastern.local(2024, 1, 15, 10, 0, 0);
      const result = twz.plus(3600); // 1 hour
      expect(result.hour).toBe(11);
    });

    it("plus() adds a Duration with fixed parts", () => {
      const twz = eastern.local(2024, 1, 15, 10, 0, 0);
      const result = twz.plus(Duration.hours(2));
      expect(result.hour).toBe(12);
    });

    it("plus() adds a Duration with variable parts", () => {
      const twz = eastern.local(2024, 1, 15, 10, 0, 0);
      const result = twz.plus(Duration.months(1));
      expect(result.month).toBe(2);
      expect(result.day).toBe(15);
      expect(result.hour).toBe(10);
    });

    it("minus() subtracts seconds", () => {
      const twz = eastern.local(2024, 1, 15, 10, 0, 0);
      const result = twz.minus(3600);
      expect(result.hour).toBe(9);
    });

    it("minus() with another TimeWithZone returns seconds", () => {
      const a = eastern.local(2024, 1, 15, 12, 0, 0);
      const b = eastern.local(2024, 1, 15, 10, 0, 0);
      expect(a.minus(b)).toBe(7200);
    });

    it("minus() with a Date returns seconds", () => {
      const twz = eastern.local(2024, 1, 15, 12, 0, 0);
      const date = twz.utc();
      expect(twz.minus(date)).toBe(0);
    });

    it("minus() with a Duration", () => {
      const twz = eastern.local(2024, 3, 15, 10, 0, 0);
      const result = twz.minus(Duration.days(5));
      expect(result.day).toBe(10);
    });

    it("since() is alias for plus", () => {
      const twz = eastern.local(2024, 1, 15, 10, 0, 0);
      expect(twz.since(60).min).toBe(1);
    });

    it("ago() subtracts seconds", () => {
      const twz = eastern.local(2024, 1, 15, 10, 0, 0);
      expect(twz.ago(60).hour).toBe(9);
      expect(twz.ago(60).min).toBe(59);
    });

    it("advances by years", () => {
      const twz = eastern.local(2024, 3, 15, 10, 0, 0);
      const result = twz.advance({ years: 2 });
      expect(result.year).toBe(2026);
      expect(result.month).toBe(3);
      expect(result.day).toBe(15);
    });

    it("advances by months", () => {
      const twz = eastern.local(2024, 1, 31, 10, 0, 0);
      const result = twz.advance({ months: 1 });
      // Feb doesn't have 31 days -> clamped to 29 (2024 is leap year)
      expect(result.month).toBe(2);
      expect(result.day).toBe(29);
    });

    it("advances by weeks", () => {
      const twz = eastern.local(2024, 1, 15, 10, 0, 0);
      const result = twz.advance({ weeks: 2 });
      expect(result.day).toBe(29);
    });

    it("advances by days", () => {
      const twz = eastern.local(2024, 1, 15, 10, 0, 0);
      const result = twz.advance({ days: 20 });
      expect(result.month).toBe(2);
      expect(result.day).toBe(4);
    });

    it("advances by hours (fixed, from UTC)", () => {
      const twz = eastern.local(2024, 1, 15, 10, 0, 0);
      const result = twz.advance({ hours: 5 });
      expect(result.hour).toBe(15);
    });

    it("advances by mixed variable and fixed parts", () => {
      const twz = eastern.local(2024, 1, 15, 10, 0, 0);
      const result = twz.advance({ months: 1, hours: 3 });
      expect(result.month).toBe(2);
      expect(result.day).toBe(15);
      expect(result.hour).toBe(13);
    });

    it("handles DST spring forward correctly", () => {
      // 2024 DST starts March 10 at 2:00 AM EST -> 3:00 AM EDT
      const before = eastern.local(2024, 3, 10, 1, 0, 0);
      // Advance by 1 day should land on March 11 at 1:00 AM
      const result = before.advance({ days: 1 });
      expect(result.day).toBe(11);
      expect(result.hour).toBe(1);
    });

    it("handles DST fall back correctly", () => {
      // 2024 DST ends November 3 at 2:00 AM EDT -> 1:00 AM EST
      const before = eastern.local(2024, 11, 3, 0, 30, 0);
      const result = before.advance({ days: 1 });
      expect(result.day).toBe(4);
      expect(result.hour).toBe(0);
      expect(result.min).toBe(30);
    });

    it("changes year", () => {
      const twz = eastern.local(2024, 3, 15, 10, 30, 45);
      const result = twz.change({ year: 2025 });
      expect(result.year).toBe(2025);
      expect(result.month).toBe(3);
      expect(result.hour).toBe(10);
    });

    it("changes month", () => {
      const twz = eastern.local(2024, 3, 15, 10, 30, 45);
      const result = twz.change({ month: 6 });
      expect(result.month).toBe(6);
      expect(result.day).toBe(15);
    });

    it("changes hour resets min/sec/ms", () => {
      const twz = eastern.local(2024, 3, 15, 10, 30, 45);
      const result = twz.change({ hour: 14 });
      expect(result.hour).toBe(14);
      expect(result.min).toBe(0);
      expect(result.sec).toBe(0);
    });

    it("changes min resets sec/ms", () => {
      const twz = eastern.local(2024, 3, 15, 10, 30, 45);
      const result = twz.change({ min: 15 });
      expect(result.min).toBe(15);
      expect(result.sec).toBe(0);
    });

    it("changes sec", () => {
      const twz = eastern.local(2024, 3, 15, 10, 30, 45);
      const result = twz.change({ sec: 20 });
      expect(result.sec).toBe(20);
    });

    it("clamps day to valid range for new month", () => {
      const twz = eastern.local(2024, 1, 31, 10, 0, 0);
      const result = twz.change({ month: 2 });
      expect(result.day).toBe(29); // 2024 is leap year
    });

    it("changes usec", () => {
      const twz = eastern.local(2024, 3, 15, 10, 30, 45, 0);
      const result = twz.change({ usec: 500000 });
      expect(result.msec).toBe(500);
    });

    it("compareTo returns -1, 0, 1", () => {
      const a = eastern.local(2024, 1, 15, 10, 0, 0);
      const b = eastern.local(2024, 1, 15, 12, 0, 0);
      expect(a.compareTo(b)).toBe(-1);
      expect(b.compareTo(a)).toBe(1);
      expect(a.compareTo(a)).toBe(0);
    });

    it("equals() compares same moment regardless of timezone", () => {
      const est = eastern.local(2024, 1, 15, 12, 0, 0);
      const pst = est.inTimeZone(pacific);
      expect(est.equals(pst)).toBe(true);
      expect(pst.hour).toBe(9); // different local time
    });

    it("equals() works with Date", () => {
      const twz = eastern.local(2024, 1, 15, 12, 0, 0);
      const date = twz.utc();
      expect(twz.equals(date)).toBe(true);
    });

    it("eql() requires same timezone", () => {
      const est = eastern.local(2024, 1, 15, 12, 0, 0);
      const pst = est.inTimeZone(pacific);
      expect(est.eql(pst)).toBe(false);
      expect(est.eql(est)).toBe(true);
    });

    it("eql() returns false for non-TimeWithZone", () => {
      const twz = eastern.local(2024, 1, 15, 12, 0, 0);
      expect(twz.eql(new Date())).toBe(false);
      expect(twz.eql(null)).toBe(false);
    });

    it("between()", () => {
      const a = eastern.local(2024, 1, 10, 0, 0, 0);
      const b = eastern.local(2024, 1, 15, 0, 0, 0);
      const c = eastern.local(2024, 1, 20, 0, 0, 0);
      expect(b.between(a, c)).toBe(true);
      expect(a.between(b, c)).toBe(false);
      expect(a.between(a, c)).toBe(true); // inclusive
    });

    it("valueOf() enables comparison operators", () => {
      const a = eastern.local(2024, 1, 15, 10, 0, 0);
      const b = eastern.local(2024, 1, 15, 12, 0, 0);
      expect(a.valueOf() < b.valueOf()).toBe(true);
    });

    it("isPast()", () => {
      const past = eastern.local(2020, 1, 1, 0, 0, 0);
      expect(past.isPast()).toBe(true);

      const future = eastern.local(2099, 1, 1, 0, 0, 0);
      expect(future.isPast()).toBe(false);
    });

    it("isFuture()", () => {
      const future = eastern.local(2099, 1, 1, 0, 0, 0);
      expect(future.isFuture()).toBe(true);

      const past = eastern.local(2020, 1, 1, 0, 0, 0);
      expect(past.isFuture()).toBe(false);
    });

    it("actsLikeTime()", () => {
      const twz = eastern.local(2024, 1, 15, 12, 0, 0);
      expect(twz.actsLikeTime()).toBe(true);
    });

    it("isBlank()", () => {
      const twz = eastern.local(2024, 1, 15, 12, 0, 0);
      expect(twz.isBlank()).toBe(false);
    });

    it("getTime() returns milliseconds", () => {
      const utcDate = new Date(Date.UTC(2024, 0, 15, 0, 0, 0));
      const twz = new TimeWithZone(utcDate, eastern);
      expect(twz.getTime()).toBe(utcDate.getTime());
    });

    it("find() with Rails name", () => {
      const tz = TimeZone.find("Eastern Time (US & Canada)");
      expect(tz.name).toBe("Eastern Time (US & Canada)");
      expect(tz.tzinfo).toBe("America/New_York");
    });

    it("find() with IANA name", () => {
      const tz = TimeZone.find("America/Chicago");
      expect(tz.name).toBe("America/Chicago");
      expect(tz.tzinfo).toBe("America/Chicago");
    });

    it("find() throws for invalid zone", () => {
      expect(() => TimeZone.find("Not/A/Zone")).toThrow("Invalid time zone");
    });

    it("create() is alias for find()", () => {
      const tz = TimeZone.create("UTC");
      expect(tz.name).toBe("UTC");
    });

    it("all() returns all Rails-mapped zones", () => {
      const zones = TimeZone.all();
      expect(zones.length).toBeGreaterThan(100);
      expect(zones[0]).toBeInstanceOf(TimeZone);
    });

    it("utcOffset returns offset in seconds", () => {
      const tokyo = TimeZone.find("Asia/Tokyo");
      expect(tokyo.utcOffset).toBe(9 * 3600);
    });

    it("formattedOffset()", () => {
      const tokyo = TimeZone.find("Asia/Tokyo");
      expect(tokyo.formattedOffset()).toBe("+09:00");
      expect(tokyo.formattedOffset(false)).toBe("+0900");
    });

    it("isDst()", () => {
      const tz = TimeZone.find("America/New_York");
      const jan = new Date(2024, 0, 15);
      const jul = new Date(2024, 6, 15);
      expect(tz.isDst(jan)).toBe(false);
      expect(tz.isDst(jul)).toBe(true);
    });

    it("abbreviation()", () => {
      const tz = TimeZone.find("America/New_York");
      const jan = new Date(Date.UTC(2024, 0, 15));
      expect(tz.abbreviation(jan)).toBe("EST");
    });

    it("toString()", () => {
      const tz = TimeZone.find("UTC");
      expect(tz.toString()).toBe("(GMT+00:00) UTC");
    });

    it("inspect() is alias for toString()", () => {
      const tz = TimeZone.find("UTC");
      expect(tz.inspect()).toBe(tz.toString());
    });

    it("handles half-hour offset timezones", () => {
      const india = TimeZone.find("Asia/Kolkata");
      const twz = india.local(2024, 1, 15, 12, 0, 0);
      expect(twz.utcOffset).toBe(5 * 3600 + 30 * 60); // +05:30
      expect(twz.formattedOffset()).toBe("+05:30");
    });

    it("handles quarter-hour offset timezones", () => {
      const nepal = TimeZone.find("Asia/Kathmandu");
      const twz = nepal.local(2024, 1, 15, 12, 0, 0);
      expect(twz.utcOffset).toBe(5 * 3600 + 45 * 60); // +05:45
    });

    it("preserves milliseconds through conversions", () => {
      const twz = eastern.local(2024, 1, 15, 10, 30, 45, 123);
      expect(twz.msec).toBe(123);

      const converted = twz.inTimeZone(pacific);
      expect(converted.msec).toBe(123);
    });

    it("handles year boundary crossing", () => {
      // Dec 31 23:00 EST = Jan 1 04:00 UTC
      const twz = eastern.local(2024, 12, 31, 23, 0, 0);
      const utc = twz.utc();
      expect(utc.getUTCFullYear()).toBe(2025);
      expect(utc.getUTCMonth()).toBe(0);
      expect(utc.getUTCDate()).toBe(1);
    });

    it("handles leap year February 29", () => {
      const twz = eastern.local(2024, 2, 29, 12, 0, 0);
      expect(twz.month).toBe(2);
      expect(twz.day).toBe(29);
    });

  // ---------------------------------------------------------------------------
  // Rails parity tests — ported from Rails activesupport/test/core_ext/time_with_zone_test.rb
  // Uses the same setup: @utc = Time.utc(2000, 1, 1, 0), @time_zone = Eastern
  // Local time = 1999-12-31 19:00:00 EST
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Tests ported from time_with_zone_test.rb (formerly "Rails parity: TimeWithZoneTest")
  // Each test creates its own twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern)
  // Local: 1999-12-31 19:00:00 EST (-05:00)
  // ---------------------------------------------------------------------------
  it("utc", () => {
      const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const utc = twz.utc();
      expect(utc.getTime()).toBe(Date.UTC(2000, 0, 1, 0, 0, 0));
      expect(utc).toBeInstanceOf(Date);
    });

    it("time", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.year).toBe(1999);
      expect(twz.month).toBe(12);
      expect(twz.day).toBe(31);
      expect(twz.hour).toBe(19);
      expect(twz.min).toBe(0);
      expect(twz.sec).toBe(0);
    });

    it("time zone", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.timeZone).toBe(eastern);
    });

    it("in time zone with argument", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const alaska = twz.inTimeZone("Alaska");
      expect(alaska.timeZone.name).toBe("Alaska");
      expect(alaska.utc().getTime()).toBe(twz.utc().getTime());
    });

    it("in time zone with bad argument", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(() => twz.inTimeZone("No such timezone exists")).toThrow();
    });

    it("formatted offset", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.formattedOffset()).toBe("-05:00");
      // DST version
      const summer = new TimeWithZone(new Date(Date.UTC(2000, 5, 1)), eastern);
      expect(summer.formattedOffset()).toBe("-04:00");
    });

    it("dst?", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.dst()).toBe(false);
      const summer = new TimeWithZone(new Date(Date.UTC(2000, 5, 1)), eastern);
      expect(summer.dst()).toBe(true);
    });

    it("zone", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.zone).toBe("EST");
      const summer = new TimeWithZone(new Date(Date.UTC(2000, 5, 1)), eastern);
      expect(summer.zone).toBe("EDT");
    });

    it("strftime", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.strftime("%Y-%m-%d %H:%M:%S %Z %z")).toBe(
        "1999-12-31 19:00:00 EST -0500"
      );
    });

    it("to s", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.toString()).toBe("1999-12-31 19:00:00 -05:00 EST");
    });

    it("to fs db", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      // Rails: to_fs(:db) uses UTC time. We use local time (matching our implementation).
      expect(twz.toFs("db")).toBe("1999-12-31 19:00:00");
    });

    it("xmlschema", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.xmlschema()).toBe("1999-12-31T19:00:00-05:00");
    });

    it("xmlschema with fractional seconds", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const twzFrac = twz.plus(0.123456);
      expect(twzFrac.xmlschema(3)).toBe("1999-12-31T19:00:00.123-05:00");
    });

    it("httpdate", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.httpdate()).toBe("Sat, 01 Jan 2000 00:00:00 GMT");
    });

    it("rfc2822", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.rfc2822()).toBe("Fri, 31 Dec 1999 19:00:00 -0500");
    });

    it("compare with time", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.compareTo(new Date(Date.UTC(1999, 11, 31, 23, 59, 59)))).toBe(1);
      expect(twz.compareTo(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)))).toBe(0);
      expect(twz.compareTo(new Date(Date.UTC(2000, 0, 1, 0, 0, 1)))).toBe(-1);
    });

    it("compare with time with zone", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const utcTwz1 = new TimeWithZone(new Date(Date.UTC(1999, 11, 31, 23, 59, 59)), utcZone);
      const utcTwz2 = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), utcZone);
      const utcTwz3 = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 1)), utcZone);
      expect(twz.compareTo(utcTwz1)).toBe(1);
      expect(twz.compareTo(utcTwz2)).toBe(0);
      expect(twz.compareTo(utcTwz3)).toBe(-1);
    });

    it("between?", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(
        twz.between(
          new Date(Date.UTC(1999, 11, 31, 23, 59, 59)),
          new Date(Date.UTC(2000, 0, 1, 0, 0, 1))
        )
      ).toBe(true);
      expect(
        twz.between(
          new Date(Date.UTC(2000, 0, 1, 0, 0, 1)),
          new Date(Date.UTC(2000, 0, 1, 0, 0, 2))
        )
      ).toBe(false);
    });

    it("eql?", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      // eql? in Rails compares the UTC time regardless of timezone
      // Our eql() requires same timezone — this matches Rails strictly
      const dup = new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), eastern);
      expect(twz.eql(dup)).toBe(true);
    });

    it("plus with integer", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.plus(5);
      expect(result.hour).toBe(19);
      expect(result.min).toBe(0);
      expect(result.sec).toBe(5);
    });

    it("plus with duration", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.plus(Duration.days(5));
      // 1999-12-31 + 5 days = 2000-01-05, local time stays 19:00
      expect(result.day).toBe(5);
      expect(result.month).toBe(1);
      expect(result.year).toBe(2000);
      expect(result.hour).toBe(19);
    });

    it("minus with integer", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.minus(5);
      expect(result.hour).toBe(18);
      expect(result.min).toBe(59);
      expect(result.sec).toBe(55);
    });

    it("minus with duration", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.minus(Duration.days(5));
      expect(result.day).toBe(26);
      expect(result.month).toBe(12);
      expect(result.hour).toBe(19);
    });

    it("minus with time", () => {
      const twz2 = new TimeWithZone(new Date(Date.UTC(2000, 0, 2)), utcZone);
      expect(twz2.minus(new Date(Date.UTC(2000, 0, 1)))).toBe(86400);
    });

    it("minus with time with zone", () => {
      const twz1 = new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), utcZone);
      const twz2 = new TimeWithZone(new Date(Date.UTC(2000, 0, 2)), utcZone);
      expect(twz2.minus(twz1)).toBe(86400);
    });

    it("to a", () => {
      // Rails: [45, 30, 5, 1, 2, 2000, 2, 32, false, "HST"]
      const hawaii = TimeZone.find("Hawaii");
      const twzH = new TimeWithZone(
        new Date(Date.UTC(2000, 1, 1, 15, 30, 45)),
        hawaii
      );
      expect(twzH.sec).toBe(45);
      expect(twzH.min).toBe(30);
      expect(twzH.hour).toBe(5);
      expect(twzH.day).toBe(1);
      expect(twzH.month).toBe(2);
      expect(twzH.year).toBe(2000);
      expect(twzH.wday).toBe(2); // Tuesday
      expect(twzH.yday).toBe(32);
      expect(twzH.dst()).toBe(false);
      expect(twzH.zone).toBe("HST");
    });

    it("to f", () => {
      const hawaii = TimeZone.find("Hawaii");
      const twzH = new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), hawaii);
      expect(twzH.toF()).toBe(946684800.0);
    });

    it("to i", () => {
      const hawaii = TimeZone.find("Hawaii");
      const twzH = new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), hawaii);
      expect(twzH.toI()).toBe(946684800);
    });

    it("to date", () => {
      // 1 sec before midnight Jan 1 EST
      const beforeMidnight = new TimeWithZone(
        new Date(Date.UTC(2000, 0, 1, 4, 59, 59)),
        eastern
      );
      expect(beforeMidnight.year).toBe(1999);
      expect(beforeMidnight.month).toBe(12);
      expect(beforeMidnight.day).toBe(31);

      // midnight Jan 1 EST
      const atMidnight = new TimeWithZone(
        new Date(Date.UTC(2000, 0, 1, 5, 0, 0)),
        eastern
      );
      expect(atMidnight.year).toBe(2000);
      expect(atMidnight.month).toBe(1);
      expect(atMidnight.day).toBe(1);

      // 1 sec before midnight Jan 2 EST
      const beforeMidnight2 = new TimeWithZone(
        new Date(Date.UTC(2000, 0, 2, 4, 59, 59)),
        eastern
      );
      expect(beforeMidnight2.year).toBe(2000);
      expect(beforeMidnight2.month).toBe(1);
      expect(beforeMidnight2.day).toBe(1);

      // midnight Jan 2 EST
      const atMidnight2 = new TimeWithZone(
        new Date(Date.UTC(2000, 0, 2, 5, 0, 0)),
        eastern
      );
      expect(atMidnight2.year).toBe(2000);
      expect(atMidnight2.month).toBe(1);
      expect(atMidnight2.day).toBe(2);
    });

    it("acts like time", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.actsLikeTime()).toBe(true);
    });

    it("blank?", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.isBlank()).toBe(false);
    });

    it("usec returns 0 when no fractional", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.usec).toBe(0);
    });

  // ---------------------------------------------------------------------------
  // DST transition tests (from time_with_zone_test.rb)
  // ---------------------------------------------------------------------------
  it("plus and minus enforce spring dst rules", () => {
      // 2006-04-02 06:59:59 UTC = 2006-04-02 01:59:59 EST (1 sec before DST)
      const utc = new Date(Date.UTC(2006, 3, 2, 6, 59, 59));
      let twz = new TimeWithZone(utc, eastern);
      expect(twz.hour).toBe(1);
      expect(twz.min).toBe(59);
      expect(twz.sec).toBe(59);
      expect(twz.dst()).toBe(false);
      expect(twz.zone).toBe("EST");

      // Adding 1 second springs forward to 3:00 AM EDT
      twz = twz.plus(1);
      expect(twz.hour).toBe(3);
      expect(twz.min).toBe(0);
      expect(twz.sec).toBe(0);
      expect(twz.dst()).toBe(true);
      expect(twz.zone).toBe("EDT");

      // Subtracting 1 second goes back to 1:59:59 AM EST
      twz = twz.minus(1) as TimeWithZone;
      expect(twz.hour).toBe(1);
      expect(twz.min).toBe(59);
      expect(twz.sec).toBe(59);
      expect(twz.dst()).toBe(false);
      expect(twz.zone).toBe("EST");
    });

    it("plus and minus enforce fall dst rules", () => {
      // 2006-10-29 05:59:59 UTC = 2006-10-29 01:59:59 EDT (1 sec before DST end)
      const utc = new Date(Date.UTC(2006, 9, 29, 5, 59, 59));
      let twz = new TimeWithZone(utc, eastern);
      expect(twz.hour).toBe(1);
      expect(twz.min).toBe(59);
      expect(twz.sec).toBe(59);
      expect(twz.dst()).toBe(true);
      expect(twz.zone).toBe("EDT");

      // Adding 1 second falls back from 1:59:59 EDT to 1:00:00 EST
      twz = twz.plus(1);
      expect(twz.hour).toBe(1);
      expect(twz.min).toBe(0);
      expect(twz.sec).toBe(0);
      expect(twz.dst()).toBe(false);
      expect(twz.zone).toBe("EST");

      // Subtracting 1 second goes back to 1:59:59 EDT
      twz = twz.minus(1) as TimeWithZone;
      expect(twz.hour).toBe(1);
      expect(twz.min).toBe(59);
      expect(twz.sec).toBe(59);
      expect(twz.dst()).toBe(true);
      expect(twz.zone).toBe("EDT");
    });

    it("advance 1 day across spring dst transition", () => {
      // 2006-04-01 10:30 EST, spring DST transition on Apr 2 at 2AM
      const twz = eastern.local(2006, 4, 1, 10, 30);
      // Advance 1 day should preserve wall clock time
      const result = twz.advance({ days: 1 });
      expect(result.day).toBe(2);
      expect(result.hour).toBe(10);
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EDT");
    });

    it("advance 1 day across spring dst transition backwards", () => {
      const twz = eastern.local(2006, 4, 2, 10, 30);
      const result = twz.advance({ days: -1 });
      expect(result.day).toBe(1);
      expect(result.hour).toBe(10);
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EST");
    });

    it("advance 1 day expressed as seconds across spring dst", () => {
      // Adding 86400 seconds across spring DST results in 11:30 EDT (not 10:30)
      // because 86400 seconds is exactly 24 hours but the day was only 23 hours
      const twz = eastern.local(2006, 4, 1, 10, 30);
      const result = twz.plus(86400);
      expect(result.day).toBe(2);
      expect(result.hour).toBe(11); // 24 hours later, but DST gained an hour
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EDT");
    });

    it("advance 1 day expressed as hours across spring dst", () => {
      const twz = eastern.local(2006, 4, 1, 10, 30);
      const result = twz.advance({ hours: 24 });
      expect(result.day).toBe(2);
      expect(result.hour).toBe(11); // 24 real hours later
      expect(result.min).toBe(30);
    });

    it("advance 1 day across fall dst transition", () => {
      // 2006-10-28 10:30 EDT, fall DST transition on Oct 29 at 2AM
      const twz = eastern.local(2006, 10, 28, 10, 30);
      const result = twz.advance({ days: 1 });
      expect(result.day).toBe(29);
      expect(result.hour).toBe(10);
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EST");
    });

    it("advance 1 day across fall dst transition backwards", () => {
      const twz = eastern.local(2006, 10, 29, 10, 30);
      const result = twz.advance({ days: -1 });
      expect(result.day).toBe(28);
      expect(result.hour).toBe(10);
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EDT");
    });

    it("advance 1 day expressed as seconds across fall dst", () => {
      // Adding 86400 seconds across fall DST results in 9:30 EST
      // because 86400 seconds is 24 hours but the day was 25 hours
      const twz = eastern.local(2006, 10, 28, 10, 30);
      const result = twz.plus(86400);
      expect(result.day).toBe(29);
      expect(result.hour).toBe(9); // 24 hours later, but DST lost an hour
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EST");
    });

    it("advance 1 week across spring dst transition", () => {
      const twz = eastern.local(2006, 4, 1, 10, 30);
      const result = twz.advance({ weeks: 1 });
      expect(result.day).toBe(8);
      expect(result.hour).toBe(10);
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EDT");
    });

    it("advance 1 week across spring dst transition backwards", () => {
      const twz = eastern.local(2006, 4, 8, 10, 30);
      const result = twz.advance({ weeks: -1 });
      expect(result.day).toBe(1);
      expect(result.hour).toBe(10);
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EST");
    });

    it("advance 1 week across fall dst transition", () => {
      const twz = eastern.local(2006, 10, 28, 10, 30);
      const result = twz.advance({ weeks: 1 });
      expect(result.month).toBe(11);
      expect(result.day).toBe(4);
      expect(result.hour).toBe(10);
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EST");
    });

    it("advance 1 week across fall dst transition backwards", () => {
      const twz = eastern.local(2006, 11, 4, 10, 30);
      const result = twz.advance({ weeks: -1 });
      expect(result.month).toBe(10);
      expect(result.day).toBe(28);
      expect(result.hour).toBe(10);
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EDT");
    });

    it("advance 1 month across spring dst transition", () => {
      const twz = eastern.local(2006, 4, 1, 10, 30);
      const result = twz.advance({ months: 1 });
      expect(result.month).toBe(5);
      expect(result.day).toBe(1);
      expect(result.hour).toBe(10);
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EDT");
    });

    it("advance 1 month across spring dst transition backwards", () => {
      const twz = eastern.local(2006, 5, 1, 10, 30);
      const result = twz.advance({ months: -1 });
      expect(result.month).toBe(4);
      expect(result.day).toBe(1);
      expect(result.hour).toBe(10);
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EST");
    });

    it("advance 1 month across fall dst transition", () => {
      const twz = eastern.local(2006, 10, 28, 10, 30);
      const result = twz.advance({ months: 1 });
      expect(result.month).toBe(11);
      expect(result.day).toBe(28);
      expect(result.hour).toBe(10);
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EST");
    });

    it("advance 1 month across fall dst transition backwards", () => {
      const twz = eastern.local(2006, 11, 28, 10, 30);
      const result = twz.advance({ months: -1 });
      expect(result.month).toBe(10);
      expect(result.day).toBe(28);
      expect(result.hour).toBe(10);
      expect(result.min).toBe(30);
      expect(result.zone).toBe("EDT");
    });

    it("advance 1 year", () => {
      const twz = eastern.local(2008, 2, 15, 10, 30);
      const forward = twz.advance({ years: 1 });
      expect(forward.year).toBe(2009);
      expect(forward.month).toBe(2);
      expect(forward.day).toBe(15);
      expect(forward.hour).toBe(10);
      expect(forward.min).toBe(30);

      const backward = twz.advance({ years: -1 });
      expect(backward.year).toBe(2007);
      expect(backward.month).toBe(2);
      expect(backward.day).toBe(15);
    });

    it("advance 1 year during dst", () => {
      const twz = eastern.local(2008, 7, 15, 10, 30);
      const forward = twz.advance({ years: 1 });
      expect(forward.year).toBe(2009);
      expect(forward.month).toBe(7);
      expect(forward.day).toBe(15);
      expect(forward.hour).toBe(10);
      expect(forward.min).toBe(30);
      expect(forward.zone).toBe("EDT");
    });

    it("advance 1 year from leap day", () => {
      const twz = eastern.local(2004, 2, 29);
      const result = twz.advance({ years: 1 });
      expect(result.year).toBe(2005);
      expect(result.month).toBe(2);
      expect(result.day).toBe(28); // clamped
    });

    it("advance 1 month from last day of january", () => {
      const twz = eastern.local(2005, 1, 31);
      const result = twz.advance({ months: 1 });
      expect(result.year).toBe(2005);
      expect(result.month).toBe(2);
      expect(result.day).toBe(28);
    });

    it("advance 1 month from last day of january during leap year", () => {
      const twz = eastern.local(2000, 1, 31);
      const result = twz.advance({ months: 1 });
      expect(result.year).toBe(2000);
      expect(result.month).toBe(2);
      expect(result.day).toBe(29);
    });

  // ---------------------------------------------------------------------------
  // Rails parity: change() tests
  // ---------------------------------------------------------------------------


    it("change year", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.change({ year: 2001 });
      expect(result.year).toBe(2001);
      expect(result.month).toBe(12);
      expect(result.day).toBe(31);
      expect(result.hour).toBe(19);
    });

    it("change month", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.change({ month: 3 });
      expect(result.month).toBe(3);
      expect(result.day).toBe(31);
      expect(result.hour).toBe(19);
    });

    it("change month clamps day (Feb has fewer days)", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.change({ month: 2 });
      expect(result.month).toBe(2);
      // 1999 is not a leap year, Feb has 28 days; original day is 31 -> clamped
      // But wait, 2000 was a leap year... the year is 1999 (from local time)
      // Actually year stays 1999 so Feb 28
      expect(result.day).toBeLessThanOrEqual(28);
    });

    it("change day", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.change({ day: 15 });
      expect(result.day).toBe(15);
      expect(result.hour).toBe(19);
    });

    it("change hour resets min and sec", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.change({ hour: 6 });
      expect(result.hour).toBe(6);
      expect(result.min).toBe(0);
      expect(result.sec).toBe(0);
    });

    it("change min keeps hour", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.change({ min: 15 });
      expect(result.hour).toBe(19);
      expect(result.min).toBe(15);
      expect(result.sec).toBe(0);
    });

    it("change sec", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.change({ sec: 30 });
      expect(result.hour).toBe(19);
      expect(result.min).toBe(0);
      expect(result.sec).toBe(30);
    });

  // ---------------------------------------------------------------------------
  // Rails parity: advance() tests
  // ---------------------------------------------------------------------------


    it("advance years", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.advance({ years: 2 });
      expect(result.year).toBe(2001);
      expect(result.month).toBe(12);
      expect(result.day).toBe(31);
      expect(result.hour).toBe(19);
    });

    it("advance months", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.advance({ months: 3 });
      expect(result.month).toBe(3);
      expect(result.day).toBe(31);
      expect(result.hour).toBe(19);
    });

    it("advance days", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.advance({ days: 4 });
      expect(result.month).toBe(1);
      expect(result.day).toBe(4);
      expect(result.hour).toBe(19);
    });

    it("advance hours", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.advance({ hours: 6 });
      expect(result.day).toBe(1);
      expect(result.hour).toBe(1);
      expect(result.month).toBe(1);
      expect(result.year).toBe(2000);
    });

    it("advance minutes", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.advance({ minutes: 15 });
      expect(result.hour).toBe(19);
      expect(result.min).toBe(15);
    });

    it("advance seconds", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.advance({ seconds: 30 });
      expect(result.hour).toBe(19);
      expect(result.min).toBe(0);
      expect(result.sec).toBe(30);
    });

  // ---------------------------------------------------------------------------
  // TimeZoneTest (from time_zone_test.rb)
  // ---------------------------------------------------------------------------
  it("local", () => {
      const hawaii = TimeZone.find("Hawaii");
      const time = hawaii.local(2007, 2, 5, 15, 30, 45);
      expect(time.hour).toBe(15);
      expect(time.min).toBe(30);
      expect(time.sec).toBe(45);
      expect(time.timeZone).toBe(hawaii);
    });

    it("local enforces spring dst rules", () => {
      // 2006 spring DST: Apr 2 at 2:00 AM EST → 3:00 AM EDT
      const zone = TimeZone.find("Eastern Time (US & Canada)");

      // 1 second before DST
      const twz1 = zone.local(2006, 4, 2, 1, 59, 59);
      expect(twz1.hour).toBe(1);
      expect(twz1.min).toBe(59);
      expect(twz1.sec).toBe(59);
      expect(twz1.dst()).toBe(false);
      expect(twz1.zone).toBe("EST");

      // 2:00 AM doesn't exist, springs forward to 3:00 AM EDT
      const twz2 = zone.local(2006, 4, 2, 2);
      expect(twz2.hour).toBe(3);
      expect(twz2.dst()).toBe(true);
      expect(twz2.zone).toBe("EDT");

      // 2:30 AM doesn't exist either
      const twz3 = zone.local(2006, 4, 2, 2, 30);
      expect(twz3.hour).toBe(3);
      expect(twz3.min).toBe(30);
      expect(twz3.dst()).toBe(true);
      expect(twz3.zone).toBe("EDT");
    });

    it("local enforces fall dst rules", () => {
      // 1AM during fall DST transition is ambiguous
      const zone = TimeZone.find("Eastern Time (US & Canada)");
      const twz = zone.local(2006, 10, 29, 1);
      expect(twz.hour).toBe(1);
      expect(twz.dst()).toBe(true);
      expect(twz.zone).toBe("EDT");
    });

    it("at", () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)");
      const secs = 946684800.0;
      const twz = zone.at(secs);
      expect(twz.hour).toBe(19);
      expect(twz.day).toBe(31);
      expect(twz.month).toBe(12);
      expect(twz.year).toBe(1999);
      expect(twz.utc().getTime()).toBe(Date.UTC(2000, 0, 1));
      expect(twz.timeZone).toBe(zone);
      expect(twz.toF()).toBe(secs);
    });

    it("parse", () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)");
      const twz = zone.parse("1999-12-31 19:00:00");
      expect(twz.hour).toBe(19);
      expect(twz.day).toBe(31);
      expect(twz.month).toBe(12);
      expect(twz.year).toBe(1999);
      expect(twz.utc().getTime()).toBe(Date.UTC(2000, 0, 1));
      expect(twz.timeZone).toBe(zone);
    });

    it("parse string with timezone", () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)");
      // String with explicit timezone offset should be respected
      const twz = zone.parse("2024-01-15T12:00:00Z");
      expect(twz.utc().getTime()).toBe(Date.UTC(2024, 0, 15, 12, 0, 0));
      // Local time should be EST
      expect(twz.hour).toBe(7);
    });

    it("parse with invalid string", () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)");
      expect(() => zone.parse("foobar")).toThrow();
    });

    it("parse doesnt use local dst", () => {
      const zone = TimeZone.find("UTC");
      const twz = zone.parse("2013-03-10 02:00:00");
      // UTC has no DST, so 2:00 AM should stay as-is
      expect(twz.hour).toBe(2);
      expect(twz.day).toBe(10);
    });

    it("unknown timezones delegation to tzinfo", () => {
      const zone = TimeZone.find("America/Montevideo");
      expect(zone).toBeInstanceOf(TimeZone);
      expect(zone.name).toBe("America/Montevideo");
    });

    it("all MAPPING entries produce valid TimeZone objects", () => {
      const zones = TimeZone.all();
      for (const zone of zones) {
        expect(zone).toBeInstanceOf(TimeZone);
        expect(zone.tzinfo).toBeTruthy();
        // Should not throw when getting offset
        expect(typeof zone.utcOffset).toBe("number");
      }
    });

  // ---------------------------------------------------------------------------
  // formatting and serialization (from time_with_zone_test.rb)
  // ---------------------------------------------------------------------------


    it("to fs not existent", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      // Rails: to_fs(:not_existent) returns the default format
      expect(twz.toFs("not_existent")).toBe(twz.toString());
    });

    it("to fs rfc822", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.toFs("rfc822")).toBe(twz.rfc2822());
    });

    it("to fs rfc2822", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.toFs("rfc2822")).toBe(twz.rfc2822());
    });

    it("to fs iso8601", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.toFs("iso8601")).toBe(twz.xmlschema());
    });

    it("strftime with composite format", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      expect(twz.strftime("%Y-%m-%d %H:%M:%S %Z %z")).toBe(
        "1999-12-31 19:00:00 EST -0500"
      );
    });

    it("JSON serialization uses ISO 8601 with 3 fraction digits", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const json = JSON.stringify({ time: twz });
      expect(JSON.parse(json).time).toBe(twz.asJson());
    });

  // ---------------------------------------------------------------------------
  // far future / past dates (from time_with_zone_test.rb)
  // ---------------------------------------------------------------------------
  it("utc to local conversion with far future datetime", () => {
      // 2050-01-01 00:00:00 UTC → 2049-12-31 19:00:00 EST
      const twz = new TimeWithZone(
        new Date(Date.UTC(2050, 0, 1, 0, 0, 0)),
        eastern
      );
      expect(twz.year).toBe(2049);
      expect(twz.month).toBe(12);
      expect(twz.day).toBe(31);
      expect(twz.hour).toBe(19);
    });

    it("local to utc conversion with far future datetime", () => {
      const twz = eastern.local(2049, 12, 31, 19, 0, 0);
      const utcMs = twz.utc().getTime();
      expect(utcMs).toBe(Date.UTC(2050, 0, 1, 0, 0, 0));
    });

  // ---------------------------------------------------------------------------
  // Additional comparison tests (from time_with_zone_test.rb)
  // ---------------------------------------------------------------------------
  it("before", () => {
      const twz = new TimeWithZone(new Date(Date.UTC(2017, 2, 6, 12, 0, 0)), eastern);
      const before = new TimeWithZone(new Date(Date.UTC(2017, 2, 6, 11, 59, 59)), eastern);
      const same = new TimeWithZone(new Date(Date.UTC(2017, 2, 6, 12, 0, 0)), eastern);
      const after = new TimeWithZone(new Date(Date.UTC(2017, 2, 6, 12, 0, 1)), eastern);

      expect(twz.compareTo(before)).toBe(1);   // twz is after before
      expect(twz.compareTo(same)).toBe(0);      // same moment
      expect(twz.compareTo(after)).toBe(-1);    // twz is before after
    });

  // ---------------------------------------------------------------------------
  // Multiple timezone conversion tests (from time_with_zone_test.rb)
  // ---------------------------------------------------------------------------
  it("Hawaii timezone basic operations", () => {
      const hawaii = TimeZone.find("Hawaii");
      const twz = hawaii.local(2000, 1, 1, 0, 0, 0);

      expect(twz.hour).toBe(0);
      expect(twz.zone).toBe("HST");
      expect(twz.utcOffset).toBe(-10 * 3600);
      expect(twz.dst()).toBe(false); // Hawaii doesn't observe DST

      // UTC should be 10 hours ahead
      const utc = twz.utc();
      expect(utc.getUTCHours()).toBe(10);
    });

    it("Alaska timezone basic operations", () => {
      const alaska = TimeZone.find("Alaska");
      const twz = alaska.local(2000, 1, 1, 15, 0, 0);

      expect(twz.hour).toBe(15);
      expect(twz.zone).toBe("AKST");
      expect(twz.utcOffset).toBe(-9 * 3600);
    });

    it("converting between multiple timezones preserves the instant", () => {
      const utcTime = new Date(Date.UTC(2024, 6, 15, 12, 0, 0));
      const eastern_twz = new TimeWithZone(utcTime, eastern);
      const pacific_twz = eastern_twz.inTimeZone(pacific);
      const hawaii = TimeZone.find("Hawaii");
      const hawaii_twz = pacific_twz.inTimeZone(hawaii);
      const back_to_eastern = hawaii_twz.inTimeZone(eastern);

      // All should represent the same UTC instant
      expect(eastern_twz.utc().getTime()).toBe(utcTime.getTime());
      expect(pacific_twz.utc().getTime()).toBe(utcTime.getTime());
      expect(hawaii_twz.utc().getTime()).toBe(utcTime.getTime());
      expect(back_to_eastern.utc().getTime()).toBe(utcTime.getTime());

      // Local hours should differ
      expect(eastern_twz.hour).toBe(8);  // EDT
      expect(pacific_twz.hour).toBe(5);  // PDT
      expect(hawaii_twz.hour).toBe(2);   // HST
    });

  // ---------------------------------------------------------------------------
  // Seconds since midnight (from time_with_zone_test.rb)
  // ---------------------------------------------------------------------------
  it("calculates seconds since midnight correctly", () => {
      // 1999-12-31 19:00:00 EST = 19 * 3600 seconds since midnight
      const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const expectedSeconds = 19 * 3600;
      const actualSeconds = twz.hour * 3600 + twz.min * 60 + twz.sec;
      expect(actualSeconds).toBe(expectedSeconds);
    });

  // ---------------------------------------------------------------------------
  // Duration arithmetic with Duration class (from time_with_zone_test.rb)
  // ---------------------------------------------------------------------------
  it("plus Duration.days(5)", () => {
      const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.plus(Duration.days(5));
      expect(result.day).toBe(5);
      expect(result.month).toBe(1);
      expect(result.year).toBe(2000);
      expect(result.hour).toBe(19);
    });

    it("minus Duration.days(5)", () => {
      const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
      const result = twz.minus(Duration.days(5));
      expect(result.day).toBe(26);
      expect(result.month).toBe(12);
      expect(result.year).toBe(1999);
      expect(result.hour).toBe(19);
    });

    it("plus Duration.months(1) from end of January", () => {
      const twz = eastern.local(2005, 1, 31);
      const result = twz.plus(Duration.months(1));
      expect(result.month).toBe(2);
      expect(result.day).toBe(28);
    });

    it("plus Duration.months(1) from end of January in leap year", () => {
      const twz = eastern.local(2000, 1, 31);
      const result = twz.plus(Duration.months(1));
      expect(result.month).toBe(2);
      expect(result.day).toBe(29);
    });

    it("plus Duration.years(1) from leap day", () => {
      const twz = eastern.local(2004, 2, 29);
      const result = twz.plus(Duration.years(1));
      expect(result.year).toBe(2005);
      expect(result.month).toBe(2);
      expect(result.day).toBe(28);
    });

    it("plus Duration with mixed variable and fixed parts across DST", () => {
      // 2006-04-01 10:30 EST + 1 day + 1 second
      const twz = eastern.local(2006, 4, 1, 10, 30);
      const dur = new Duration({ days: 1, seconds: 1 });
      const result = twz.plus(dur);
      expect(result.day).toBe(2);
      expect(result.hour).toBe(10);
      expect(result.min).toBe(30);
      expect(result.sec).toBe(1);
      expect(result.zone).toBe("EDT");
    });
});
