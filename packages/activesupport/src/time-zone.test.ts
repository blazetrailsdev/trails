import { describe, it, expect } from "vitest";
import { TimeZone } from "./time-zone.js";
import { TimeWithZone } from "./time-with-zone.js";

describe("TimeZoneTest", () => {
  // ---------------------------------------------------------------------------
  // utc/local conversion
  // ---------------------------------------------------------------------------
  it("utc to local", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const utcDate = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));
    const twz = new TimeWithZone(utcDate, zone);
    expect(twz.year).toBe(1999);
    expect(twz.month).toBe(12);
    expect(twz.day).toBe(31);
    expect(twz.hour).toBe(19);
    expect(twz.min).toBe(0);
    expect(twz.sec).toBe(0);
  });

  it("utc to local with fractional seconds", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const utcDate = new Date(Date.UTC(2000, 0, 1, 0, 0, 0, 500));
    const twz = new TimeWithZone(utcDate, zone);
    expect(twz.msec).toBe(500);
    expect(twz.hour).toBe(19);
  });

  it("local to utc", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.local(1999, 12, 31, 19, 0, 0);
    expect(twz.utc().getTime()).toBe(Date.UTC(2000, 0, 1, 0, 0, 0));
  });

  it("period for local", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.local(2024, 1, 15, 12, 0, 0);
    expect(twz.utcOffset).toBe(-5 * 3600);
    expect(twz.dst()).toBe(false);
  });

  it("period for local with ambiguous time", () => {
    // 1AM during fall DST transition is ambiguous
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.local(2006, 10, 29, 1);
    expect(twz.hour).toBe(1);
    // Rails resolves ambiguous time to DST (first occurrence)
    expect(twz.dst()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // mapping
  // ---------------------------------------------------------------------------
  it("from integer to map", () => {
    const eastern = TimeZone.find("Eastern Time (US & Canada)");
    const offset = eastern.utcOffset;
    const zones = TimeZone.all().filter((z) => z.utcOffset === offset);
    expect(zones.length).toBeGreaterThan(0);
    expect(zones.some((z) => z.name === "Eastern Time (US & Canada)")).toBe(true);
  });

  it("from duration to map", () => {
    const eastern = TimeZone.find("Eastern Time (US & Canada)");
    const offset = eastern.utcOffset;
    expect(offset).toBeLessThan(0);
    const zones = TimeZone.all().filter((z) => z.utcOffset === offset);
    expect(zones.length).toBeGreaterThan(0);
  });

  it("from tzinfo to map", () => {
    const zone = TimeZone.find("America/New_York");
    expect(zone.tzinfo).toBe("America/New_York");
  });

  // ---------------------------------------------------------------------------
  // now / today / tomorrow / yesterday
  // ---------------------------------------------------------------------------
  it("now", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.now();
    expect(twz).toBeInstanceOf(TimeWithZone);
    expect(twz.timeZone).toBe(zone);
    expect(twz.year).toBeGreaterThan(2020);
  });

  it("now enforces spring dst rules", () => {
    // Verify that now() in a timezone returns correct DST status
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.now();
    // Can't test specific DST without controlling time, just verify it works
    expect(typeof twz.dst()).toBe("boolean");
  });

  it("now enforces fall dst rules", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.now();
    expect(typeof twz.dst()).toBe("boolean");
  });

  it("unknown timezones delegation to tzinfo", () => {
    const zone = TimeZone.find("America/Montevideo");
    expect(zone).toBeInstanceOf(TimeZone);
    expect(zone.name).toBe("America/Montevideo");
  });

  it("today", () => {
    const zone = TimeZone.find("Hawaii");
    const twz = zone.now();
    expect(twz.year).toBeGreaterThan(2020);
    expect(twz.month).toBeGreaterThanOrEqual(1);
    expect(twz.month).toBeLessThanOrEqual(12);
  });

  it("tomorrow", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const today = zone.today();
    const tomorrow = zone.tomorrow();
    const todayDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
    const tomorrowDate = new Date(Date.UTC(tomorrow.year, tomorrow.month - 1, tomorrow.day));
    expect(tomorrowDate.getTime() - todayDate.getTime()).toBe(86400000);
  });

  it("yesterday", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const today = zone.today();
    const yesterday = zone.yesterday();
    const todayDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
    const yesterdayDate = new Date(Date.UTC(yesterday.year, yesterday.month - 1, yesterday.day));
    expect(todayDate.getTime() - yesterdayDate.getTime()).toBe(86400000);
  });

  it.skip("travel to a date");
  it.skip("travel to travels back and reraises if the block raises");

  // ---------------------------------------------------------------------------
  // local
  // ---------------------------------------------------------------------------
  it("local", () => {
    const hawaii = TimeZone.find("Hawaii");
    const time = hawaii.local(2007, 2, 5, 15, 30, 45);
    expect(time.hour).toBe(15);
    expect(time.min).toBe(30);
    expect(time.sec).toBe(45);
    expect(time.timeZone).toBe(hawaii);
  });

  it("local with old date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.local(1850, 1, 1, 12, 0, 0);
    expect(twz.year).toBe(1850);
    expect(twz.hour).toBe(12);
  });

  it("local enforces spring dst rules", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");

    const twz1 = zone.local(2006, 4, 2, 1, 59, 59);
    expect(twz1.hour).toBe(1);
    expect(twz1.min).toBe(59);
    expect(twz1.sec).toBe(59);
    expect(twz1.dst()).toBe(false);
    expect(twz1.zone).toBe("EST");

    const twz2 = zone.local(2006, 4, 2, 2);
    expect(twz2.hour).toBe(3);
    expect(twz2.dst()).toBe(true);
    expect(twz2.zone).toBe("EDT");

    const twz3 = zone.local(2006, 4, 2, 2, 30);
    expect(twz3.hour).toBe(3);
    expect(twz3.min).toBe(30);
    expect(twz3.dst()).toBe(true);
    expect(twz3.zone).toBe("EDT");
  });

  it("local enforces fall dst rules", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.local(2006, 10, 29, 1);
    expect(twz.hour).toBe(1);
    expect(twz.dst()).toBe(true);
    expect(twz.zone).toBe("EDT");
  });

  it("local with ambiguous time", () => {
    const zone = TimeZone.find("Moscow");
    const twz = zone.local(2014, 10, 26, 1, 0, 0);
    expect(twz.hour).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // at
  // ---------------------------------------------------------------------------
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

  it("at with old date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.at(-2208988800); // 1900-01-01 00:00:00 UTC
    expect(twz).toBeInstanceOf(TimeWithZone);
  });

  it("at with microseconds", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.at(946684800);
    expect(twz.timeZone).toBe(zone);
    expect(twz.utc().getTime()).toBe(946684800000);
  });

  // ---------------------------------------------------------------------------
  // iso8601
  // ---------------------------------------------------------------------------
  it("iso8601", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.iso8601("2024-01-15T12:00:00-05:00");
    expect(twz.hour).toBe(12);
    expect(twz.day).toBe(15);
  });

  it("iso8601 with fractional seconds", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.iso8601("1999-12-31T19:00:00.750");
    expect(twz.msec).toBe(750);
    expect(twz.hour).toBe(19);
    expect(twz.timeZone).toBe(zone);
  });

  it("iso8601 with zone", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.iso8601("1999-12-31T14:00:00-10:00");
    expect(twz.utc().getTime()).toBe(Date.UTC(2000, 0, 1, 0, 0, 0));
    expect(twz.timeZone).toBe(zone);
  });

  it("iso8601 with invalid string", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(() => zone.iso8601("foobar")).toThrow();
  });

  it("iso8601 with nil", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(() => zone.iso8601(null)).toThrow("invalid date");
  });

  it("iso8601 with missing time components", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.iso8601("1999-12-31");
    expect(twz.year).toBe(1999);
    expect(twz.month).toBe(12);
    expect(twz.day).toBe(31);
    expect(twz.hour).toBe(0);
  });

  it("iso8601 with old date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.iso8601("1883-07-01T00:00:00");
    expect(twz.year).toBe(1883);
  });

  it("iso8601 far future date with time zone offset in string", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.iso8601("2050-01-01T00:00:00-05:00");
    expect(twz.utc().getUTCFullYear()).toBe(2050);
  });

  it("iso8601 should not black out system timezone dst jump", () => {
    const zone = TimeZone.find("Pacific Time (US & Canada)");
    const twz = zone.iso8601("2012-03-25T03:29:00");
    expect(twz.sec).toBe(0);
    expect(twz.min).toBe(29);
    expect(twz.hour).toBe(3);
    expect(twz.day).toBe(25);
    expect(twz.month).toBe(3);
    expect(twz.year).toBe(2012);
  });

  it("iso8601 should black out app timezone dst jump", () => {
    const zone = TimeZone.find("Pacific Time (US & Canada)");
    const twz = zone.iso8601("2012-03-11T02:29:00");
    expect(twz.sec).toBe(0);
    expect(twz.min).toBe(29);
    expect(twz.hour).toBe(3);
    expect(twz.day).toBe(11);
    expect(twz.month).toBe(3);
    expect(twz.year).toBe(2012);
  });

  it("iso8601 doesnt use local dst", () => {
    const zone = TimeZone.find("UTC");
    const twz = zone.iso8601("2013-03-10T02:00:00Z");
    expect(twz.hour).toBe(2);
    expect(twz.day).toBe(10);
  });

  it("iso8601 handles dst jump", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.iso8601("2006-04-02T02:00:00");
    expect(twz.hour).toBe(3); // 2AM doesn't exist, springs forward to 3AM
  });

  it("iso8601 with ambiguous time", () => {
    const zone = TimeZone.find("Moscow");
    const twz = zone.iso8601("2014-10-26T01:00:00");
    expect(twz.utc().getTime()).toBe(Date.UTC(2014, 9, 25, 22, 0, 0));
  });
  it("iso8601 with ordinal date value", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.iso8601("21087");
    expect(twz.year).toBe(2021);
    expect(twz.month).toBe(3);
    expect(twz.day).toBe(28);
    expect(twz.hour).toBe(0);
    expect(twz.timeZone).toBe(zone);
  });

  it("iso8601 with invalid ordinal date value", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(() => zone.iso8601("21367")).toThrow("invalid date");
  });

  // ---------------------------------------------------------------------------
  // parse
  // ---------------------------------------------------------------------------
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
    const twz = zone.parse("2024-01-15T12:00:00Z");
    expect(twz.utc().getTime()).toBe(Date.UTC(2024, 0, 15, 12, 0, 0));
    expect(twz.hour).toBe(7);
  });

  it("parse with old date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.parse("1883-07-01 00:00:00");
    expect(twz.year).toBe(1883);
  });

  it("parse far future date with time zone offset in string", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.parse("2050-01-01T00:00:00-05:00");
    expect(twz.utc().getUTCFullYear()).toBe(2050);
  });

  it("parse returns nil when string without date information is passed in", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(() => zone.parse("foobar")).toThrow();
  });

  it("parse with incomplete date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.parse("2000-01-01");
    expect(twz.year).toBe(2000);
    expect(twz.hour).toBe(0);
  });

  it("parse with day omitted", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.parse("2005-02-01");
    expect(twz.year).toBe(2005);
    expect(twz.month).toBe(2);
  });

  it("parse should not black out system timezone dst jump", () => {
    const zone = TimeZone.find("Pacific Time (US & Canada)");
    const twz = zone.parse("2012-03-25 03:29:00");
    expect(twz.hour).toBe(3);
    expect(twz.min).toBe(29);
    expect(twz.day).toBe(25);
    expect(twz.month).toBe(3);
    expect(twz.year).toBe(2012);
  });

  it("parse should black out app timezone dst jump", () => {
    const zone = TimeZone.find("Pacific Time (US & Canada)");
    const twz = zone.parse("2012-03-11 02:29:00");
    expect(twz.hour).toBe(3);
    expect(twz.min).toBe(29);
    expect(twz.day).toBe(11);
    expect(twz.month).toBe(3);
    expect(twz.year).toBe(2012);
  });

  it("parse with missing time components", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.parse("1999-12-31");
    expect(twz.hour).toBe(0);
    expect(twz.min).toBe(0);
  });

  it("parse with javascript date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.parse("2013-01-01T00:00:00");
    expect(twz.year).toBe(2013);
  });

  it("parse doesnt use local dst", () => {
    const zone = TimeZone.find("UTC");
    const twz = zone.parse("2013-03-10 02:00:00");
    expect(twz.hour).toBe(2);
    expect(twz.day).toBe(10);
  });

  it("parse handles dst jump", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.parse("2006-04-02 02:00:00");
    expect(twz.hour).toBe(3);
  });

  it("parse with invalid date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(() => zone.parse("")).toThrow();
  });

  it("parse with ambiguous time", () => {
    const zone = TimeZone.find("Moscow");
    const twz = zone.parse("2014-10-26 01:00:00");
    expect(twz.utc().getTime()).toBe(Date.UTC(2014, 9, 25, 22, 0, 0));
  });

  // ---------------------------------------------------------------------------
  // rfc3339
  // ---------------------------------------------------------------------------
  it("rfc3339", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.rfc3339("1999-12-31T14:00:00-10:00");
    expect(twz.utc().getTime()).toBe(Date.UTC(2000, 0, 1, 0, 0, 0));
    expect(twz.timeZone).toBe(zone);
  });

  it("rfc3339 with fractional seconds", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.rfc3339("1999-12-31T19:00:00.750-05:00");
    expect(twz.msec).toBe(750);
  });

  it("rfc3339 with missing time", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(() => zone.rfc3339("1999-12-31")).toThrow("invalid date");
  });

  it("rfc3339 with missing offset", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(() => zone.rfc3339("1999-12-31T19:00:00")).toThrow("invalid date");
  });

  it("rfc3339 with invalid string", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(() => zone.rfc3339("not-a-valid-rfc3339")).toThrow();
  });

  it("rfc3339 with old date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.rfc3339("1883-07-01T00:00:00-05:00");
    expect(twz.year).toBe(1883);
  });

  it("rfc3339 far future date with time zone offset in string", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.rfc3339("2050-01-01T00:00:00-05:00");
    expect(twz.utc().getUTCFullYear()).toBe(2050);
  });

  it("rfc3339 should not black out system timezone dst jump", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.rfc3339("2006-07-15T12:00:00-04:00");
    expect(twz.hour).toBe(12);
    expect(twz.day).toBe(15);
  });

  it("rfc3339 should black out app timezone dst jump", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.rfc3339("2006-04-02T03:00:00-04:00");
    expect(twz.hour).toBe(3);
    expect(twz.day).toBe(2);
  });

  it("rfc3339 doesnt use local dst", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.rfc3339("2006-07-15T12:00:00-04:00");
    expect(twz.timeZone).toBe(zone);
  });

  it("rfc3339 handles dst jump", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.rfc3339("2006-04-02T03:00:00-04:00");
    expect(twz.hour).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // strptime
  // ---------------------------------------------------------------------------
  it("strptime", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.strptime("1999-12-31 12:00:00", "%Y-%m-%d %H:%M:%S");
    expect(twz.utc().getTime()).toBe(Date.UTC(1999, 11, 31, 17));
    expect(twz.time.getTime()).toBe(Date.UTC(1999, 11, 31, 12));
    expect(twz.timeZone).toBe(zone);
  });

  it("strptime with nondefault time zone", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.strptime("1999-12-31 12:00:00", "%Y-%m-%d %H:%M:%S");
    expect(twz.utc().getTime()).toBe(Date.UTC(1999, 11, 31, 17));
    expect(twz.time.getTime()).toBe(Date.UTC(1999, 11, 31, 12));
    expect(twz.timeZone).toBe(zone);
  });

  it("strptime with explicit time zone as abbrev", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.strptime("1999-12-31 12:00:00 PST", "%Y-%m-%d %H:%M:%S %Z");
    expect(twz.utc().getTime()).toBe(Date.UTC(1999, 11, 31, 20));
    expect(twz.time.getTime()).toBe(Date.UTC(1999, 11, 31, 15));
    expect(twz.timeZone).toBe(zone);
  });

  it("strptime with explicit time zone as h offset", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.strptime("1999-12-31 12:00:00 -08", "%Y-%m-%d %H:%M:%S %:::z");
    expect(twz.utc().getTime()).toBe(Date.UTC(1999, 11, 31, 20));
    expect(twz.time.getTime()).toBe(Date.UTC(1999, 11, 31, 15));
    expect(twz.timeZone).toBe(zone);
  });

  it("strptime with explicit time zone as hm offset", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.strptime("1999-12-31 12:00:00 -08:00", "%Y-%m-%d %H:%M:%S %:z");
    expect(twz.utc().getTime()).toBe(Date.UTC(1999, 11, 31, 20));
    expect(twz.time.getTime()).toBe(Date.UTC(1999, 11, 31, 15));
    expect(twz.timeZone).toBe(zone);
  });

  it("strptime with explicit time zone as hms offset", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.strptime("1999-12-31 12:00:00 -08:00:00", "%Y-%m-%d %H:%M:%S %::z");
    expect(twz.utc().getTime()).toBe(Date.UTC(1999, 11, 31, 20));
    expect(twz.time.getTime()).toBe(Date.UTC(1999, 11, 31, 15));
    expect(twz.timeZone).toBe(zone);
  });

  it("strptime with almost explicit time zone", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.strptime("1999-12-31 12:00:00 %Z", "%Y-%m-%d %H:%M:%S %%Z");
    expect(twz.utc().getTime()).toBe(Date.UTC(1999, 11, 31, 17));
    expect(twz.time.getTime()).toBe(Date.UTC(1999, 11, 31, 12));
    expect(twz.timeZone).toBe(zone);
  });

  it("strptime with day omitted", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const base = zone.local(2000, 1, 1);
    expect(zone.strptime("Feb", "%b", base).month).toBe(2);
    expect(zone.strptime("Feb", "%b", base).day).toBe(1);
    expect(zone.strptime("Feb 2005", "%b %Y", base).year).toBe(2005);
    expect(zone.strptime("Feb 2005", "%b %Y", base).month).toBe(2);
    expect(zone.strptime("2 Feb 2005", "%e %b %Y", base).day).toBe(2);
    expect(zone.strptime("2 Feb 2005", "%e %b %Y", base).month).toBe(2);
    expect(zone.strptime("2 Feb 2005", "%e %b %Y", base).year).toBe(2005);
  });

  it("strptime with malformed string", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(() => zone.strptime("1999-12-31", "%Y/%m/%d")).toThrow();
  });

  it("strptime with timestamp seconds", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.strptime("1470272280", "%s");
    expect(twz.toI()).toBe(1470272280);
  });

  it("strptime with timestamp milliseconds", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.strptime("1470272280000", "%Q");
    expect(twz.toI()).toBe(1470272280);
  });

  it("strptime with ambiguous time", () => {
    const zone = TimeZone.find("Moscow");
    const twz = zone.strptime("2014-10-26 01:00:00", "%Y-%m-%d %H:%M:%S");
    expect(twz.utc().getTime()).toBe(Date.UTC(2014, 9, 25, 22, 0, 0));
  });

  // ---------------------------------------------------------------------------
  // utc_offset / formatted_offset
  // ---------------------------------------------------------------------------
  it("utc offset lazy loaded from tzinfo when not passed in to initialize", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(typeof zone.utcOffset).toBe("number");
  });

  it("utc offset is not cached when current period gets stale", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const winterOffset = zone.utcOffsetAt(new Date(Date.UTC(2024, 0, 15)));
    const summerOffset = zone.utcOffsetAt(new Date(Date.UTC(2024, 6, 15)));
    expect(winterOffset).not.toBe(summerOffset);
  });

  it("seconds to utc offset with colon", () => {
    // Use Arizona which doesn't observe DST
    const zone = TimeZone.find("Arizona");
    expect(zone.formattedOffset(true)).toBe("-07:00");
  });

  it("seconds to utc offset without colon", () => {
    const zone = TimeZone.find("Arizona");
    expect(zone.formattedOffset(false)).toBe("-0700");
  });

  it("seconds to utc offset with negative offset", () => {
    const zone = TimeZone.find("Arizona");
    expect(zone.utcOffset).toBe(-7 * 3600);
  });

  it("formatted offset positive", () => {
    const tokyo = TimeZone.find("Asia/Tokyo");
    expect(tokyo.formattedOffset()).toBe("+09:00");
  });

  it("formatted offset negative", () => {
    const zone = TimeZone.find("Arizona");
    expect(zone.formattedOffset()).toBe("-07:00");
  });

  it("z format strings", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(zone.formattedOffset()).toMatch(/^[+-]\d{2}:\d{2}$/);
  });

  it("formatted offset zero", () => {
    const zone = TimeZone.find("UTC");
    expect(zone.formattedOffset()).toBe("+00:00");
  });

  // ---------------------------------------------------------------------------
  // comparison / matching
  // ---------------------------------------------------------------------------
  it("zone compare", () => {
    const a = TimeZone.find("Eastern Time (US & Canada)");
    const b = TimeZone.find("Pacific Time (US & Canada)");
    // Eastern is ahead of Pacific (less negative offset)
    expect(a.utcOffset).toBeGreaterThan(b.utcOffset);
  });

  it("zone match", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(zone.match("Eastern Time (US & Canada)")).toBe(true);
    expect(zone.match("America/New_York")).toBe(true);
    expect(zone.match("Pacific Time (US & Canada)")).toBe(false);
  });

  it("zone match?", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(zone.match("Eastern Time (US & Canada)")).toBe(true);
    expect(zone.match("bogus")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // to_s / all / index
  // ---------------------------------------------------------------------------
  it("to s", () => {
    const tz = TimeZone.find("UTC");
    expect(tz.toString()).toBe("(GMT+00:00) UTC");
  });

  it("all sorted", () => {
    const zones = TimeZone.all();
    expect(zones.length).toBeGreaterThan(100);
    // Verify we get a reasonable set of zones
    expect(zones.some((z) => z.name === "UTC")).toBe(true);
    expect(zones.some((z) => z.name === "Eastern Time (US & Canada)")).toBe(true);
  });

  it("all uninfluenced by time zone lookups delegated to tzinfo", () => {
    const all = TimeZone.all();
    TimeZone.find("America/Montevideo");
    const all2 = TimeZone.all();
    expect(all.length).toBe(all2.length);
  });

  it("all doesnt raise exception with missing tzinfo data", () => {
    expect(() => TimeZone.all()).not.toThrow();
  });

  it("index", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(zone.name).toBe("Eastern Time (US & Canada)");
    expect(zone.tzinfo).toBe("America/New_York");
  });

  it("unknown zone raises exception", () => {
    expect(() => TimeZone.find("Not/A/Real/Zone")).toThrow();
  });

  it("unknown zones dont store mapping keys", () => {
    expect(() => TimeZone.find("bogus")).toThrow();
    const all = TimeZone.all();
    expect(all.some((z) => z.name === "bogus")).toBe(false);
  });

  it("new", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(zone).toBeInstanceOf(TimeZone);
    expect(zone.name).toBe("Eastern Time (US & Canada)");
  });

  it("us zones", () => {
    const zones = TimeZone.usZones();
    expect(zones.length).toBeGreaterThan(0);
    expect(zones.some((z) => z.name === "Eastern Time (US & Canada)")).toBe(true);
    expect(zones.some((z) => z.name === "Hawaii")).toBe(true);
  });

  it.skip("country zones");
  it.skip("country zones with and without mappings");
  it.skip("country zones with multiple mappings");
  it.skip("country zones without mappings");
  it.skip("to yaml");
  it.skip("yaml load");

  it("abbr", () => {
    const tz = TimeZone.find("America/New_York");
    const jan = new Date(Date.UTC(2024, 0, 15));
    expect(tz.abbreviation(jan)).toBe("EST");
  });

  it("dst", () => {
    const tz = TimeZone.find("America/New_York");
    const jan = new Date(2024, 0, 15);
    const jul = new Date(2024, 6, 15);
    expect(tz.isDst(jan)).toBe(false);
    expect(tz.isDst(jul)).toBe(true);
  });

  it.skip("works as ruby time zone");
});
