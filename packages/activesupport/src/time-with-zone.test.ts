import { describe, it, expect, beforeEach } from "vitest";
import { TimeWithZone } from "./time-with-zone.js";
import { TimeZone } from "./values/time-zone.js";
import { Duration } from "./duration.js";
import { instantFromDate } from "./testing/temporal-helpers.js";
import { Time } from "@blazetrails/date";
import { Temporal } from "@blazetrails/date";
import { inTimeZone } from "./core-ext/string/zones.js";
import { setZone, zone as timeZone } from "./time-zone-config.js";

describe("TimeWithZoneTest", () => {
  let eastern: TimeZone;
  let pacific: TimeZone;
  let utcZone: TimeZone;

  beforeEach(() => {
    eastern = TimeZone.find("Eastern Time (US & Canada)")!;
    pacific = TimeZone.find("Pacific Time (US & Canada)")!;
    utcZone = TimeZone.find("UTC")!;
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
    const twz = eastern.parse("2024-06-15T12:00:00Z")!;
    expect(twz.hour).toBe(8);
    expect(twz.day).toBe(15);
  });

  it("parses a string without timezone info as local to the zone", () => {
    const twz = eastern.parse("2024-06-15 12:00:00")!;
    expect(twz.hour).toBe(12);
    expect(twz.day).toBe(15);
  });

  it("returns correct local components", () => {
    const utcDate = new Date(Date.UTC(2024, 0, 15, 15, 30, 45, 123));
    const twz = new TimeWithZone(instantFromDate(utcDate), eastern);

    expect(twz.year).toBe(2024);
    expect(twz.month).toBe(1);
    expect(twz.day).toBe(15);
    expect(twz.hour).toBe(10);
    expect(twz.min).toBe(30);
    expect(twz.sec).toBe(45);
    expect(twz.msec).toBe(123);
  });

  it("handles day boundary crossing", () => {
    const utcDate = new Date(Date.UTC(2024, 0, 16, 3, 0, 0));
    const twz = new TimeWithZone(instantFromDate(utcDate), eastern);

    expect(twz.day).toBe(15);
    expect(twz.hour).toBe(22);
  });

  it("returns wday (day of week)", () => {
    const twz = eastern.local(2024, 1, 15, 12, 0, 0);
    expect(twz.wday).toBe(1);
  });

  it("returns yday (day of year)", () => {
    const twz = eastern.local(2024, 2, 1, 12, 0, 0);
    expect(twz.yday).toBe(32);
  });

  it("returns timezone abbreviation", () => {
    const winter = eastern.local(2024, 1, 15, 12, 0, 0);
    expect(winter.zone).toBe("EST");

    const summer = eastern.local(2024, 7, 15, 12, 0, 0);
    expect(summer.zone).toBe("EDT");
  });

  it("returns utcOffset in seconds", () => {
    const winter = eastern.local(2024, 1, 15, 12, 0, 0);
    expect(winter.utcOffset).toBe(-5 * 3600);

    const summer = eastern.local(2024, 7, 15, 12, 0, 0);
    expect(summer.utcOffset).toBe(-4 * 3600);
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
    expect(utc).toBeInstanceOf(Time);
    const z = utc.toTime();
    expect(z.hour).toBe(15);
    expect(z.minute).toBe(30);
  });

  it("getutc() and getgm() are aliases", () => {
    const twz = eastern.local(2024, 1, 15, 10, 0, 0);
    expect(twz.getutc().toTime().epochMilliseconds).toBe(twz.utc().toTime().epochMilliseconds);
    expect(twz.getgm().toTime().epochMilliseconds).toBe(twz.utc().toTime().epochMilliseconds);
    expect(twz.gmtime().toTime().epochMilliseconds).toBe(twz.utc().toTime().epochMilliseconds);
  });

  it("toI() returns unix timestamp", () => {
    const utcDate = new Date(Date.UTC(2024, 0, 15, 0, 0, 0));
    const twz = new TimeWithZone(instantFromDate(utcDate), eastern);
    expect(twz.toI()).toBe(Math.floor(utcDate.getTime() / 1000));
  });

  it("tvSec() is alias for toI()", () => {
    const twz = eastern.local(2024, 1, 15, 12, 0, 0);
    expect(twz.tvSec()).toBe(twz.toI());
  });

  it("toF() returns float timestamp", () => {
    const utcDate = new Date(Date.UTC(2024, 0, 15, 0, 0, 0, 500));
    const twz = new TimeWithZone(instantFromDate(utcDate), utcZone);
    expect(twz.toF()).toBeCloseTo(utcDate.getTime() / 1000, 3);
  });

  it("toDate() returns a Date for just the date portion", () => {
    const twz = eastern.local(2024, 3, 15, 10, 30, 0);
    const date = twz.toDate();
    expect(date.year).toBe(2024);
    expect(date.month).toBe(3);
    expect(date.day).toBe(15);
  });

  it("inTimeZone() converts to a different timezone", () => {
    const estTime = eastern.local(2024, 1, 15, 12, 0, 0);
    const pstTime = estTime.inTimeZone(pacific);

    expect(pstTime.hour).toBe(9);
    expect(pstTime.utc().toTime().epochMilliseconds).toBe(estTime.utc().toTime().epochMilliseconds);
  });

  it("inTimeZone() accepts a TimeZone object", () => {
    const estTime = eastern.local(2024, 1, 15, 12, 0, 0);
    const pstTime = estTime.inTimeZone(pacific);
    expect(pstTime.hour).toBe(9);
  });

  it("inTimeZone() accepts IANA zone name", () => {
    const estTime = eastern.local(2024, 1, 15, 12, 0, 0);
    const tokyoTime = estTime.inTimeZone("Asia/Tokyo");
    expect(tokyoTime.hour).toBe(2);
    expect(tokyoTime.day).toBe(16);
  });

  it("to s (formatting)", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.toString()).toBe("2024-01-15 10:30:45 -0500");
  });

  it("inspect()", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.inspect()).toBe("2024-01-15 10:30:45.000000000 EST -05:00");
  });

  it("formattedOffset() with colon", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.formattedOffset()).toBe("-05:00");
  });

  it("formattedOffset() without colon", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.formattedOffset(false)).toBe("-0500");
  });

  it("formattedOffset() with alternate UTC string", () => {
    const utcTime = utcZone.local(2024, 1, 15, 12, 0, 0);
    expect(utcTime.formattedOffset(true, "UTC")).toBe("UTC");
  });

  it("xmlschema() / iso8601()", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.xmlschema()).toBe("2024-01-15T10:30:45-05:00");
  });

  it("xmlschema() with fraction digits", () => {
    const twzMs = eastern.local(2024, 1, 15, 10, 30, 45, 123);
    expect(twzMs.xmlschema(3)).toBe("2024-01-15T10:30:45.123-05:00");
  });

  it("iso8601", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.iso8601()).toBe(twz.xmlschema());
  });

  it("rfc3339", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.rfc3339()).toBe(twz.xmlschema());
  });

  it("rfc2822()", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.rfc2822()).toBe("Mon, 15 Jan 2024 10:30:45 -0500");
  });

  it("httpdate() returns UTC-based HTTP date", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.httpdate()).toBe("Mon, 15 Jan 2024 15:30:45 GMT");
  });

  it("to fs long", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.toFs("long")).toBe("January 15, 2024 10:30");
  });

  it("to fs short", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.toFs("short")).toBe("15 Jan 10:30");
  });

  it("toFormattedS() is alias for toFs()", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.toFormattedS("db")).toBe(twz.toFs("db"));
  });

  it("asJson() returns ISO 8601 with 3 fraction digits", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.asJson()).toBe("2024-01-15T10:30:45.000-05:00");
  });

  it("toJSON() is alias for asJson()", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45);
    expect(twz.toJSON()).toBe(twz.asJson());
  });

  it("formats year tokens", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%Y")).toBe("2024");
    expect(twz.strftime("%C")).toBe("20");
    expect(twz.strftime("%y")).toBe("24");
  });

  it("formats month/day tokens", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%m")).toBe("01");
    expect(twz.strftime("%d")).toBe("15");
    expect(twz.strftime("%e")).toBe("15");
  });

  it("formats day-of-year", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%j")).toBe("015");
  });

  it("formats time tokens", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%H")).toBe("10");
    expect(twz.strftime("%M")).toBe("05");
    expect(twz.strftime("%S")).toBe("09");
  });

  it("formats 12-hour time", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%I")).toBe("10");
    expect(twz.strftime("%P")).toBe("am");
    expect(twz.strftime("%p")).toBe("AM");

    const pm = eastern.local(2024, 1, 15, 14, 0, 0);
    expect(pm.strftime("%I")).toBe("02");
    expect(pm.strftime("%P")).toBe("pm");
  });

  it("formats milliseconds", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%L")).toBe("042");
  });

  it("formats timezone", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%z")).toBe("-0500");
    expect(twz.strftime("%Z")).toBe("EST");
    expect(twz.strftime("%:z")).toBe("-05:00");
  });

  it("formats day names", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%A")).toBe("Monday");
    expect(twz.strftime("%a")).toBe("Mon");
  });

  it("formats month names", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%B")).toBe("January");
    expect(twz.strftime("%b")).toBe("Jan");
  });

  it("formats wday", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%w")).toBe("1");
    expect(twz.strftime("%u")).toBe("1");
  });

  it("handles - flag to remove padding", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%-d")).toBe("15");
    expect(twz.strftime("%-m")).toBe("1");
    expect(twz.strftime("%-H")).toBe("10");
    expect(twz.strftime("%-M")).toBe("5");
    expect(twz.strftime("%-S")).toBe("9");
  });

  it("formats composite patterns", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%Y-%m-%d %H:%M:%S")).toBe("2024-01-15 10:05:09");
  });

  it("handles literal % and special chars", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%%")).toBe("%");
    expect(twz.strftime("%n")).toBe("\n");
    expect(twz.strftime("%t")).toBe("\t");
  });

  it("formats unix timestamp", () => {
    const twz = eastern.local(2024, 1, 15, 10, 5, 9, 42);
    expect(twz.strftime("%s")).toBe(String(twz.toI()));
  });

  it("plus() adds seconds", () => {
    const twz = eastern.local(2024, 1, 15, 10, 0, 0);
    const result = twz.plus(3600);
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
    const date = twz.utc().toTime().toInstant();
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
    const before = eastern.local(2024, 3, 10, 1, 0, 0);
    const result = before.advance({ days: 1 });
    expect(result.day).toBe(11);
    expect(result.hour).toBe(1);
  });

  it("handles DST fall back correctly", () => {
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
    expect(result.day).toBe(29);
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

  it("compareTo distinguishes Temporal.Instant operands at nanosecond precision", () => {
    const baseNs = 1_700_000_000_000_000_000n;
    const earlier = new TimeWithZone(Temporal.Instant.fromEpochNanoseconds(baseNs), eastern);
    const laterByOneNs = Temporal.Instant.fromEpochNanoseconds(baseNs + 1n);
    expect(earlier.compareTo(laterByOneNs)).toBe(-1);
    expect(earlier.compareTo(Temporal.Instant.fromEpochNanoseconds(baseNs))).toBe(0);
  });

  it("minus() preserves nanosecond precision for Temporal.Instant operands", () => {
    const baseNs = 1_700_000_000_000_000_000n;
    const a = new TimeWithZone(Temporal.Instant.fromEpochNanoseconds(baseNs), eastern);
    const b = Temporal.Instant.fromEpochNanoseconds(baseNs - 500n);
    expect(a.minus(b)).toBeCloseTo(5e-7, 12);
  });

  it("eql() is nanosecond-precise for Temporal.Instant operands", () => {
    const baseNs = 1_700_000_000_000_000_000n;
    const twz = new TimeWithZone(Temporal.Instant.fromEpochNanoseconds(baseNs), eastern);
    expect(twz.eql(Temporal.Instant.fromEpochNanoseconds(baseNs))).toBe(true);
    expect(twz.eql(Temporal.Instant.fromEpochNanoseconds(baseNs + 1n))).toBe(false);
  });

  it("equals() compares same moment regardless of timezone", () => {
    const est = eastern.local(2024, 1, 15, 12, 0, 0);
    const pst = est.inTimeZone(pacific);
    expect(est.equals(pst)).toBe(true);
    expect(pst.hour).toBe(9);
  });

  it("equals() works with Date", () => {
    const twz = eastern.local(2024, 1, 15, 12, 0, 0);
    const date = twz.utc().toTime().toInstant();
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
    expect(b.isBetween(a, c)).toBe(true);
    expect(a.isBetween(b, c)).toBe(false);
    expect(a.isBetween(a, c)).toBe(true);
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
    const twz = new TimeWithZone(instantFromDate(utcDate), eastern);
    expect(twz.getTime()).toBe(utcDate.getTime());
  });

  it("preserves milliseconds through conversions", () => {
    const twz = eastern.local(2024, 1, 15, 10, 30, 45, 123);
    expect(twz.msec).toBe(123);

    const converted = twz.inTimeZone(pacific);
    expect(converted.msec).toBe(123);
  });

  it("handles year boundary crossing", () => {
    const twz = eastern.local(2024, 12, 31, 23, 0, 0);
    const z = twz.utc().toTime();
    expect(z.year).toBe(2025);
    expect(z.month).toBe(1);
    expect(z.day).toBe(1);
  });

  it("handles leap year February 29", () => {
    const twz = eastern.local(2024, 2, 29, 12, 0, 0);
    expect(twz.month).toBe(2);
    expect(twz.day).toBe(29);
  });

  it("nsec", () => {
    const hawaii = TimeZone.find("Hawaii")!;
    const withZone = new TimeWithZone(
      Temporal.Instant.from("2011-06-08T09:59:59.999999999Z"),
      hawaii,
    );
    expect(withZone.nsec).toBe(999999999);
  });

  it("usec returns 0 when no fractional", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    expect(twz.usec).toBe(0);
  });

  it("advance 1 day expressed as seconds across spring dst", () => {
    const twz = eastern.local(2006, 4, 1, 10, 30);
    const result = twz.plus(86400);
    expect(result.day).toBe(2);
    expect(result.hour).toBe(11);
    expect(result.min).toBe(30);
    expect(result.zone).toBe("EDT");
  });

  it("advance 1 day expressed as hours across spring dst", () => {
    const twz = eastern.local(2006, 4, 1, 10, 30);
    const result = twz.advance({ hours: 24 });
    expect(result.day).toBe(2);
    expect(result.hour).toBe(11);
    expect(result.min).toBe(30);
  });

  it("advance 1 day expressed as seconds across fall dst", () => {
    const twz = eastern.local(2006, 10, 28, 10, 30);
    const result = twz.plus(86400);
    expect(result.day).toBe(29);
    expect(result.hour).toBe(9);
    expect(result.min).toBe(30);
    expect(result.zone).toBe("EST");
  });

  it("change year", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.change({ year: 2001 });
    expect(result.year).toBe(2001);
    expect(result.month).toBe(12);
    expect(result.day).toBe(31);
    expect(result.hour).toBe(19);
  });

  it("change month", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.change({ month: 3 });
    expect(result.month).toBe(3);
    expect(result.day).toBe(31);
    expect(result.hour).toBe(19);
  });

  it("change month clamps day (Feb has fewer days)", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.change({ month: 2 });
    expect(result.month).toBe(2);
    expect(result.day).toBeLessThanOrEqual(28);
  });

  it("change day", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.change({ day: 15 });
    expect(result.day).toBe(15);
    expect(result.hour).toBe(19);
  });

  it("change hour resets min and sec", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.change({ hour: 6 });
    expect(result.hour).toBe(6);
    expect(result.min).toBe(0);
    expect(result.sec).toBe(0);
  });

  it("change min keeps hour", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.change({ min: 15 });
    expect(result.hour).toBe(19);
    expect(result.min).toBe(15);
    expect(result.sec).toBe(0);
  });

  it("change sec", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.change({ sec: 30 });
    expect(result.hour).toBe(19);
    expect(result.min).toBe(0);
    expect(result.sec).toBe(30);
  });

  it("advance years", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.advance({ years: 2 });
    expect(result.year).toBe(2001);
    expect(result.month).toBe(12);
    expect(result.day).toBe(31);
    expect(result.hour).toBe(19);
  });

  it("advance months", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.advance({ months: 3 });
    expect(result.month).toBe(3);
    expect(result.day).toBe(31);
    expect(result.hour).toBe(19);
  });

  it("advance days", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.advance({ days: 4 });
    expect(result.month).toBe(1);
    expect(result.day).toBe(4);
    expect(result.hour).toBe(19);
  });

  it("advance hours", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.advance({ hours: 6 });
    expect(result.day).toBe(1);
    expect(result.hour).toBe(1);
    expect(result.month).toBe(1);
    expect(result.year).toBe(2000);
  });

  it("advance minutes", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.advance({ minutes: 15 });
    expect(result.hour).toBe(19);
    expect(result.min).toBe(15);
  });

  it("advance seconds", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.advance({ seconds: 30 });
    expect(result.hour).toBe(19);
    expect(result.min).toBe(0);
    expect(result.sec).toBe(30);
  });

  it("to fs rfc822", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    expect(twz.toFs("rfc822")).toBe(twz.rfc2822());
  });

  it("to fs rfc2822", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    expect(twz.toFs("rfc2822")).toBe(twz.rfc2822());
  });

  it("to fs iso8601", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    expect(twz.toFs("iso8601")).toBe(twz.xmlschema());
  });

  it("to fs", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    expect(twz.toFs()).toBe("1999-12-31 19:00:00 -0500");
  });

  it("to fs db", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    expect(twz.toFs("db")).toBe("2000-01-01 00:00:00");
    expect(twz.toFormattedS("db")).toBe("2000-01-01 00:00:00");
  });

  it("to fs inspect", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    expect(twz.toFs("inspect")).toBe("1999-12-31 19:00:00.000000000 -0500");
  });

  it("to fs not existent", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    expect(twz.toFs("not_existent")).toBe("1999-12-31 19:00:00 -0500");
  });

  it("strftime with composite format", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    expect(twz.strftime("%Y-%m-%d %H:%M:%S %Z %z")).toBe("1999-12-31 19:00:00 EST -0500");
  });

  it("JSON serialization uses ISO 8601 with 3 fraction digits", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const json = JSON.stringify({ time: twz });
    expect(JSON.parse(json).time).toBe(twz.asJson());
  });

  it("Hawaii timezone basic operations", () => {
    const hawaii = TimeZone.find("Hawaii")!;
    const twz = hawaii.local(2000, 1, 1, 0, 0, 0);

    expect(twz.hour).toBe(0);
    expect(twz.zone).toBe("HST");
    expect(twz.utcOffset).toBe(-10 * 3600);
    expect(twz.dst()).toBe(false);

    expect(twz.utc().toTime().hour).toBe(10);
  });

  it("Alaska timezone basic operations", () => {
    const alaska = TimeZone.find("Alaska")!;
    const twz = alaska.local(2000, 1, 1, 15, 0, 0);

    expect(twz.hour).toBe(15);
    expect(twz.zone).toBe("AKST");
    expect(twz.utcOffset).toBe(-9 * 3600);
  });

  it("converting between multiple timezones preserves the instant", () => {
    const utcTime = new Date(Date.UTC(2024, 6, 15, 12, 0, 0));
    const eastern_twz = new TimeWithZone(instantFromDate(utcTime), eastern);
    const pacific_twz = eastern_twz.inTimeZone(pacific);
    const hawaii = TimeZone.find("Hawaii")!;
    const hawaii_twz = pacific_twz.inTimeZone(hawaii);
    const back_to_eastern = hawaii_twz.inTimeZone(eastern);

    expect(eastern_twz.utc().toTime().epochMilliseconds).toBe(utcTime.getTime());
    expect(pacific_twz.utc().toTime().epochMilliseconds).toBe(utcTime.getTime());
    expect(hawaii_twz.utc().toTime().epochMilliseconds).toBe(utcTime.getTime());
    expect(back_to_eastern.utc().toTime().epochMilliseconds).toBe(utcTime.getTime());

    expect(eastern_twz.hour).toBe(8);
    expect(pacific_twz.hour).toBe(5);
    expect(hawaii_twz.hour).toBe(2);
  });

  it("calculates seconds since midnight correctly", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const expectedSeconds = 19 * 3600;
    const actualSeconds = twz.hour * 3600 + twz.min * 60 + twz.sec;
    expect(actualSeconds).toBe(expectedSeconds);
  });

  it("plus Duration.days(5)", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
    const result = twz.plus(Duration.days(5));
    expect(result.day).toBe(5);
    expect(result.month).toBe(1);
    expect(result.year).toBe(2000);
    expect(result.hour).toBe(19);
  });

  it("minus Duration.days(5)", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);
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
    const twz = eastern.local(2006, 4, 1, 10, 30);
    const dur = new Duration(86401, { days: 1, seconds: 1 });
    const result = twz.plus(dur);
    expect(result.day).toBe(2);
    expect(result.hour).toBe(10);
    expect(result.min).toBe(30);
    expect(result.sec).toBe(1);
    expect(result.zone).toBe("EDT");
  });

  it("method missing with time return value", () => {
    const twz = new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00Z"), eastern);
    const result = (twz as unknown as { add(d: object): unknown }).add({ months: 1 });
    expect(result).toBeInstanceOf(TimeWithZone);
    expect((result as TimeWithZone).time.toString()).toBe("2000-01-31T19:00:00");
  });

  it("method missing with non time return value", () => {
    const twz = new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00Z"), eastern);
    const result = (twz as unknown as { toPlainDate(): unknown }).toPlainDate();
    expect(result).toBeInstanceOf(Temporal.PlainDate);
    expect(String(result)).toBe("1999-12-31");
  });
});

describe("TimeWithZoneMethodsForString", () => {
  it("in time zone with ambiguous time", () => {
    const previousZone = timeZone();
    setZone("Moscow");
    try {
      expect(
        (inTimeZone("2014-10-26 01:00:00") as TimeWithZone).utc().toTime().epochMilliseconds,
      ).toEqual(Temporal.Instant.from("2014-10-25T22:00:00Z").epochMilliseconds);
    } finally {
      setZone(previousZone);
    }
  });
});
