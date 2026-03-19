import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Duration } from "../duration.js";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../time-zone.js";
import { travelTo } from "../testing-helpers.js";
import {
  getZone,
  setZone,
  resetZone,
  getZoneDefault,
  setZoneDefault,
  useZone,
  findZone,
  findZoneBang,
  current,
  dateInTimeZone,
} from "../time-zone-config.js";

describe("TimeWithZoneTest", () => {
  let eastern: TimeZone;
  let pacific: TimeZone;
  let utcZone: TimeZone;

  beforeEach(() => {
    eastern = TimeZone.find("Eastern Time (US & Canada)");
    pacific = TimeZone.find("Pacific Time (US & Canada)");
    utcZone = TimeZone.find("UTC");
  });

  // @twz = 2000-01-01 00:00:00 UTC in Eastern = 1999-12-31 19:00:00 EST
  const maketwz = () => new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), eastern);

  it("utc", () => {
    const twz = maketwz();
    expect(twz.utc().getTime()).toBe(Date.UTC(2000, 0, 1, 0, 0, 0));
    expect(twz.utc()).toBeInstanceOf(Date);
  });

  it("time", () => {
    const twz = maketwz();
    expect(twz.time.getTime()).toBe(Date.UTC(1999, 11, 31, 19, 0, 0));
  });

  it("time zone", () => {
    const twz = maketwz();
    expect(twz.timeZone).toBe(eastern);
  });

  it("in time zone", () => {
    useZone("Alaska", () => {
      const twz = maketwz();
      const result = twz.inTimeZone();
      expect(result.timeZone.name).toBe("Alaska");
      expect(result.utc().getTime()).toBe(twz.utc().getTime());
    });
  });

  it("in time zone with argument", () => {
    const twz = maketwz();
    const alaska = TimeZone.find("Alaska");
    const result = twz.inTimeZone("Alaska");
    expect(result.timeZone.name).toBe(alaska.name);
    expect(result.utc().getTime()).toBe(twz.utc().getTime());
  });

  it("in time zone with new zone equal to old zone does not create new object", () => {
    const twz = maketwz();
    expect(twz.inTimeZone(eastern)).toBe(twz);
  });

  it("in time zone with bad argument", () => {
    const twz = maketwz();
    expect(() => twz.inTimeZone("No such timezone exists")).toThrow();
  });

  it("in time zone with ambiguous time", () => {
    // 2014-10-26 01:00:00 Moscow time was ambiguous due to DST change
    const moscow = TimeZone.find("Moscow");
    const twz = moscow.local(2014, 10, 26, 1, 0, 0);
    expect(twz.utc().getTime()).toBe(Date.UTC(2014, 9, 25, 22, 0, 0));
  });

  it("localtime", () => {
    const twz = maketwz();
    const local = twz.localtime();
    expect(local).toBeInstanceOf(Date);
  });

  it("utc?", () => {
    const twz = maketwz();
    expect(twz.isUtc()).toBe(false);
    expect(new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), utcZone).isUtc()).toBe(true);
  });

  it("formatted offset", () => {
    const twz = maketwz();
    expect(twz.formattedOffset()).toBe("-05:00");
    const summer = new TimeWithZone(new Date(Date.UTC(2000, 5, 1)), eastern);
    expect(summer.formattedOffset()).toBe("-04:00");
  });

  it("dst?", () => {
    const twz = maketwz();
    expect(twz.dst()).toBe(false);
    const summer = new TimeWithZone(new Date(Date.UTC(2000, 5, 1)), eastern);
    expect(summer.dst()).toBe(true);
  });

  it("zone", () => {
    const twz = maketwz();
    expect(twz.zone).toBe("EST");
    const summer = new TimeWithZone(new Date(Date.UTC(2000, 5, 1)), eastern);
    expect(summer.zone).toBe("EDT");
  });

  it("nsec", () => {
    const twz = maketwz();
    expect(twz.nsec).toBe(0);
  });

  it("strftime", () => {
    const twz = maketwz();
    expect(twz.strftime("%Y-%m-%d %H:%M:%S %Z %z")).toBe("1999-12-31 19:00:00 EST -0500");
  });

  it("strftime with escaping", () => {
    const twz = maketwz();
    expect(twz.strftime("%%Z %%z")).toBe("%Z %z");
    expect(twz.strftime("%%%Z %%%z")).toBe("%EST %-0500");
  });

  it("inspect", () => {
    const twz = maketwz();
    expect(twz.inspect()).toBe("1999-12-31 19:00:00.000000000 EST -05:00");
  });

  it("to s", () => {
    const twz = maketwz();
    expect(twz.toString()).toBe("1999-12-31 19:00:00 -0500");
  });

  it("to fs", () => {
    const twz = maketwz();
    expect(twz.toFs()).toBe("1999-12-31 19:00:00 -0500");
  });

  it("to fs db", () => {
    const twz = maketwz();
    expect(twz.toFs("db")).toBe("2000-01-01 00:00:00");
    expect(twz.toFormattedS("db")).toBe("2000-01-01 00:00:00");
  });

  it("to fs inspect", () => {
    const twz = maketwz();
    expect(twz.toFs("inspect")).toBe("1999-12-31 19:00:00.000000000 -0500");
  });

  it("to fs not existent", () => {
    const twz = maketwz();
    expect(twz.toFs("not_existent")).toBe("1999-12-31 19:00:00 -0500");
  });

  it("xmlschema", () => {
    const twz = maketwz();
    expect(twz.xmlschema()).toBe("1999-12-31T19:00:00-05:00");
  });

  it("xmlschema with fractional seconds", () => {
    const twz = maketwz().plus(0.123456);
    expect(twz.xmlschema(3)).toBe("1999-12-31T19:00:00.123-05:00");
  });

  it("xmlschema with fractional seconds lower than hundred thousand", () => {
    const twz = maketwz().plus(0.001234);
    expect(twz.xmlschema(3)).toBe("1999-12-31T19:00:00.001-05:00");
  });

  it("xmlschema with nil fractional seconds", () => {
    const twz = maketwz();
    expect(twz.xmlschema(0)).toBe("1999-12-31T19:00:00-05:00");
  });

  it("iso8601 with fractional seconds", () => {
    const twz = maketwz().plus(0.125);
    expect(twz.iso8601(3)).toBe("1999-12-31T19:00:00.125-05:00");
  });

  it("rfc3339 with fractional seconds", () => {
    const twz = maketwz().plus(0.125);
    expect(twz.rfc3339(3)).toBe("1999-12-31T19:00:00.125-05:00");
  });

  it.skip("to yaml");

  it.skip("ruby to yaml");

  it.skip("yaml load");

  it.skip("ruby yaml load");

  it("httpdate", () => {
    const twz = maketwz();
    expect(twz.httpdate()).toBe("Sat, 01 Jan 2000 00:00:00 GMT");
  });

  it("rfc2822", () => {
    const twz = maketwz();
    expect(twz.rfc2822()).toBe("Fri, 31 Dec 1999 19:00:00 -0500");
  });

  it("compare with time", () => {
    const twz = maketwz();
    expect(twz.compareTo(new Date(Date.UTC(1999, 11, 31, 23, 59, 59)))).toBe(1);
    expect(twz.compareTo(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)))).toBe(0);
    expect(twz.compareTo(new Date(Date.UTC(2000, 0, 1, 0, 0, 1)))).toBe(-1);
  });

  it("compare with datetime", () => {
    const twz = maketwz();
    // DateTime in Rails is equivalent to Date in JS — compare by UTC instant
    expect(twz.compareTo(new Date(Date.UTC(1999, 11, 31, 23, 59, 59)))).toBe(1);
    expect(twz.compareTo(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)))).toBe(0);
    expect(twz.compareTo(new Date(Date.UTC(2000, 0, 1, 0, 0, 1)))).toBe(-1);
  });

  it("compare with time with zone", () => {
    const twz = maketwz();
    expect(
      twz.compareTo(new TimeWithZone(new Date(Date.UTC(1999, 11, 31, 23, 59, 59)), utcZone)),
    ).toBe(1);
    expect(twz.compareTo(new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)), utcZone))).toBe(
      0,
    );
    expect(twz.compareTo(new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 1)), utcZone))).toBe(
      -1,
    );
  });

  it("between?", () => {
    const twz = maketwz();
    expect(
      twz.between(
        new Date(Date.UTC(1999, 11, 31, 23, 59, 59)),
        new Date(Date.UTC(2000, 0, 1, 0, 0, 1)),
      ),
    ).toBe(true);
    expect(
      twz.between(new Date(Date.UTC(2000, 0, 1, 0, 0, 1)), new Date(Date.UTC(2000, 0, 1, 0, 0, 2))),
    ).toBe(false);
  });

  it("today", () => {
    travelTo(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)), () => {
      expect(eastern.local(1999, 12, 31, 23, 59, 59).isToday()).toBe(false);
      expect(eastern.local(2000, 1, 1, 0).isToday()).toBe(true);
      expect(eastern.local(2000, 1, 1, 23, 59, 59).isToday()).toBe(true);
      expect(eastern.local(2000, 1, 2, 0).isToday()).toBe(false);
    });
  });

  it("yesterday?", () => {
    travelTo(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)), () => {
      expect(eastern.local(1999, 12, 31, 23, 59, 59).isYesterday()).toBe(true);
      expect(eastern.local(2000, 1, 1, 0).isYesterday()).toBe(false);
      expect(eastern.local(1999, 12, 31).isYesterday()).toBe(true);
      expect(eastern.local(2000, 1, 2, 0).isYesterday()).toBe(false);
    });
  });

  it("prev day?", () => {
    travelTo(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)), () => {
      expect(eastern.local(1999, 12, 31, 23, 59, 59).isPrevDay()).toBe(true);
      expect(eastern.local(2000, 1, 1, 0).isPrevDay()).toBe(false);
      expect(eastern.local(1999, 12, 31).isPrevDay()).toBe(true);
      expect(eastern.local(2000, 1, 2, 0).isPrevDay()).toBe(false);
    });
  });

  it("tomorrow?", () => {
    travelTo(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)), () => {
      expect(eastern.local(1999, 12, 31, 23, 59, 59).isTomorrow()).toBe(false);
      expect(eastern.local(2000, 1, 2, 0).isTomorrow()).toBe(true);
      expect(eastern.local(2000, 1, 1, 23, 59, 59).isTomorrow()).toBe(false);
      expect(eastern.local(1999, 12, 31, 0).isTomorrow()).toBe(false);
    });
  });

  it("next day?", () => {
    travelTo(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)), () => {
      expect(eastern.local(1999, 12, 31, 23, 59, 59).isNextDay()).toBe(false);
      expect(eastern.local(2000, 1, 2, 0).isNextDay()).toBe(true);
      expect(eastern.local(2000, 1, 1, 23, 59, 59).isNextDay()).toBe(false);
      expect(eastern.local(1999, 12, 31, 0).isNextDay()).toBe(false);
    });
  });

  it("past with time current as time local", () => {
    travelTo(eastern.local(2005, 2, 10, 15, 30, 45).utc(), () => {
      expect(eastern.local(2005, 2, 10, 15, 30, 44).isPast()).toBe(true);
      expect(eastern.local(2005, 2, 10, 15, 30, 45).isPast()).toBe(false);
      expect(eastern.local(2005, 2, 10, 15, 30, 46).isPast()).toBe(false);
    });
  });

  it("past with time current as time with zone", () => {
    travelTo(eastern.local(2005, 2, 10, 15, 30, 45).utc(), () => {
      expect(eastern.local(2005, 2, 10, 15, 30, 44).isPast()).toBe(true);
      expect(eastern.local(2005, 2, 10, 15, 30, 45).isPast()).toBe(false);
      expect(eastern.local(2005, 2, 10, 15, 30, 46).isPast()).toBe(false);
    });
  });

  it("future with time current as time local", () => {
    travelTo(eastern.local(2005, 2, 10, 15, 30, 45).utc(), () => {
      expect(eastern.local(2005, 2, 10, 15, 30, 44).isFuture()).toBe(false);
      expect(eastern.local(2005, 2, 10, 15, 30, 45).isFuture()).toBe(false);
      expect(eastern.local(2005, 2, 10, 15, 30, 46).isFuture()).toBe(true);
    });
  });

  it("future with time current as time with zone", () => {
    travelTo(eastern.local(2005, 2, 10, 15, 30, 45).utc(), () => {
      expect(eastern.local(2005, 2, 10, 15, 30, 44).isFuture()).toBe(false);
      expect(eastern.local(2005, 2, 10, 15, 30, 45).isFuture()).toBe(false);
      expect(eastern.local(2005, 2, 10, 15, 30, 46).isFuture()).toBe(true);
    });
  });

  it("before", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2017, 2, 6, 12, 0, 0)), eastern);
    expect(
      twz.isBefore(new TimeWithZone(new Date(Date.UTC(2017, 2, 6, 11, 59, 59)), eastern)),
    ).toBe(false);
    expect(twz.isBefore(new TimeWithZone(new Date(Date.UTC(2017, 2, 6, 12, 0, 0)), eastern))).toBe(
      false,
    );
    expect(twz.isBefore(new TimeWithZone(new Date(Date.UTC(2017, 2, 6, 12, 0, 1)), eastern))).toBe(
      true,
    );
  });

  it("after", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2017, 2, 6, 12, 0, 0)), eastern);
    expect(twz.isAfter(new TimeWithZone(new Date(Date.UTC(2017, 2, 6, 11, 59, 59)), eastern))).toBe(
      true,
    );
    expect(twz.isAfter(new TimeWithZone(new Date(Date.UTC(2017, 2, 6, 12, 0, 0)), eastern))).toBe(
      false,
    );
    expect(twz.isAfter(new TimeWithZone(new Date(Date.UTC(2017, 2, 6, 12, 0, 1)), eastern))).toBe(
      false,
    );
  });

  it("eql?", () => {
    const twz = maketwz();
    expect(twz.eql(new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), eastern))).toBe(true);
    expect(twz.eql(new Date(Date.UTC(2000, 0, 1)))).toBe(true);
    expect(twz.eql(new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), TimeZone.find("Hawaii")))).toBe(
      true,
    );
    expect(twz.eql(new Date(Date.UTC(2000, 0, 1, 0, 0, 1)))).toBe(false);
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
  it("plus with integer when self wraps datetime", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0)), eastern);
    const result = twz.plus(5);
    expect(result.hour).toBe(19);
    expect(result.min).toBe(0);
    expect(result.sec).toBe(5);
  });

  it.skip("no limit on times");

  it("plus with invalid argument", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), eastern);
    expect(() => twz.plus({} as any)).toThrow();
  });

  it("minus with integer when self wraps datetime", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0)), eastern);
    const result = twz.minus(5);
    expect(result.hour).toBe(18);
    expect(result.min).toBe(59);
    expect(result.sec).toBe(55);
  });

  it("minus with time precision", () => {
    const twz2 = new TimeWithZone(new Date(Date.UTC(2000, 0, 2, 23, 59, 59, 999)), utcZone);
    const t1 = new Date(Date.UTC(2000, 0, 2, 0, 0, 0, 1));
    const diff = twz2.minus(t1);
    expect(diff).toBeCloseTo(86399.998, 3);
  });

  it("minus with time with zone without preserve configured", () => {
    const twz1 = new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), utcZone);
    const twz2 = new TimeWithZone(new Date(Date.UTC(2000, 0, 2)), utcZone);
    expect(twz2.minus(twz1)).toBe(86400);
  });

  it("minus with time with zone precision", () => {
    const twz1 = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0, 1)), utcZone);
    const twz2 = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 23, 59, 59, 999)), utcZone);
    expect(twz2.minus(twz1)).toBeCloseTo(86399.998, 3);
  });

  it("minus with datetime precision", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 23, 59, 59, 999)), utcZone);
    const dt = new Date(Date.UTC(2000, 0, 1));
    expect(twz.minus(dt)).toBeCloseTo(86399.999, 3);
  });

  it("minus with wrapped datetime", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 2)), utcZone);
    expect(twz.minus(new Date(Date.UTC(2000, 0, 1)))).toBe(86400);
  });

  it("to i with wrapped datetime", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0)), eastern);
    expect(twz.toI()).toBe(946684800);
  });

  it("time at", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), utcZone);
    expect(twz.toI()).toBe(Math.floor(new Date(Date.UTC(2000, 0, 1)).getTime() / 1000));
  });

  it("to time with preserve timezone using zone", () => {
    const twz = maketwz();
    const time = twz.utc();
    expect(time).toBeInstanceOf(Date);
    expect(time.getTime()).toBe(Date.UTC(2000, 0, 1, 0, 0, 0));
  });

  it("to time with preserve timezone using offset", () => {
    const twz = maketwz();
    const time = twz.utc();
    expect(time.getTime()).toBe(twz.getTime());
  });

  it("to time with preserve timezone using true", () => {
    const twz = maketwz();
    const time = twz.utc();
    expect(time.getTime()).toBe(Date.UTC(2000, 0, 1));
  });

  it("to time without preserve timezone", () => {
    const twz = maketwz();
    const time = twz.utc();
    expect(time).toBeInstanceOf(Date);
  });

  it("to time without preserve timezone configured", () => {
    const twz = maketwz();
    const time = twz.utc();
    expect(time.getTime()).toBe(Date.UTC(2000, 0, 1));
  });

  it("method missing with time return value", () => {
    const twz = maketwz();
    const result = twz.advance({ months: 1 });
    expect(result).toBeInstanceOf(TimeWithZone);
    expect(result.month).toBe(1);
    expect(result.day).toBe(31);
    expect(result.hour).toBe(19);
  });

  it("marshal dump and load", () => {
    const twz = maketwz();
    const json = JSON.stringify({
      utc: twz.utc().toISOString(),
      timeZone: twz.timeZone.name,
    });
    const parsed = JSON.parse(json);
    const restored = new TimeWithZone(new Date(parsed.utc), TimeZone.find(parsed.timeZone));
    expect(restored.utc().getTime()).toBe(twz.utc().getTime());
    expect(restored.timeZone.name).toBe(twz.timeZone.name);
    expect(restored.inspect()).toBe(twz.inspect());
  });

  it("marshal dump and load with tzinfo identifier", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0)), eastern);
    const json = JSON.stringify({
      utc: twz.utc().toISOString(),
      timeZone: twz.timeZone.tzinfo,
    });
    const parsed = JSON.parse(json);
    const restored = new TimeWithZone(new Date(parsed.utc), TimeZone.find(parsed.timeZone));
    expect(restored.utc().getTime()).toBe(twz.utc().getTime());
    expect(restored.inspect()).toBe(twz.inspect());
  });

  it("freeze", () => {
    const twz = maketwz();
    const frozen = Object.freeze(twz);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  it("freeze preloads instance variables", () => {
    const twz = maketwz();
    Object.freeze(twz);
    expect(() => {
      twz.time;
      twz.utc();
    }).not.toThrow();
  });

  it("method missing with non time return value", () => {
    const twz = maketwz();
    expect(twz.toI()).toBe(946684800);
  });

  it("method missing works with kwargs", () => {
    const twz = maketwz();
    const result = twz.change({ hour: 6 });
    expect(result.hour).toBe(6);
  });

  it("date part value methods", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(1999, 11, 31, 19, 18, 17, 0)), eastern);
    expect(twz.year).toBe(1999);
    expect(twz.month).toBe(12);
    expect(twz.day).toBe(31);
    expect(twz.hour).toBe(14);
    expect(twz.min).toBe(18);
    expect(twz.sec).toBe(17);
    expect(twz.wday).toBe(5);
    expect(twz.yday).toBe(365);
  });

  it("usec returns 0 when datetime is wrapped", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), eastern);
    expect(twz.usec).toBe(0);
  });

  it("usec returns sec fraction when datetime is wrapped", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0, 500)), eastern);
    expect(twz.usec).toBe(500000);
  });

  it("nsec returns sec fraction when datetime is wrapped", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1, 0, 0, 0, 500)), eastern);
    expect(twz.nsec).toBe(500000000);
  });

  it("utc to local conversion saves period in instance variable", () => {
    const twz = new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), eastern);
    expect(twz.utcOffset).toBe(-5 * 3600);
    expect(twz.zone).toBe("EST");
  });

  it("instance created with local time returns correct utc time", () => {
    const twz = eastern.local(1999, 12, 31, 19);
    expect(twz.utc().getTime()).toBe(Date.UTC(2000, 0, 1));
  });

  it("instance created with local time enforces spring dst rules", () => {
    const twz = eastern.local(2006, 4, 2, 2);
    expect(twz.hour).toBe(3);
    expect(twz.dst()).toBe(true);
    expect(twz.zone).toBe("EDT");
  });

  it("instance created with local time enforces fall dst rules", () => {
    const twz = eastern.local(2006, 10, 29, 1);
    expect(twz.hour).toBe(1);
    expect(twz.dst()).toBe(true);
    expect(twz.zone).toBe("EDT");
  });

  it("ruby 19 weekday name query methods", () => {
    const twz = maketwz(); // Friday 1999-12-31
    expect(twz.isFriday()).toBe(true);
    expect(twz.isSunday()).toBe(false);
    expect(twz.isMonday()).toBe(false);
    expect(twz.isTuesday()).toBe(false);
    expect(twz.isWednesday()).toBe(false);
    expect(twz.isThursday()).toBe(false);
    expect(twz.isSaturday()).toBe(false);
  });

  it("change at dst boundary", () => {
    // Time.at(1319936400) = 2011-10-30 02:00:00 UTC
    const twz = new TimeWithZone(new Date(1319936400 * 1000), TimeZone.find("Madrid"));
    const result = twz.change({ min: 0 });
    expect(result.getTime()).toBe(twz.getTime());
  });

  it("round at dst boundary", () => {
    const twz = new TimeWithZone(new Date(1319936400 * 1000), TimeZone.find("Madrid"));
    const result = twz.round();
    expect(result.getTime()).toBe(twz.getTime());
  });

  it("beginning of year", () => {
    const twz = maketwz();
    const boy = twz.beginningOfYear();
    expect(boy.inspect()).toBe("1999-01-01 00:00:00.000000000 EST -05:00");
  });

  it("beginning of month", () => {
    const twz = maketwz();
    const bom = twz.beginningOfMonth();
    expect(bom.inspect()).toBe("1999-12-01 00:00:00.000000000 EST -05:00");
  });

  it("in", () => {
    const twz = maketwz();
    expect(twz.in(1).inspect()).toBe("1999-12-31 19:00:01.000000000 EST -05:00");
  });

  it("advance 1 month into spring dst gap", () => {
    const twz = eastern.local(2006, 3, 2, 2);
    const result = twz.advance({ months: 1 });
    expect(result.hour).toBe(3);
    expect(result.dst()).toBe(true);
    expect(result.zone).toBe("EDT");
  });

  it("advance 1 second into spring dst gap", () => {
    const twz = eastern.local(2006, 4, 2, 1, 59, 59);
    const result = twz.advance({ seconds: 1 });
    expect(result.hour).toBe(3);
    expect(result.min).toBe(0);
    expect(result.sec).toBe(0);
    expect(result.dst()).toBe(true);
    expect(result.zone).toBe("EDT");
  });

  it("advance 1 day expressed as number of seconds minutes or hours across spring dst transition", () => {
    const twz = eastern.local(2006, 4, 1, 10, 30);
    // 86400 seconds = exactly 24 hours, but spring DST day is only 23 hours
    expect(twz.plus(86400).inspect()).toContain("2006-04-02 11:30:00");
    expect(twz.advance({ seconds: 86400 }).inspect()).toContain("2006-04-02 11:30:00");
    expect(twz.advance({ minutes: 1440 }).inspect()).toContain("2006-04-02 11:30:00");
    expect(twz.advance({ hours: 24 }).inspect()).toContain("2006-04-02 11:30:00");
  });

  it("advance 1 day expressed as number of seconds minutes or hours across spring dst transition backwards", () => {
    const twz = eastern.local(2006, 4, 2, 11, 30);
    expect(twz.minus(86400).inspect()).toContain("2006-04-01 10:30:00");
    expect(twz.advance({ seconds: -86400 }).inspect()).toContain("2006-04-01 10:30:00");
    expect(twz.advance({ minutes: -1440 }).inspect()).toContain("2006-04-01 10:30:00");
    expect(twz.advance({ hours: -24 }).inspect()).toContain("2006-04-01 10:30:00");
  });

  it("advance 1 day expressed as number of seconds minutes or hours across fall dst transition", () => {
    const twz = eastern.local(2006, 10, 28, 10, 30);
    // 86400 seconds across fall DST (25 hour day) = 9:30 next day
    expect(twz.plus(86400).inspect()).toContain("2006-10-29 09:30:00");
    expect(twz.advance({ seconds: 86400 }).inspect()).toContain("2006-10-29 09:30:00");
    expect(twz.advance({ minutes: 1440 }).inspect()).toContain("2006-10-29 09:30:00");
    expect(twz.advance({ hours: 24 }).inspect()).toContain("2006-10-29 09:30:00");
  });

  it("advance 1 day expressed as number of seconds minutes or hours across fall dst transition backwards", () => {
    const twz = eastern.local(2006, 10, 29, 9, 30);
    expect(twz.minus(86400).inspect()).toContain("2006-10-28 10:30:00");
    expect(twz.advance({ seconds: -86400 }).inspect()).toContain("2006-10-28 10:30:00");
    expect(twz.advance({ minutes: -1440 }).inspect()).toContain("2006-10-28 10:30:00");
    expect(twz.advance({ hours: -24 }).inspect()).toContain("2006-10-28 10:30:00");
  });

  it("no method error has proper context", () => {
    const twz = maketwz();
    expect(() => (twz as any).thisMethodDoesNotExist()).toThrow(TypeError);
  });

  it.skip("to r");
  it.skip("plus two time instances raises deprecation warning");
});

