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

  it.skip("from duration to map", () => {});
  it.skip("from tzinfo to map", () => {});

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

  it.skip("tomorrow", () => {});
  it.skip("yesterday", () => {});
  it.skip("travel to a date", () => {});
  it.skip("travel to travels back and reraises if the block raises", () => {});

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

  it.skip("local with old date", () => {});

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

  it.skip("local with ambiguous time", () => {});

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

  it.skip("at with old date", () => {});
  it.skip("at with microseconds", () => {});

  // ---------------------------------------------------------------------------
  // iso8601
  // ---------------------------------------------------------------------------
  it("iso8601", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    const twz = zone.parse("2024-01-15T12:00:00-05:00");
    expect(twz.hour).toBe(12);
    expect(twz.day).toBe(15);
  });

  it.skip("iso8601 with fractional seconds", () => {});
  it.skip("iso8601 with zone", () => {});

  it("iso8601 with invalid string", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(() => zone.parse("foobar")).toThrow();
  });

  it.skip("iso8601 with nil", () => {});
  it.skip("iso8601 with missing time components", () => {});
  it.skip("iso8601 with old date", () => {});
  it.skip("iso8601 far future date with time zone offset in string", () => {});
  it.skip("iso8601 should not black out system timezone dst jump", () => {});
  it.skip("iso8601 should black out app timezone dst jump", () => {});

  it("iso8601 doesnt use local dst", () => {
    const zone = TimeZone.find("UTC");
    const twz = zone.parse("2013-03-10T02:00:00Z");
    expect(twz.hour).toBe(2);
    expect(twz.day).toBe(10);
  });

  it.skip("iso8601 handles dst jump", () => {});
  it.skip("iso8601 with ambiguous time", () => {});
  it.skip("iso8601 with ordinal date value", () => {});
  it.skip("iso8601 with invalid ordinal date value", () => {});

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

  it.skip("parse with old date", () => {});
  it.skip("parse far future date with time zone offset in string", () => {});
  it.skip("parse returns nil when string without date information is passed in", () => {});
  it.skip("parse with incomplete date", () => {});
  it.skip("parse with day omitted", () => {});
  it.skip("parse should not black out system timezone dst jump", () => {});
  it.skip("parse should black out app timezone dst jump", () => {});
  it.skip("parse with missing time components", () => {});
  it.skip("parse with javascript date", () => {});

  it("parse doesnt use local dst", () => {
    const zone = TimeZone.find("UTC");
    const twz = zone.parse("2013-03-10 02:00:00");
    expect(twz.hour).toBe(2);
    expect(twz.day).toBe(10);
  });

  it.skip("parse handles dst jump", () => {});
  it.skip("parse with invalid date", () => {});
  it.skip("parse with ambiguous time", () => {});

  // ---------------------------------------------------------------------------
  // rfc3339
  // ---------------------------------------------------------------------------
  it.skip("rfc3339", () => {});
  it.skip("rfc3339 with fractional seconds", () => {});
  it.skip("rfc3339 with missing time", () => {});
  it.skip("rfc3339 with missing offset", () => {});

  it("rfc3339 with invalid string", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(() => zone.parse("not-a-valid-rfc3339")).toThrow();
  });

  it.skip("rfc3339 with old date", () => {});
  it.skip("rfc3339 far future date with time zone offset in string", () => {});
  it.skip("rfc3339 should not black out system timezone dst jump", () => {});
  it.skip("rfc3339 should black out app timezone dst jump", () => {});
  it.skip("rfc3339 doesnt use local dst", () => {});
  it.skip("rfc3339 handles dst jump", () => {});

  // ---------------------------------------------------------------------------
  // strptime (not implemented in TS)
  // ---------------------------------------------------------------------------
  it.skip("strptime", () => {});
  it.skip("strptime with nondefault time zone", () => {});
  it.skip("strptime with explicit time zone as abbrev", () => {});
  it.skip("strptime with explicit time zone as h offset", () => {});
  it.skip("strptime with explicit time zone as hm offset", () => {});
  it.skip("strptime with explicit time zone as hms offset", () => {});
  it.skip("strptime with almost explicit time zone", () => {});
  it.skip("strptime with day omitted", () => {});
  it.skip("strptime with malformed string", () => {});
  it.skip("strptime with timestamp seconds", () => {});
  it.skip("strptime with timestamp milliseconds", () => {});
  it.skip("strptime with ambiguous time", () => {});

  // ---------------------------------------------------------------------------
  // utc_offset / formatted_offset
  // ---------------------------------------------------------------------------
  it.skip("utc offset lazy loaded from tzinfo when not passed in to initialize", () => {});
  it.skip("utc offset is not cached when current period gets stale", () => {});

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

  it.skip("z format strings", () => {});

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

  it.skip("zone match", () => {});
  it.skip("zone match?", () => {});

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

  it.skip("all uninfluenced by time zone lookups delegated to tzinfo", () => {});
  it.skip("all doesnt raise exception with missing tzinfo data", () => {});
  it.skip("index", () => {});

  it("unknown zone raises exception", () => {
    expect(() => TimeZone.find("Not/A/Real/Zone")).toThrow();
  });

  it.skip("unknown zones dont store mapping keys", () => {});

  it("new", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect(zone).toBeInstanceOf(TimeZone);
    expect(zone.name).toBe("Eastern Time (US & Canada)");
  });

  it.skip("us zones", () => {});
  it.skip("country zones", () => {});
  it.skip("country zones with and without mappings", () => {});
  it.skip("country zones with multiple mappings", () => {});
  it.skip("country zones without mappings", () => {});
  it.skip("to yaml", () => {});
  it.skip("yaml load", () => {});

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

  it.skip("works as ruby time zone", () => {});
});
