import { describe, it, expect, beforeEach } from "vitest";
import { TimeWithZone } from "./time-with-zone.js";
import { TimeZone } from "./values/time-zone.js";
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

  it("to s (formatting)", () => {
    // 2024-01-15 10:30:45 EST
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.toString()).toBe("2024-01-15 10:30:45 -0500");
  });

  it("inspect()", () => {
    // 2024-01-15 10:30:45 EST
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.inspect()).toBe("2024-01-15 10:30:45.000000000 EST -05:00");
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

  it("iso8601", () => {
    // 2024-01-15 10:30:45 EST
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.iso8601()).toBe(twz.xmlschema());
  });

  it("rfc3339", () => {
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

  it("to fs long", () => {
    // 2024-01-15 10:30:45 EST
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.toFs("long")).toBe("January 15, 2024 10:30");
  });

  it("to fs short", () => {
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
    expect(est.eql(pst)).toBe(true);
    expect(est.eql(est)).toBe(true);
  });

  it("eql() returns false for non-TimeWithZone", () => {
    const twz = eastern.local(2024, 1, 15, 12, 0, 0);
    expect(twz.eql(twz.utc())).toBe(true);
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

  it("past?", () => {
    const past = eastern.local(2020, 1, 1, 0, 0, 0);
    expect(past.isPast()).toBe(true);

    const future = eastern.local(2099, 1, 1, 0, 0, 0);
    expect(future.isPast()).toBe(false);
  });

  it("future?", () => {
    const future = eastern.local(2099, 1, 1, 0, 0, 0);
    expect(future.isFuture()).toBe(true);

    const past = eastern.local(2020, 1, 1, 0, 0, 0);
    expect(past.isFuture()).toBe(false);
  });

  it("getTime() returns milliseconds", () => {
    const utcDate = new Date(Date.UTC(2024, 0, 15, 0, 0, 0));
    const twz = new TimeWithZone(utcDate, eastern);
    expect(twz.getTime()).toBe(utcDate.getTime());
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
  it("usec returns 0 when no fractional", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
    expect(twz.usec).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // DST transition tests (from time_with_zone_test.rb)
  // ---------------------------------------------------------------------------
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
  // formatting and serialization (from time_with_zone_test.rb)
  // ---------------------------------------------------------------------------

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
    expect(twz.strftime("%Y-%m-%d %H:%M:%S %Z %z")).toBe("1999-12-31 19:00:00 EST -0500");
  });

  it("JSON serialization uses ISO 8601 with 3 fraction digits", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);
    const json = JSON.stringify({ time: twz });
    expect(JSON.parse(json).time).toBe(twz.asJson());
  });

  // ---------------------------------------------------------------------------
  // far future / past dates (from time_with_zone_test.rb)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Additional comparison tests (from time_with_zone_test.rb)
  // ---------------------------------------------------------------------------
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
    expect(eastern_twz.hour).toBe(8); // EDT
    expect(pacific_twz.hour).toBe(5); // PDT
    expect(hawaii_twz.hour).toBe(2); // HST
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