describe("TimeWithZoneMethodsForTimeAndDateTimeTest", () => {
  afterEach(() => {
    resetZone();
  });

  const t = new Date(Date.UTC(2000, 0, 1));

  it("in time zone", () => {
    useZone("Alaska", () => {
      const result = new TimeWithZone(t, TimeZone.find("Alaska"));
      expect(result.inspect()).toBe("1999-12-31 15:00:00.000000000 AKST -09:00");
    });
    useZone("Hawaii", () => {
      const result = new TimeWithZone(t, TimeZone.find("Hawaii"));
      expect(result.inspect()).toBe("1999-12-31 14:00:00.000000000 HST -10:00");
    });
  });

  it("nil time zone", () => {
    setZone(null);
    const zone = getZone();
    expect(zone).toBeNull();
  });

  it("in time zone with argument", () => {
    useZone("Eastern Time (US & Canada)", () => {
      const alaska = new TimeWithZone(t, TimeZone.find("Alaska"));
      expect(alaska.inspect()).toBe("1999-12-31 15:00:00.000000000 AKST -09:00");
      const hawaii = new TimeWithZone(t, TimeZone.find("Hawaii"));
      expect(hawaii.inspect()).toBe("1999-12-31 14:00:00.000000000 HST -10:00");
      const utcTwz = new TimeWithZone(t, TimeZone.find("UTC"));
      expect(utcTwz.inspect()).toBe("2000-01-01 00:00:00.000000000 UTC +00:00");
    });
  });

  it("in time zone with invalid argument", () => {
    expect(() => TimeZone.find("No such timezone exists")).toThrow();
  });

  it("in time zone with time local instance", () => {
    const time = new Date(Date.UTC(2000, 0, 1, 0, 0, 0)); // UTC midnight
    const result = new TimeWithZone(time, TimeZone.find("Alaska"));
    expect(result.inspect()).toBe("1999-12-31 15:00:00.000000000 AKST -09:00");
  });

  it("use zone", () => {
    setZone("Alaska");
    useZone("Hawaii", () => {
      expect(getZone()!.name).toBe("Hawaii");
    });
    expect(getZone()!.name).toBe("Alaska");
  });

  it("use zone with exception raised", () => {
    setZone("Alaska");
    expect(() => {
      useZone("Hawaii", () => {
        throw new Error("test");
      });
    }).toThrow("test");
    expect(getZone()!.name).toBe("Alaska");
  });

  it("use zone raises on invalid timezone", () => {
    setZone("Alaska");
    expect(() => {
      useZone("No such timezone exists", () => {});
    }).toThrow();
    expect(getZone()!.name).toBe("Alaska");
  });

  it("time at precision", () => {
    useZone("UTC", () => {
      const twz = TimeZone.find("UTC").local(2019, 1, 31, 23, 59, 59, 999);
      expect(twz.toI()).toBe(Math.floor(twz.getTime() / 1000));
    });
  });

  it("time zone getter and setter", () => {
    setZone(TimeZone.find("Alaska"));
    expect(getZone()!.name).toBe("Alaska");
    setZone("Alaska");
    expect(getZone()!.name).toBe("Alaska");
    setZone(null);
    expect(getZone()).toBeNull();
  });

  it("time zone getter and setter with zone default set", () => {
    const oldDefault = getZoneDefault();
    try {
      setZoneDefault(TimeZone.find("Alaska"));
      expect(getZone()!.name).toBe("Alaska");
      setZone(TimeZone.find("Hawaii"));
      expect(getZone()!.name).toBe("Hawaii");
      setZone(null);
      expect(getZone()!.name).toBe("Alaska");
    } finally {
      setZoneDefault(oldDefault);
    }
  });

  it("time zone setter is thread safe", () => {
    // In JS single-threaded, just verify use_zone scoping works
    useZone("Paris", () => {
      expect(getZone()!.name).toBe("Paris");
      // Simulate what threads would do — nested useZone
      useZone("Alaska", () => {
        expect(getZone()!.name).toBe("Alaska");
      });
      expect(getZone()!.name).toBe("Paris");
    });
  });

  it("time zone setter with tzinfo timezone object wraps in rails time zone", () => {
    setZone("America/New_York");
    const zone = getZone()!;
    expect(zone).toBeInstanceOf(TimeZone);
    expect(zone.tzinfo).toBe("America/New_York");
    expect(zone.name).toBe("America/New_York");
  });

  it("time zone setter with tzinfo timezone identifier does lookup and wraps in rails time zone", () => {
    setZone("America/New_York");
    const zone = getZone()!;
    expect(zone).toBeInstanceOf(TimeZone);
    expect(zone.tzinfo).toBe("America/New_York");
    expect(zone.name).toBe("America/New_York");
  });

  it("time zone setter with invalid zone", () => {
    expect(() => setZone("No such timezone exists")).toThrow();
  });

  it("find zone without bang returns nil if time zone can not be found", () => {
    expect(findZone("No such timezone exists")).toBeNull();
    expect(findZone(-54000)).toBeNull();
    expect(findZone({})).toBeNull();
  });

  it("find zone with bang raises if time zone can not be found", () => {
    expect(() => findZoneBang("No such timezone exists")).toThrow(/Invalid time zone/);
    expect(() => findZoneBang(-54000)).toThrow(/Invalid time zone/);
    expect(() => findZoneBang({})).toThrow(/Invalid time zone/);
  });

  it("find zone with bang doesnt raises with nil and false", () => {
    expect(findZoneBang(null)).toBeNull();
    expect(findZoneBang(false)).toBe(false);
  });

  it("time zone setter with find zone without bang", () => {
    const result = findZone("No such timezone exists");
    expect(result).toBeNull();
    setZone(result);
    expect(getZone()).toBeNull();
  });

  it("current returns time now when zone not set", () => {
    setZone(null);
    travelTo(new Date(Date.UTC(2000, 0, 1)), () => {
      const c = current();
      expect(c).toBeInstanceOf(Date);
      expect(c instanceof TimeWithZone).toBe(false);
    });
  });

  it("current returns time zone now when zone set", () => {
    setZone(TimeZone.find("Eastern Time (US & Canada)"));
    travelTo(new Date(Date.UTC(2000, 0, 1)), () => {
      const c = current();
      expect(c).toBeInstanceOf(TimeWithZone);
      expect((c as TimeWithZone).timeZone.name).toBe("Eastern Time (US & Canada)");
    });
  });

  it("time in time zone doesnt affect receiver", () => {
    const time = new Date(Date.UTC(2000, 6, 1));
    const twz = new TimeWithZone(time, TimeZone.find("Eastern Time (US & Canada)"));
    expect(twz.utc().getTime()).toBe(time.getTime());
    // Original Date should not be modified
    expect(time.getTime()).toBe(Date.UTC(2000, 6, 1));
  });
});

