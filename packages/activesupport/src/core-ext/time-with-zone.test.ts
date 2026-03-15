import { beforeEach, describe, expect, it } from "vitest";
import { Duration } from "../duration.js";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../time-zone.js";

describe("TimeWithZoneTest", () => {
  let eastern: TimeZone;
  let pacific: TimeZone;
  let utcZone: TimeZone;

  beforeEach(() => {
    eastern = TimeZone.find("Eastern Time (US & Canada)");
    pacific = TimeZone.find("Pacific Time (US & Canada)");
    utcZone = TimeZone.find("UTC");
  });

  it.skip("utc");

  it.skip("time");

  it.skip("time zone");

  it.skip("in time zone");

  it.skip("in time zone with argument");

  it.skip("in time zone with new zone equal to old zone does not create new object");

  it.skip("in time zone with bad argument");

  it.skip("in time zone with ambiguous time");

  it.skip("localtime");

  it.skip("utc?");

  it.skip("formatted offset");

  it.skip("dst?");

  it.skip("zone");

  it.skip("nsec");

  it.skip("strftime");

  it.skip("strftime with escaping");

  it.skip("inspect");

  it.skip("to s");

  it.skip("to fs");

  it.skip("to fs db");

  it.skip("to fs inspect");

  it.skip("to fs not existent");

  it.skip("xmlschema");

  it.skip("xmlschema with fractional seconds");

  it.skip("xmlschema with fractional seconds lower than hundred thousand");

  it.skip("xmlschema with nil fractional seconds");

  it.skip("iso8601 with fractional seconds");

  it.skip("rfc3339 with fractional seconds");

  it.skip("to yaml");

  it.skip("ruby to yaml");

  it.skip("yaml load");

  it.skip("ruby yaml load");

  it.skip("httpdate");

  it.skip("rfc2822");

  it.skip("compare with time");

  it.skip("compare with datetime");

  it.skip("compare with time with zone");

  it.skip("between?");

  it.skip("today");

  it.skip("yesterday?");

  it.skip("prev day?");

  it.skip("tomorrow?");

  it.skip("next day?");

  it.skip("past with time current as time local");

  it.skip("past with time current as time with zone");

  it.skip("future with time current as time local");

  it.skip("future with time current as time with zone");

  it.skip("before");

  it.skip("after");

  it.skip("eql?");

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

  it("to a", () => {
    // Rails: [45, 30, 5, 1, 2, 2000, 2, 32, false, "HST"]
    const hawaii = TimeZone.find("Hawaii");
    const twzH = new TimeWithZone(new Date(Date.UTC(2000, 1, 1, 15, 30, 45)), hawaii);
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
    const beforeMidnight = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 4, 59, 59)), eastern);
    expect(beforeMidnight.year).toBe(1999);
    expect(beforeMidnight.month).toBe(12);
    expect(beforeMidnight.day).toBe(31);

    // midnight Jan 1 EST
    const atMidnight = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 5, 0, 0)), eastern);
    expect(atMidnight.year).toBe(2000);
    expect(atMidnight.month).toBe(1);
    expect(atMidnight.day).toBe(1);

    // 1 sec before midnight Jan 2 EST
    const beforeMidnight2 = new TimeWithZone(new Date(Date.UTC(2000, 0, 2, 4, 59, 59)), eastern);
    expect(beforeMidnight2.year).toBe(2000);
    expect(beforeMidnight2.month).toBe(1);
    expect(beforeMidnight2.day).toBe(1);

    // midnight Jan 2 EST
    const atMidnight2 = new TimeWithZone(new Date(Date.UTC(2000, 0, 2, 5, 0, 0)), eastern);
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

  it("is a", () => {
    const twz = eastern.local(2024, 1, 15, 12, 0, 0);
    expect(twz.actsLikeTime()).toBe(true);
  });

  it("utc to local conversion with far future datetime", () => {
    // 2050-01-01 00:00:00 UTC → 2049-12-31 19:00:00 EST
    const twz = new TimeWithZone(new Date(Date.UTC(2050, 0, 1, 0, 0, 0)), eastern);
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

  it("change", () => {
    const twz = eastern.local(2024, 3, 15, 10, 30, 45);
    const result = twz.change({ year: 2025 });
    expect(result.year).toBe(2025);
    expect(result.month).toBe(3);
    expect(result.hour).toBe(10);
  });

  it("advance", () => {
    const twz = eastern.local(2024, 3, 15, 10, 0, 0);
    const result = twz.advance({ years: 2 });
    expect(result.year).toBe(2026);
    expect(result.month).toBe(3);
    expect(result.day).toBe(15);
  });

  it("since", () => {
    const twz = eastern.local(2024, 1, 15, 10, 0, 0);
    expect(twz.since(60).min).toBe(1);
  });

  it("ago", () => {
    const twz = eastern.local(2024, 1, 15, 10, 0, 0);
    expect(twz.ago(60).hour).toBe(9);
    expect(twz.ago(60).min).toBe(59);
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
});

describe("TimeZoneTest", () => {
  it.skip("to r");
});