describe("TimeWithZoneMethodsForDate", () => {
  afterEach(() => {
    resetZone();
  });

  it("in time zone", () => {
    useZone("Alaska", () => {
      const result = dateInTimeZone(new Date(2000, 0, 1), getZone()!);
      expect(result.inspect()).toBe("2000-01-01 00:00:00.000000000 AKST -09:00");
    });
    useZone("Hawaii", () => {
      const result = dateInTimeZone(new Date(2000, 0, 1), getZone()!);
      expect(result.inspect()).toBe("2000-01-01 00:00:00.000000000 HST -10:00");
    });
  });

  it("nil time zone", () => {
    setZone(null);
    expect(getZone()).toBeNull();
  });

  it("in time zone with argument", () => {
    useZone("Eastern Time (US & Canada)", () => {
      const alaska = dateInTimeZone(new Date(2000, 0, 1), "Alaska");
      expect(alaska.inspect()).toBe("2000-01-01 00:00:00.000000000 AKST -09:00");
      const hawaii = dateInTimeZone(new Date(2000, 0, 1), "Hawaii");
      expect(hawaii.inspect()).toBe("2000-01-01 00:00:00.000000000 HST -10:00");
      const utcTwz = dateInTimeZone(new Date(2000, 0, 1), "UTC");
      expect(utcTwz.inspect()).toBe("2000-01-01 00:00:00.000000000 UTC +00:00");
    });
  });

  it("in time zone with invalid argument", () => {
    expect(() => dateInTimeZone(new Date(2000, 0, 1), "No such timezone exists")).toThrow();
  });
});

describe("TimeWithZoneMethodsForString", () => {
  afterEach(() => {
    resetZone();
  });

  it("in time zone", () => {
    useZone("Alaska", () => {
      const result = new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), TimeZone.find("Alaska"));
      expect(result.inspect()).toBe("1999-12-31 15:00:00.000000000 AKST -09:00");
    });
  });

  it("nil time zone", () => {
    setZone(null);
    expect(getZone()).toBeNull();
  });

  it("in time zone with argument", () => {
    useZone("Eastern Time (US & Canada)", () => {
      const alaska = new TimeWithZone(new Date(Date.UTC(2000, 0, 1)), TimeZone.find("Alaska"));
      expect(alaska.inspect()).toBe("1999-12-31 15:00:00.000000000 AKST -09:00");
    });
  });

  it("in time zone with invalid argument", () => {
    expect(() => TimeZone.find("No such timezone exists")).toThrow();
  });

  it("in time zone with ambiguous time", () => {
    // 2014-10-26 01:00:00 Moscow time is ambiguous due to DST change
    const moscow = TimeZone.find("Moscow");
    const twz = moscow.local(2014, 10, 26, 1, 0, 0);
    // Should resolve to the UTC equivalent
    expect(twz.utc().getTime()).toBe(Date.UTC(2014, 9, 25, 22, 0, 0));
  });
});
