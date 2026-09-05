import { afterEach, describe, expect, it } from "vitest";
import {
  DateTime as RubyDateTime,
  Temporal,
  Time as RubyTime,
  resetLocalTimeZoneId,
} from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../values/time-zone.js";
import "./time/calculations.js";
import { ArgumentError } from "../hash-utils.js";
import { Object as ObjectExt } from "./object/acts-like.js";
import {
  nextDay,
  prevDay,
  advance,
  ago,
  since,
  secondsSinceMidnight,
  secondsUntilEndOfDay,
  secFraction,
  floor,
  ceil,
  change,
  lastWeek,
  toDate,
  daysInMonth,
  daysInYear,
  allDay,
  isToday,
  isTomorrow,
  isYesterday,
  isPast,
  isFuture,
  nextWeek,
  nextMonth,
  prevMonth,
  nextYear,
  prevYear,
} from "../time-ext.js";
import { toFs, DATE_FORMATS, formattedOffset, xmlschema } from "./time/conversions.js";
import { toTime } from "./time/compatibility.js";
import { lastQuarter } from "./date-and-time/calculations.js";

function asDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

function d(year: number, month: number, day: number, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(year, month - 1, day, hour, min, sec, ms);
}

function dateTimeInit(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  usec = 0,
): Date {
  return new Date(year, month - 1, day, hour, minute, second, usec / 1000);
}

function utc(year: number, month = 1, day = 1, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, min, sec, ms));
}

function zoned(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  microsecond = 0,
): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from({
    timeZone,
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond: Math.floor(microsecond / 1000),
    microsecond: microsecond % 1000,
  });
}

function withEnvTz<T>(tz: string, fn: () => T): T {
  const orig = process.env.TZ;
  process.env.TZ = tz;
  resetLocalTimeZoneId();
  try {
    return fn();
  } finally {
    if (orig === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = orig;
    }
    resetLocalTimeZoneId();
  }
}

const savedTZ = process.env.TZ;
afterEach(() => {
  if (savedTZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = savedTZ;
  }
  resetLocalTimeZoneId();
});

const NSEC_999999999_OVER_1000 = new Rational(999999999, 1000);

describe("TimeExtCalculationsTest", () => {
  it("seconds since midnight", () => {
    expect(RubyTime.local(2005, 1, 1, 0, 0, 1).secondsSinceMidnight()).toBe(1);
    expect(RubyTime.local(2005, 1, 1, 0, 1, 0).secondsSinceMidnight()).toBe(60);
    expect(RubyTime.local(2005, 1, 1, 1, 1, 0).secondsSinceMidnight()).toBe(3660);
    expect(RubyTime.local(2005, 1, 1, 23, 59, 59).secondsSinceMidnight()).toBe(86399);
    expect(RubyTime.local(2005, 1, 1, 0, 1, 0, 10).secondsSinceMidnight()).toBe(60.00001);
  });

  it("seconds until end of day", () => {
    expect(RubyTime.local(2005, 1, 1, 23, 59, 59).secondsUntilEndOfDay()).toBe(0);
    expect(RubyTime.local(2005, 1, 1, 23, 59, 58).secondsUntilEndOfDay()).toBe(1);
    expect(RubyTime.local(2005, 1, 1, 23, 58, 59).secondsUntilEndOfDay()).toBe(60);
    expect(RubyTime.local(2005, 1, 1, 22, 58, 59).secondsUntilEndOfDay()).toBe(3660);
    expect(RubyTime.local(2005, 1, 1, 0, 0, 0).secondsUntilEndOfDay()).toBe(86399);
  });

  it("beginning of day", () => {
    expect(
      RubyTime.local(2005, 2, 4, 10, 10, 10).beginningOfDay().toTime().toInstant().epochNanoseconds,
    ).toBe(RubyTime.local(2005, 2, 4, 0, 0, 0).toTime().toInstant().epochNanoseconds);
    withEnvTz("US/Eastern", () => {
      expect(
        RubyTime.local(2006, 4, 2, 10, 10, 10).beginningOfDay().toTime().toInstant()
          .epochNanoseconds,
      ).toBe(RubyTime.local(2006, 4, 2, 0, 0, 0).toTime().toInstant().epochNanoseconds);
      expect(
        RubyTime.local(2006, 10, 29, 10, 10, 10).beginningOfDay().toTime().toInstant()
          .epochNanoseconds,
      ).toBe(RubyTime.local(2006, 10, 29, 0, 0, 0).toTime().toInstant().epochNanoseconds);
    });
    withEnvTz("NZ", () => {
      expect(
        RubyTime.local(2006, 3, 19, 10, 10, 10).beginningOfDay().toTime().toInstant()
          .epochNanoseconds,
      ).toBe(RubyTime.local(2006, 3, 19, 0, 0, 0).toTime().toInstant().epochNanoseconds);
      expect(
        RubyTime.local(2006, 10, 1, 10, 10, 10).beginningOfDay().toTime().toInstant()
          .epochNanoseconds,
      ).toBe(RubyTime.local(2006, 10, 1, 0, 0, 0).toTime().toInstant().epochNanoseconds);
    });
  });

  it("middle of day", () => {
    expect(
      RubyTime.local(2005, 2, 4, 10, 10, 10).middleOfDay().toTime().toInstant().epochNanoseconds,
    ).toBe(RubyTime.local(2005, 2, 4, 12, 0, 0).toTime().toInstant().epochNanoseconds);
    withEnvTz("US/Eastern", () => {
      expect(
        RubyTime.local(2006, 4, 2, 10, 10, 10).middleOfDay().toTime().toInstant().epochNanoseconds,
      ).toBe(RubyTime.local(2006, 4, 2, 12, 0, 0).toTime().toInstant().epochNanoseconds);
      expect(
        RubyTime.local(2006, 10, 29, 10, 10, 10).middleOfDay().toTime().toInstant()
          .epochNanoseconds,
      ).toBe(RubyTime.local(2006, 10, 29, 12, 0, 0).toTime().toInstant().epochNanoseconds);
    });
    withEnvTz("NZ", () => {
      expect(
        RubyTime.local(2006, 3, 19, 10, 10, 10).middleOfDay().toTime().toInstant().epochNanoseconds,
      ).toBe(RubyTime.local(2006, 3, 19, 12, 0, 0).toTime().toInstant().epochNanoseconds);
      expect(
        RubyTime.local(2006, 10, 1, 10, 10, 10).middleOfDay().toTime().toInstant().epochNanoseconds,
      ).toBe(RubyTime.local(2006, 10, 1, 12, 0, 0).toTime().toInstant().epochNanoseconds);
    });
  });

  it("beginning of hour", () => {
    expect(
      RubyTime.local(2005, 2, 4, 19, 30, 10).beginningOfHour().toTime().toInstant()
        .epochNanoseconds,
    ).toBe(RubyTime.local(2005, 2, 4, 19, 0, 0).toTime().toInstant().epochNanoseconds);
  });

  it("beginning of minute", () => {
    expect(
      RubyTime.local(2005, 2, 4, 19, 30, 10).beginningOfMinute().toTime().toInstant()
        .epochNanoseconds,
    ).toBe(RubyTime.local(2005, 2, 4, 19, 30, 0).toTime().toInstant().epochNanoseconds);
  });

  it("end of day", () => {
    expect(
      RubyTime.local(2007, 8, 12, 10, 10, 10).endOfDay().toTime().toInstant().epochNanoseconds,
    ).toBe(
      RubyTime.local(2007, 8, 12, 23, 59, 59, NSEC_999999999_OVER_1000).toTime().toInstant()
        .epochNanoseconds,
    );
    withEnvTz("US/Eastern", () => {
      expect(
        RubyTime.local(2007, 4, 2, 10, 10, 10).endOfDay().toTime().toInstant().epochNanoseconds,
      ).toBe(
        RubyTime.local(2007, 4, 2, 23, 59, 59, NSEC_999999999_OVER_1000).toTime().toInstant()
          .epochNanoseconds,
      );
      expect(
        RubyTime.local(2007, 10, 29, 10, 10, 10).endOfDay().toTime().toInstant().epochNanoseconds,
      ).toBe(
        RubyTime.local(2007, 10, 29, 23, 59, 59, NSEC_999999999_OVER_1000).toTime().toInstant()
          .epochNanoseconds,
      );
    });
    withEnvTz("NZ", () => {
      expect(
        RubyTime.local(2006, 3, 19, 10, 10, 10).endOfDay().toTime().toInstant().epochNanoseconds,
      ).toBe(
        RubyTime.local(2006, 3, 19, 23, 59, 59, NSEC_999999999_OVER_1000).toTime().toInstant()
          .epochNanoseconds,
      );
      expect(
        RubyTime.local(2006, 10, 1, 10, 10, 10).endOfDay().toTime().toInstant().epochNanoseconds,
      ).toBe(
        RubyTime.local(2006, 10, 1, 23, 59, 59, NSEC_999999999_OVER_1000).toTime().toInstant()
          .epochNanoseconds,
      );
    });
    withEnvTz("Asia/Yekaterinburg", () => {
      expect(
        RubyTime.new(2015, 2, 8, 8, 0, 0, "+05:00").endOfDay().toTime().toInstant()
          .epochNanoseconds,
      ).toBe(
        RubyTime.local(2015, 2, 8, 23, 59, 59, NSEC_999999999_OVER_1000).toTime().toInstant()
          .epochNanoseconds,
      );
    });
  });

  it("end of hour", () => {
    expect(
      RubyTime.local(2005, 2, 4, 19, 30, 10).endOfHour().toTime().toInstant().epochNanoseconds,
    ).toBe(
      RubyTime.local(2005, 2, 4, 19, 59, 59, NSEC_999999999_OVER_1000).toTime().toInstant()
        .epochNanoseconds,
    );
  });

  it("end of minute", () => {
    expect(
      RubyTime.local(2005, 2, 4, 19, 30, 10).endOfMinute().toTime().toInstant().epochNanoseconds,
    ).toBe(
      RubyTime.local(2005, 2, 4, 19, 30, 59, NSEC_999999999_OVER_1000).toTime().toInstant()
        .epochNanoseconds,
    );
  });

  it("seconds since midnight at daylight savings time start", () => {
    withEnvTz("America/New_York", () => {
      expect(secondsSinceMidnight(new Date(2005, 3, 3, 1, 59, 59))).toBe(2 * 3600 - 1);
      expect(secondsSinceMidnight(new Date(2005, 3, 3, 3, 0, 1))).toBe(2 * 3600 + 1);
    });
  });

  it("seconds since midnight at daylight savings time end", () => {
    withEnvTz("America/New_York", () => {
      expect(secondsSinceMidnight(new Date(2005, 9, 30, 0, 59, 59))).toBe(1 * 3600 - 1);
    });
  });

  it("seconds until end of day at daylight savings time start", () => {
    withEnvTz("America/New_York", () => {
      expect(secondsUntilEndOfDay(new Date(2005, 3, 3, 1, 59, 59))).toBe(21 * 3600);
      expect(secondsUntilEndOfDay(new Date(2005, 3, 3, 3, 0, 1))).toBe(21 * 3600 - 2);
    });
  });

  it("seconds until end of day at daylight savings time end", () => {
    withEnvTz("America/New_York", () => {
      expect(secondsUntilEndOfDay(new Date(2005, 9, 30, 0, 59, 59))).toBe(24 * 3600);
    });
  });

  it("sec fraction", () => {
    const t = d(2005, 2, 4, 10, 10, 10, 500);
    expect(secFraction(t)).toBeCloseTo(0.5, 2);
  });

  it("floor", () => {
    const t = new Date(2005, 1, 4, 10, 10, 10, 500);
    const result = asDate(floor(t, 1000));
    expect(result.getMilliseconds()).toBe(0);
    expect(result.getSeconds()).toBe(10);
  });

  it("ceil", () => {
    const t = new Date(2005, 1, 4, 10, 10, 10, 1);
    const result = asDate(ceil(t, 1000));
    expect(result.getMilliseconds()).toBe(0);
    expect(result.getSeconds()).toBe(11);
  });

  it("daylight savings time crossings backward start", () => {
    withEnvTz("America/New_York", () => {
      const dt = new Date(2005, 3, 3, 4, 18, 0);
      const result = asDate(ago(dt, 86400));
      expect(result.getFullYear()).toBe(2005);
      expect(result.getMonth()).toBe(3);
      expect(result.getDate()).toBe(2);
      expect(result.getHours()).toBe(3);
      expect(result.getMinutes()).toBe(18);
    });
  });

  it("daylight savings time crossings backward end", () => {
    withEnvTz("America/New_York", () => {
      const st = new Date(2005, 9, 30, 4, 3, 0);
      const result = asDate(ago(st, 86400));
      expect(result.getFullYear()).toBe(2005);
      expect(result.getMonth()).toBe(9);
      expect(result.getDate()).toBe(29);
      expect(result.getHours()).toBe(5);
      expect(result.getMinutes()).toBe(3);
    });
  });

  it("daylight savings time crossings backward start 1day", () => {
    withEnvTz("America/New_York", () => {
      const dt = new Date(2005, 3, 3, 4, 18, 0);
      const result = asDate(advance(dt, { days: -1 }));
      expect(result.getDate()).toBe(2);
      expect(result.getHours()).toBe(4);
      expect(result.getMinutes()).toBe(18);
    });
  });

  it("daylight savings time crossings backward end 1day", () => {
    withEnvTz("America/New_York", () => {
      const st = new Date(2005, 9, 30, 4, 3, 0);
      const result = asDate(advance(st, { days: -1 }));
      expect(result.getDate()).toBe(29);
      expect(result.getHours()).toBe(4);
      expect(result.getMinutes()).toBe(3);
    });
  });

  it("since with instance of time deprecated", () => {
    const t = d(2005, 2, 22, 10, 10, 10);
    expect(asDate(since(t, 1))).toEqual(d(2005, 2, 22, 10, 10, 11));
  });

  it("daylight savings time crossings forward start", () => {
    withEnvTz("America/New_York", () => {
      const st = new Date(2005, 3, 2, 19, 27, 0);
      const result = asDate(since(st, 86400));
      expect(result.getMonth()).toBe(3);
      expect(result.getDate()).toBe(3);
      expect(result.getHours()).toBe(20);
      expect(result.getMinutes()).toBe(27);
    });
  });

  it("daylight savings time crossings forward start 1day", () => {
    withEnvTz("America/New_York", () => {
      const st = new Date(2005, 3, 2, 19, 27, 0);
      const result = asDate(advance(st, { days: 1 }));
      expect(result.getDate()).toBe(3);
      expect(result.getHours()).toBe(19);
      expect(result.getMinutes()).toBe(27);
    });
  });

  it("daylight savings time crossings forward start tomorrow", () => {
    withEnvTz("America/New_York", () => {
      const st = new Date(2005, 3, 2, 19, 27, 0);
      const result = asDate(nextDay(st));
      expect(result.getDate()).toBe(3);
      expect(result.getHours()).toBe(19);
      expect(result.getMinutes()).toBe(27);
    });
  });

  it("daylight savings time crossings backward start yesterday", () => {
    withEnvTz("America/New_York", () => {
      const dt = new Date(2005, 3, 3, 19, 27, 0);
      const result = asDate(prevDay(dt));
      expect(result.getDate()).toBe(2);
      expect(result.getHours()).toBe(19);
      expect(result.getMinutes()).toBe(27);
    });
  });

  it("daylight savings time crossings forward end", () => {
    withEnvTz("America/New_York", () => {
      const dt = new Date(2005, 9, 30, 0, 45, 0);
      const result = asDate(since(dt, 86400));
      expect(result.getDate()).toBe(30);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(45);
    });
  });

  it("daylight savings time crossings forward end 1day", () => {
    withEnvTz("America/New_York", () => {
      const dt = new Date(2005, 9, 30, 0, 45, 0);
      const result = asDate(advance(dt, { days: 1 }));
      expect(result.getDate()).toBe(31);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(45);
    });
  });

  it("daylight savings time crossings forward end tomorrow", () => {
    withEnvTz("America/New_York", () => {
      const dt = new Date(2005, 9, 30, 0, 45, 0);
      const result = asDate(nextDay(dt));
      expect(result.getDate()).toBe(31);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(45);
    });
  });

  it("daylight savings time crossings backward end yesterday", () => {
    withEnvTz("America/New_York", () => {
      const st = new Date(2005, 9, 31, 0, 45, 0);
      const result = asDate(prevDay(st));
      expect(result.getDate()).toBe(30);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(45);
    });
  });

  it("change", () => {
    expect(asDate(change(d(2005, 2, 22, 15, 15, 10), { year: 2006 }))).toEqual(
      d(2006, 2, 22, 15, 15, 10),
    );
    expect(asDate(change(d(2005, 2, 22, 15, 15, 10), { month: 6 }))).toEqual(
      d(2005, 6, 22, 15, 15, 10),
    );
    expect(asDate(change(d(2005, 2, 22, 15, 15, 10), { year: 2012, month: 9 }))).toEqual(
      d(2012, 9, 22, 15, 15, 10),
    );
    expect(asDate(change(d(2005, 2, 22, 15, 15, 10), { hour: 16 }))).toEqual(
      d(2005, 2, 22, 16, 0, 0),
    );
    expect(asDate(change(d(2005, 2, 22, 15, 15, 10), { min: 45 }))).toEqual(
      d(2005, 2, 22, 15, 45, 0),
    );

    expect(() => change(d(2005, 1, 2, 11, 22, 33, 8), { usec: 1, nsec: 1 })).toThrow(ArgumentError);
    expect(() => change(d(2005, 1, 2, 11, 22, 33, 8), { usec: 1, nsec: 1 })).toThrow(
      "Can't change both :nsec and :usec at the same time: {usec: 1, nsec: 1}",
    );
    expect(() => change(zoned("+03:00", 2015, 5, 9, 10, 0, 0), { nsec: 999999999 })).not.toThrow();
  });

  it("utc change", () => {
    const t1 = utc(2005, 2, 22, 15, 15, 10);
    const result = asDate(change(t1, { year: 2006 }));
    expect(result.getFullYear()).toBe(2006);

    const t2 = zoned("UTC", 2005, 1, 2, 11, 22, 33, 2);
    const changed = change(t2, { nsec: 8000 });
    expect(changed.timeZoneId).toBe("UTC");
    expect(changed.millisecond * 1000 + changed.microsecond).toBe(8);
  });

  it("offset change", () => {
    const t = zoned("-08:00", 2005, 2, 22, 15, 15, 10);
    expect(change(t, { year: 2006 }).equals(zoned("-08:00", 2006, 2, 22, 15, 15, 10))).toBe(true);
    expect(change(t, { month: 6 }).equals(zoned("-08:00", 2005, 6, 22, 15, 15, 10))).toBe(true);
    expect(change(t, { hour: 16 }).equals(zoned("-08:00", 2005, 2, 22, 16, 0, 0))).toBe(true);
    expect(change(t, { hour: 16, min: 45 }).equals(zoned("-08:00", 2005, 2, 22, 16, 45, 0))).toBe(
      true,
    );

    const t2 = zoned("-08:00", 2005, 2, 22, 15, 15, 0);
    const withUsec = change(t2, { usec: 10 });
    expect(withUsec.millisecond * 1000 + withUsec.microsecond).toBe(10);
    expect(change(t2, { nsec: 10 }).nanosecond).toBe(10);
    expect(() => change(t2, { usec: 1000000 })).toThrow(ArgumentError);
    expect(() => change(t2, { nsec: 1000000000 })).toThrow(ArgumentError);
  });

  it("change offset", () => {
    expect(
      change(zoned("+01:00", 2006, 2, 22, 15, 15, 10), { offset: "-08:00" }).equals(
        zoned("-08:00", 2006, 2, 22, 15, 15, 10),
      ),
    ).toBe(true);
    expect(
      change(zoned("+01:00", 2006, 2, 22, 15, 15, 10), { offset: -28800 }).equals(
        zoned("-08:00", 2006, 2, 22, 15, 15, 10),
      ),
    ).toBe(true);
    expect(() =>
      change(zoned("+01:00", 2005, 2, 22, 15, 15, 45), { usec: 1000000, offset: "-08:00" }),
    ).toThrow(ArgumentError);
    expect(() =>
      change(zoned("+01:00", 2005, 2, 22, 15, 15, 45), { nsec: 1000000000, offset: -28800 }),
    ).toThrow(ArgumentError);
  });

  it("change preserves offset for local times around end of dst", () => {
    withEnvTz("US/Eastern", () => {
      const midnight = RubyTime.local(2005, 10, 30, 0, 0, 0);
      const oneAm1 = RubyTime.local(0, 0, 1, 30, 10, 2005, null, null, true, null);
      const oneAm2 = RubyTime.local(2005, 10, 30, 1, 0, 0);
      const twoAm = RubyTime.local(2005, 10, 30, 2, 0, 0);
      expect(oneAm1.toTime().epochNanoseconds).toBeLessThan(oneAm2.toTime().epochNanoseconds);

      const at = (time: RubyTime): bigint => time.toTime().epochNanoseconds;
      const second = 1_000_000_000n;

      expect(at(change(midnight, { hour: 1 }))).toBe(at(oneAm1));
      expect(at(change(midnight, { hour: 2 }))).toBe(at(twoAm));

      expect(at(change(oneAm1, { hour: 0 }))).toBe(at(midnight));
      expect(at(change(oneAm1, { hour: 1 }))).toBe(at(oneAm1));
      expect(at(change(oneAm1, { sec: 1 }))).toBe(at(oneAm1) + second);
      expect(at(change(oneAm1, { hour: 2 }))).toBe(at(twoAm));

      expect(at(change(oneAm2, { hour: 0 }))).toBe(at(midnight));
      expect(at(change(oneAm2, { hour: 1 }))).toBe(at(oneAm2));
      expect(at(change(oneAm2, { sec: 1 }))).toBe(at(oneAm2) + second);
      expect(at(change(oneAm2, { hour: 2 }))).toBe(at(twoAm));

      expect(at(change(twoAm, { hour: 1 }))).toBe(at(oneAm2));
      expect(at(change(twoAm, { hour: 0 }))).toBe(at(midnight));
    });
  });

  it("change preserves offset for zoned times around end of dst", () => {
    const midnight = zoned("US/Eastern", 2005, 10, 30, 0, 0, 0);
    const oneAm1 = zoned("US/Eastern", 2005, 10, 30, 1, 0, 0);
    const oneAm2 = zoned("US/Eastern", 2005, 10, 30, 2, 0, 0).subtract({ seconds: 3600 });
    const twoAm = zoned("US/Eastern", 2005, 10, 30, 2, 0, 0);
    expect(Temporal.ZonedDateTime.compare(oneAm1, oneAm2)).toBe(-1);

    expect(change(midnight, { hour: 1 }).equals(oneAm1)).toBe(true);
    expect(change(midnight, { hour: 2 }).equals(twoAm)).toBe(true);

    expect(change(oneAm1, { hour: 0 }).equals(midnight)).toBe(true);
    expect(change(oneAm1, { hour: 1 }).equals(oneAm1)).toBe(true);
    expect(change(oneAm1, { sec: 1 }).equals(oneAm1.add({ seconds: 1 }))).toBe(true);
    expect(change(oneAm1, { hour: 2 }).equals(twoAm)).toBe(true);

    expect(change(oneAm2, { hour: 0 }).equals(midnight)).toBe(true);
    expect(change(oneAm2, { hour: 1 }).equals(oneAm2)).toBe(true);
    expect(change(oneAm2, { sec: 1 }).equals(oneAm2.add({ seconds: 1 }))).toBe(true);
    expect(change(oneAm2, { hour: 2 }).equals(twoAm)).toBe(true);

    expect(change(twoAm, { hour: 1 }).equals(oneAm2)).toBe(true);
    expect(change(twoAm, { hour: 0 }).equals(midnight)).toBe(true);
  });

  it("change preserves fractional seconds on zoned time", () => {
    const time = zoned("US/Eastern", 2005, 10, 30, 0, 0, 0).add({ milliseconds: 990 });
    const time2 = change(time, { month: 1 });

    expect(time.offset).toBe("-04:00");
    expect(time.millisecond).toBe(990);
    expect(time2.offset).toBe("-05:00");
    expect(time2.millisecond).toBe(990);
    expect([time2.year, time2.month, time2.day]).toEqual([2005, 1, 30]);
  });

  it("change preserves fractional hour offset for local times around end of dst", () => {
    withEnvTz("Australia/Lord_Howe", () => {
      const oneAm = RubyTime.local(2005, 3, 27, 1, 0, 0);
      const one30Am1 = RubyTime.local(0, 30, 1, 27, 3, 2005, null, null, true, null);
      const one30Am2 = RubyTime.local(2005, 3, 27, 1, 30, 0);
      const twoAm = RubyTime.local(2005, 3, 27, 2, 0, 0);
      expect(one30Am1.toTime().epochNanoseconds).toBeLessThan(one30Am2.toTime().epochNanoseconds);

      const at = (time: RubyTime): bigint => time.toTime().epochNanoseconds;
      const second = 1_000_000_000n;

      expect(at(change(oneAm, { min: 30 }))).toBe(at(one30Am1));
      expect(at(change(oneAm, { hour: 2 }))).toBe(at(twoAm));

      expect(at(change(one30Am1, { min: 0 }))).toBe(at(oneAm));
      expect(at(change(one30Am1, { min: 30 }))).toBe(at(one30Am1));
      expect(at(change(one30Am1, { min: 30, sec: 1 }))).toBe(at(one30Am1) + second);
      expect(at(change(one30Am1, { hour: 2 }))).toBe(at(twoAm));

      expect(at(change(one30Am2, { min: 0 }))).toBe(at(oneAm));
      expect(at(change(one30Am2, { min: 30 }))).toBe(at(one30Am2));
      expect(at(change(one30Am2, { min: 30, sec: 1 }))).toBe(at(one30Am2) + second);
      expect(at(change(one30Am2, { hour: 2 }))).toBe(at(twoAm));

      expect(at(change(twoAm, { hour: 1, min: 30 }))).toBe(at(one30Am2));
      expect(at(change(twoAm, { hour: 1 }))).toBe(at(oneAm));
    });
  });

  it("change preserves fractional hour offset for zoned times around end of dst", () => {
    const tz = "Australia/Lord_Howe";
    const oneAm = zoned(tz, 2005, 3, 27, 1, 0, 0);
    const one30Am1 = zoned(tz, 2005, 3, 27, 1, 30, 0);
    const one30Am2 = zoned(tz, 2005, 3, 27, 2, 0, 0).subtract({ seconds: 1800 });
    const twoAm = zoned(tz, 2005, 3, 27, 2, 0, 0);
    expect(Temporal.ZonedDateTime.compare(one30Am1, one30Am2)).toBe(-1);

    expect(change(oneAm, { min: 30 }).equals(one30Am1)).toBe(true);
    expect(change(oneAm, { hour: 2 }).equals(twoAm)).toBe(true);

    expect(change(one30Am1, { min: 0 }).equals(oneAm)).toBe(true);
    expect(change(one30Am1, { min: 30 }).equals(one30Am1)).toBe(true);
    expect(change(one30Am1, { min: 30, sec: 1 }).equals(one30Am1.add({ seconds: 1 }))).toBe(true);
    expect(change(one30Am1, { hour: 2 }).equals(twoAm)).toBe(true);

    expect(change(one30Am2, { min: 0 }).equals(oneAm)).toBe(true);
    expect(change(one30Am2, { min: 30 }).equals(one30Am2)).toBe(true);
    expect(change(one30Am2, { min: 30, sec: 1 }).equals(one30Am2.add({ seconds: 1 }))).toBe(true);
    expect(change(one30Am2, { hour: 2 }).equals(twoAm)).toBe(true);

    expect(change(twoAm, { hour: 1, min: 30 }).equals(one30Am2)).toBe(true);
    expect(change(twoAm, { hour: 1 }).equals(oneAm)).toBe(true);
  });

  it("utc advance", () => {
    const t = utc(2005, 2, 22, 15, 15, 10);
    expect(asDate(advance(t, { years: 1 })).getUTCFullYear()).toBe(2006);
    expect(asDate(advance(t, { months: 4 })).getUTCMonth()).toBe(5);
    expect(asDate(advance(t, { hours: 5 })).getUTCHours()).toBe(20);
    expect(asDate(advance(t, { minutes: 7 })).getUTCMinutes()).toBe(22);
    expect(asDate(advance(t, { seconds: 9 })).getUTCSeconds()).toBe(19);
  });

  it("offset advance", () => {
    const t = d(2005, 2, 22, 15, 15, 10);
    expect(asDate(advance(t, { years: 1 })).getFullYear()).toBe(2006);
    expect(asDate(advance(t, { months: 4 })).getMonth()).toBe(5);
    expect(asDate(advance(t, { hours: 5 })).getHours()).toBe(20);
    expect(asDate(advance(t, { minutes: 7 })).getMinutes()).toBe(22);
    expect(asDate(advance(t, { seconds: 9 })).getSeconds()).toBe(19);
  });

  it("advance with nsec", () => {
    const t = new Date(108.635108);
    const result = advance(t, { months: 0 });
    expect(result.epochMilliseconds).toBe(t.getTime());
  });

  it("advance gregorian proleptic", () => {
    expect(asDate(advance(d(1582, 10, 15, 15, 15, 10), { days: -1 })).getDate()).toBe(14);
    expect(asDate(advance(d(1582, 10, 14, 15, 15, 10), { days: 1 })).getDate()).toBe(15);
  });

  it("advance preserves offset for local times around end of dst", () => {
    withEnvTz("US/Eastern", () => {
      const midnight = RubyTime.local(2005, 10, 30, 0, 0, 0);
      const oneAm1 = RubyTime.local(2005, 10, 30, 0, 59, 59).plus(1);
      const oneAm2 = RubyTime.local(2005, 10, 30, 1, 0, 0);
      const twoAm = RubyTime.local(2005, 10, 30, 2, 0, 0);
      expect(oneAm1.toTime().epochNanoseconds).toBeLessThan(oneAm2.toTime().epochNanoseconds);

      const at = (time: RubyTime): bigint => time.toTime().epochNanoseconds;
      const second = 1_000_000_000n;

      expect(at(advance(midnight, { hours: 1 }))).toBe(at(oneAm1));
      expect(at(advance(midnight, { hours: 2 }))).toBe(at(oneAm2));
      expect(at(advance(midnight, { hours: 3 }))).toBe(at(twoAm));

      expect(at(advance(oneAm1, { hours: -1 }))).toBe(at(midnight));
      expect(at(advance(oneAm1, { seconds: 0 }))).toBe(at(oneAm1));
      expect(at(advance(oneAm1, { seconds: 1 }))).toBe(at(oneAm1) + second);
      expect(at(advance(oneAm1, { hours: 1 }))).toBe(at(oneAm2));
      expect(at(advance(oneAm1, { hours: 2 }))).toBe(at(twoAm));

      expect(at(advance(oneAm2, { hours: -2 }))).toBe(at(midnight));
      expect(at(advance(oneAm2, { hours: -1 }))).toBe(at(oneAm1));
      expect(at(advance(oneAm2, { seconds: 0 }))).toBe(at(oneAm2));
      expect(at(advance(oneAm2, { seconds: 1 }))).toBe(at(oneAm2) + second);
      expect(at(advance(oneAm2, { hours: 1 }))).toBe(at(twoAm));

      expect(at(advance(twoAm, { hours: -1 }))).toBe(at(oneAm2));
      expect(at(advance(twoAm, { hours: -2 }))).toBe(at(oneAm1));
      expect(at(advance(twoAm, { hours: -3 }))).toBe(at(midnight));
    });
  });

  it("advance preserves offset for zoned times around end of dst", () => {
    const midnight = zoned("US/Eastern", 2005, 10, 30, 0, 0, 0);
    const oneAm1 = zoned("US/Eastern", 2005, 10, 30, 1, 0, 0);
    const oneAm2 = zoned("US/Eastern", 2005, 10, 30, 2, 0, 0).subtract({ seconds: 3600 });
    const twoAm = zoned("US/Eastern", 2005, 10, 30, 2, 0, 0);
    expect(oneAm1.epochNanoseconds).toBeLessThan(oneAm2.epochNanoseconds);

    expect(advance(midnight, { hours: 1 }).equals(oneAm1)).toBe(true);
    expect(advance(midnight, { hours: 2 }).equals(oneAm2)).toBe(true);
    expect(advance(midnight, { hours: 3 }).equals(twoAm)).toBe(true);

    expect(advance(oneAm1, { hours: -1 }).equals(midnight)).toBe(true);
    expect(advance(oneAm1, { seconds: 0 }).equals(oneAm1)).toBe(true);
    expect(advance(oneAm1, { seconds: 1 }).equals(oneAm1.add({ seconds: 1 }))).toBe(true);
    expect(advance(oneAm1, { hours: 1 }).equals(oneAm2)).toBe(true);
    expect(advance(oneAm1, { hours: 2 }).equals(twoAm)).toBe(true);

    expect(advance(oneAm2, { hours: -2 }).equals(midnight)).toBe(true);
    expect(advance(oneAm2, { hours: -1 }).equals(oneAm1)).toBe(true);
    expect(advance(oneAm2, { seconds: 0 }).equals(oneAm2)).toBe(true);
    expect(advance(oneAm2, { seconds: 1 }).equals(oneAm2.add({ seconds: 1 }))).toBe(true);
    expect(advance(oneAm2, { hours: 1 }).equals(twoAm)).toBe(true);

    expect(advance(twoAm, { hours: -1 }).equals(oneAm2)).toBe(true);
    expect(advance(twoAm, { hours: -2 }).equals(oneAm1)).toBe(true);
    expect(advance(twoAm, { hours: -3 }).equals(midnight)).toBe(true);
  });

  it("advance preserves fractional hour offset for local times around end of dst", () => {
    withEnvTz("Australia/Lord_Howe", () => {
      const oneAm = RubyTime.local(2005, 3, 27, 1, 0, 0);
      const one30Am1 = RubyTime.local(2005, 3, 27, 1, 29, 59).plus(1);
      const one30Am2 = RubyTime.local(2005, 3, 27, 1, 30, 0);
      const twoAm = RubyTime.local(2005, 3, 27, 2, 0, 0);
      expect(one30Am1.toTime().epochNanoseconds).toBeLessThan(one30Am2.toTime().epochNanoseconds);

      const at = (time: RubyTime): bigint => time.toTime().epochNanoseconds;
      const second = 1_000_000_000n;

      expect(at(advance(oneAm, { minutes: 30 }))).toBe(at(one30Am1));
      expect(at(advance(oneAm, { minutes: 60 }))).toBe(at(one30Am2));
      expect(at(advance(oneAm, { minutes: 90 }))).toBe(at(twoAm));

      expect(at(advance(one30Am1, { minutes: -30 }))).toBe(at(oneAm));
      expect(at(advance(one30Am1, { seconds: 0 }))).toBe(at(one30Am1));
      expect(at(advance(one30Am1, { seconds: 1 }))).toBe(at(one30Am1) + second);
      expect(at(advance(one30Am1, { minutes: 30 }))).toBe(at(one30Am2));
      expect(at(advance(one30Am1, { minutes: 60 }))).toBe(at(twoAm));

      expect(at(advance(one30Am2, { minutes: -60 }))).toBe(at(oneAm));
      expect(at(advance(one30Am2, { minutes: -30 }))).toBe(at(one30Am1));
      expect(at(advance(one30Am2, { seconds: 0 }))).toBe(at(one30Am2));
      expect(at(advance(one30Am2, { seconds: 1 }))).toBe(at(one30Am2) + second);
      expect(at(advance(one30Am2, { minutes: 30 }))).toBe(at(twoAm));

      expect(at(advance(twoAm, { minutes: -30 }))).toBe(at(one30Am2));
      expect(at(advance(twoAm, { minutes: -60 }))).toBe(at(one30Am1));
      expect(at(advance(twoAm, { minutes: -90 }))).toBe(at(oneAm));
    });
  });

  it("advance preserves fractional hour offset for zoned times around end of dst", () => {
    const tz = "Australia/Lord_Howe";
    const oneAm = zoned(tz, 2005, 3, 27, 1, 0, 0);
    const one30Am1 = zoned(tz, 2005, 3, 27, 1, 30, 0);
    const one30Am2 = zoned(tz, 2005, 3, 27, 2, 0, 0).subtract({ seconds: 1800 });
    const twoAm = zoned(tz, 2005, 3, 27, 2, 0, 0);
    expect(one30Am1.epochNanoseconds).toBeLessThan(one30Am2.epochNanoseconds);

    expect(advance(oneAm, { minutes: 30 }).equals(one30Am1)).toBe(true);
    expect(advance(oneAm, { minutes: 60 }).equals(one30Am2)).toBe(true);
    expect(advance(oneAm, { minutes: 90 }).equals(twoAm)).toBe(true);

    expect(advance(one30Am1, { minutes: -30 }).equals(oneAm)).toBe(true);
    expect(advance(one30Am1, { seconds: 0 }).equals(one30Am1)).toBe(true);
    expect(advance(one30Am1, { seconds: 1 }).equals(one30Am1.add({ seconds: 1 }))).toBe(true);
    expect(advance(one30Am1, { minutes: 30 }).equals(one30Am2)).toBe(true);
    expect(advance(one30Am1, { minutes: 60 }).equals(twoAm)).toBe(true);

    expect(advance(one30Am2, { minutes: -60 }).equals(oneAm)).toBe(true);
    expect(advance(one30Am2, { minutes: -30 }).equals(one30Am1)).toBe(true);
    expect(advance(one30Am2, { seconds: 0 }).equals(one30Am2)).toBe(true);
    expect(advance(one30Am2, { seconds: 1 }).equals(one30Am2.add({ seconds: 1 }))).toBe(true);
    expect(advance(one30Am2, { minutes: 30 }).equals(twoAm)).toBe(true);

    expect(advance(twoAm, { minutes: -30 }).equals(one30Am2)).toBe(true);
    expect(advance(twoAm, { minutes: -60 }).equals(one30Am1)).toBe(true);
    expect(advance(twoAm, { minutes: -90 }).equals(oneAm)).toBe(true);
  });

  it("last week", () => {
    withEnvTz("America/New_York", () => {
      const result = asDate(lastWeek(new Date(2005, 2, 1, 15, 15, 10), "monday"));
      expect(result.getDay()).toBe(1);
      expect(result.getDate()).toBe(21);
    });
  });

  it("next week near daylight start", () => {
    withEnvTz("America/New_York", () => {
      const result = asDate(nextWeek(new Date(2006, 3, 2, 23, 1, 0), "monday"));
      expect(result.getDate()).toBe(3);
      expect(result.getMonth()).toBe(3);
    });
  });

  it("next week near daylight end", () => {
    withEnvTz("America/New_York", () => {
      const result = asDate(nextWeek(new Date(2006, 9, 29, 23, 1, 0), "monday"));
      expect(result.getDate()).toBe(30);
      expect(result.getMonth()).toBe(9);
    });
  });

  it("to fs", () => {
    // boundary: a JS `Date` is Rails' `Time.utc` receiver here, and carries
    const time = utc(2005, 2, 21, 17, 44, 30, 123);
    expect(toFs(time, "doesnt_exist")).toBe("2005-02-21 17:44:30 UTC");
    expect(toFs(time, "db")).toBe("2005-02-21 17:44:30");
    expect(toFs(time, "short")).toBe("21 Feb 17:44");
    expect(toFs(time, "time")).toBe("17:44");
    expect(toFs(time, "number")).toBe("20050221174430");
    expect(toFs(time, "nsec")).toBe("20050221174430123000000");
    expect(toFs(time, "usec")).toBe("20050221174430123000");
    expect(toFs(time, "long")).toBe("February 21, 2005 17:44");
    expect(toFs(time, "long_ordinal")).toBe("February 21st, 2005 17:44");
    expect(toFs(time, "rfc822")).toBe("Mon, 21 Feb 2005 17:44:30 +0000");
    expect(toFs(time, "rfc2822")).toBe("Mon, 21 Feb 2005 17:44:30 -0000");
    expect(toFs(time, "inspect")).toBe("2005-02-21 17:44:30.123000000 +0000");
    expect(toFs(time, "iso8601")).toBe("2005-02-21T17:44:30Z");
  });

  it("to fs custom date format", () => {
    DATE_FORMATS.custom = "%Y%m%d%H%M%S";
    try {
      expect(toFs(utc(2005, 2, 21, 14, 30, 0), "custom")).toBe("20050221143000");
    } finally {
      delete DATE_FORMATS.custom;
    }
  });

  it("rfc3339 with fractional seconds", () => {
    const t = new Date(1999, 11, 31, 19, 0, 0, 125);
    const result = xmlschema(t);
    expect(result).toContain(".125");
  });

  it("to date", () => {
    const t = d(2005, 2, 21, 17, 44, 30);
    const result = toDate(t);
    expect(result.year).toBe(2005);
    expect(result.month).toBe(2);
    expect(result.day).toBe(21);
  });

  it("to datetime", () => {
    const t = new RubyTime(2005, 2, 21, 17, 44, 30, 3600);
    const result = toTime(t);
    expect(result.epochNanoseconds).toBe(t.toTime().epochNanoseconds);
  });

  it("to time", () => {
    const t = new RubyTime(2005, 2, 21, 17, 44, 30, 3600);
    const result = toTime(t);
    expect(result.epochNanoseconds).toBe(t.toTime().epochNanoseconds);
  });

  it("fp inaccuracy ticket 1836", () => {
    const t = d(2005, 2, 21, 0, 0, 0);
    const result = advance(t, { seconds: 0.1 });
    expect(typeof result.epochMilliseconds).toBe("number");
  });

  it("days in month with year", () => {
    expect(daysInMonth(1, 2005)).toBe(31);
    expect(daysInMonth(2, 2005)).toBe(28);
    expect(daysInMonth(2, 2004)).toBe(29);
    expect(daysInMonth(2, 2000)).toBe(29);
    expect(daysInMonth(2, 1900)).toBe(28);
    expect(daysInMonth(3, 2005)).toBe(31);
    expect(daysInMonth(4, 2005)).toBe(30);
    expect(daysInMonth(5, 2005)).toBe(31);
    expect(daysInMonth(6, 2005)).toBe(30);
    expect(daysInMonth(7, 2005)).toBe(31);
    expect(daysInMonth(8, 2005)).toBe(31);
    expect(daysInMonth(9, 2005)).toBe(30);
    expect(daysInMonth(10, 2005)).toBe(31);
    expect(daysInMonth(11, 2005)).toBe(30);
    expect(daysInMonth(12, 2005)).toBe(31);
  });

  it("days in month feb in common year without year arg", () => {
    expect(daysInMonth(2, 2007)).toBe(28);
  });

  it("days in month feb in leap year without year arg", () => {
    expect(daysInMonth(2, 2008)).toBe(29);
  });

  it("days in year with year", () => {
    expect(daysInYear(2005)).toBe(365);
    expect(daysInYear(2004)).toBe(366);
    expect(daysInYear(2000)).toBe(366);
    expect(daysInYear(1900)).toBe(365);
  });

  it("days in year in common year without year arg", () => {
    expect(daysInYear(2007)).toBe(365);
  });

  it("days in year in leap year without year arg", () => {
    expect(daysInYear(2008)).toBe(366);
  });

  it("xmlschema is available", () => {
    const result = xmlschema(new Date());
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("today with time local", () => {
    const t = new Date();
    expect(isToday(t)).toBe(true);
  });

  it("today with time utc", () => {
    const t = new Date();
    expect(isToday(t)).toBe(true);
  });

  it("yesterday with time local", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it("yesterday with time utc", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it("prev day with time utc", () => {
    const t = new Date();
    const result = asDate(prevDay(t));
    expect(result < t).toBe(true);
  });

  it("tomorrow with time local", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it("tomorrow with time utc", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it("next day with time utc", () => {
    const t = new Date();
    const result = asDate(nextDay(t));
    expect(result > t).toBe(true);
  });

  it("past with time current as time local", () => {
    const past = new Date(Date.now() - 10000);
    expect(isPast(past)).toBe(true);
    const future = new Date(Date.now() + 100000);
    expect(isPast(future)).toBe(false);
  });

  it("past with time current as time with zone", () => {
    const past = new Date(Date.now() - 10000);
    expect(isPast(past)).toBe(true);
  });

  it("future with time current as time local", () => {
    const future = new Date(Date.now() + 10000);
    expect(isFuture(future)).toBe(true);
    const past = new Date(Date.now() - 100000);
    expect(isFuture(past)).toBe(false);
  });

  it("future with time current as time with zone", () => {
    const future = new Date(Date.now() + 10000);
    expect(isFuture(future)).toBe(true);
  });

  it("acts like time", () => {
    expect(ObjectExt.actsLike(RubyTime.now(), "time")).toBe(true);
  });

  it("formatted offset with utc", () => {
    withEnvTz("UTC", () => {
      const t = new Date(2000, 0, 1);
      expect(formattedOffset(t)).toBe("+00:00");
    });
  });

  it("formatted offset with local", () => {
    withEnvTz("America/New_York", () => {
      const t = new Date(2000, 0, 1);
      expect(formattedOffset(t)).toBe("-05:00");
      const t2 = new Date(2000, 6, 1);
      expect(formattedOffset(t2)).toBe("-04:00");
    });
  });

  it("compare with time", () => {
    const t1 = utc(2000);
    const t2 = utc(1999, 12, 31, 23, 59, 59);
    expect(t1.getTime()).toBeGreaterThan(t2.getTime());
    const t3 = utc(2000, 1, 1, 0, 0, 0);
    expect(t1.getTime()).toBe(t3.getTime());
  });

  it("compare with datetime", () => {
    const t1 = utc(2000);
    const t2 = utc(2000, 1, 1, 0, 0, 0);
    expect(t1.getTime()).toBe(t2.getTime());
    const t3 = utc(2000, 1, 1, 0, 0, 1);
    expect(t1.getTime()).toBeLessThan(t3.getTime());
  });

  it("compare with time with zone", () => {
    const t1 = utc(2000);
    const t2 = utc(1999, 12, 31, 23, 59, 59);
    expect(t1.getTime()).toBeGreaterThan(t2.getTime());
    const t3 = utc(2000, 1, 1, 0, 0, 0);
    expect(t1.getTime()).toBe(t3.getTime());
    const t4 = utc(2000, 1, 1, 0, 0, 1);
    expect(t1.getTime()).toBeLessThan(t4.getTime());
  });

  it("compare with string", () => {
    const t = utc(2000);
    const str = utc(2000, 1, 1, 0, 0, 0).toISOString();
    expect(t.getTime()).toBe(new Date(str).getTime());
  });

  it("at with datetime", () => {
    expect(
      RubyTime.at(RubyDateTime.civil(2000, 1, 1, 0, 0, 0) as never)
        .toR()
        .toString(),
    ).toBe(RubyTime.utc(2000, 1, 1, 0, 0, 0).toR().toString());

    expect(() => RubyTime.at(RubyTime.now() as never, 0)).toThrow(TypeError);
    expect(() => RubyTime.at(RubyDateTime.civil(2000, 1, 1, 0, 0, 0) as never, 0)).toThrow(
      TypeError,
    );
  });

  it("at with datetime returns local time", () => {
    withEnvTz("US/Eastern", () => {
      let dt = RubyDateTime.civil(2000, 1, 1, 0, 0, 0, 0);
      expect(
        RubyTime.at(dt as never)
          .toR()
          .toString(),
      ).toBe(RubyTime.local(1999, 12, 31, 19, 0, 0).toR().toString());
      expect(RubyTime.at(dt as never).zone).toBe("EST");
      expect(RubyTime.at(dt as never).utcOffset).toBe(-18000);

      dt = RubyDateTime.civil(2000, 7, 1, 1, 0, 0, new Rational(1, 24));
      expect(
        RubyTime.at(dt as never)
          .toR()
          .toString(),
      ).toBe(RubyTime.local(2000, 6, 30, 20, 0, 0).toR().toString());
      expect(RubyTime.at(dt as never).zone).toBe("EDT");
      expect(RubyTime.at(dt as never).utcOffset).toBe(-14400);
    });
  });

  it("at with time with zone", () => {
    const twz = new TimeWithZone(RubyTime.utc(2000, 1, 1, 0, 0, 0), TimeZone.find("UTC")!);
    expect(
      RubyTime.at(twz as never)
        .toR()
        .toString(),
    ).toBe(RubyTime.utc(2000, 1, 1, 0, 0, 0).toR().toString());

    expect(() => RubyTime.at(RubyTime.now() as never, 0)).toThrow(TypeError);
    expect(() => RubyTime.at(twz as never, 0)).toThrow(TypeError);
  });

  it("at with in option", () => {
    const t = new Date(31337 * 1000);
    expect(t.getUTCHours()).toBe(8);
    expect(t.getUTCMinutes()).toBe(42);
    expect(t.getUTCSeconds()).toBe(17);
  });

  it("at with time with zone returns local time", () => {
    withEnvTz("US/Eastern", () => {
      let twz = new TimeWithZone(RubyTime.utc(2000, 1, 1, 0, 0, 0), TimeZone.find("London")!);
      expect(
        RubyTime.at(twz as never)
          .toR()
          .toString(),
      ).toBe(RubyTime.local(1999, 12, 31, 19, 0, 0).toR().toString());
      expect(RubyTime.at(twz as never).zone).toBe("EST");
      expect(RubyTime.at(twz as never).utcOffset).toBe(-18000);

      twz = new TimeWithZone(RubyTime.utc(2000, 7, 1, 0, 0, 0), TimeZone.find("London")!);
      expect(
        RubyTime.at(twz as never)
          .toR()
          .toString(),
      ).toBe(RubyTime.local(2000, 6, 30, 20, 0, 0).toR().toString());
      expect(RubyTime.at(twz as never).zone).toBe("EDT");
      expect(RubyTime.at(twz as never).utcOffset).toBe(-14400);
    });
  });

  it("at with time microsecond precision", () => {
    const t = utc(2000, 1, 1, 0, 0, 0);
    expect(t.getTime()).toBe(Date.UTC(2000, 0, 1));
  });

  it("at with utc time", () => {
    withEnvTz("America/New_York", () => {
      const t = utc(2000);
      expect(t.getUTCFullYear()).toBe(2000);
      expect(t.getUTCMonth()).toBe(0);
    });
  });

  it("at with local time", () => {
    withEnvTz("America/New_York", () => {
      const t = new Date(2000, 0, 1);
      expect(t.getFullYear()).toBe(2000);
      expect(t.getTimezoneOffset()).toBe(300);
    });
  });

  it("eql?", () => {
    const t1 = utc(2000);
    const t2 = utc(2000, 1, 1, 0, 0, 0);
    expect(t1.getTime()).toBe(t2.getTime());
    const t3 = utc(2000, 1, 1, 0, 0, 1);
    expect(t1.getTime()).not.toBe(t3.getTime());
  });

  it("minus with time with zone", () => {
    const t1 = utc(2000, 1, 2);
    const t2 = utc(2000, 1, 1);
    const diffSec = (t1.getTime() - t2.getTime()) / 1000;
    expect(diffSec).toBe(86400);
  });

  it("minus with datetime", () => {
    const t1 = utc(2000, 1, 2);
    const t2 = utc(2000, 1, 1);
    const diffSec = (t1.getTime() - t2.getTime()) / 1000;
    expect(diffSec).toBe(86400);
  });

  it("time created with local constructor cannot represent times during hour skipped by dst", () => {
    withEnvTz("America/New_York", () => {
      const t = new Date(2006, 3, 2, 2, 0, 0);
      expect(t.getHours()).toBe(3);
    });
  });

  it("case equality", () => {
    const t = utc(2000);
    expect(t instanceof Date).toBe(true);
  });

  it("all day with timezone", () => {
    const t = d(2011, 6, 7, 10, 10, 10);
    const { start, end } = allDay(t);
    expect(asDate(start).getHours()).toBe(0);
    expect(asDate(start).getMinutes()).toBe(0);
    expect(asDate(end).getHours()).toBe(23);
    expect(asDate(end).getMinutes()).toBe(59);
    expect(asDate(end).getDate()).toBe(7);
  });

  it("rfc3339 parse", () => {
    const str = "1999-12-31T19:00:00.125-05:00";
    const t = new Date(str);
    expect(t.getUTCFullYear()).toBe(2000);
    expect(t.getUTCMonth()).toBe(0);
    expect(t.getUTCDate()).toBe(1);
    expect(t.getUTCHours()).toBe(0);
    expect(t.getUTCMinutes()).toBe(0);
    expect(t.getUTCSeconds()).toBe(0);
    expect(t.getUTCMilliseconds()).toBe(125);
  });

  it("ago", () => {
    expect(asDate(ago(d(2005, 2, 22, 10, 10, 10), 1))).toEqual(d(2005, 2, 22, 10, 10, 9));
    expect(asDate(ago(d(2005, 2, 22, 10, 10, 10), 3600))).toEqual(d(2005, 2, 22, 9, 10, 10));
    expect(asDate(ago(d(2005, 2, 22, 10, 10, 10), 86400 * 2))).toEqual(d(2005, 2, 20, 10, 10, 10));
    expect(asDate(ago(d(2005, 2, 22, 10, 10, 10), 86400 * 2 + 3600 + 25))).toEqual(
      d(2005, 2, 20, 9, 9, 45),
    );
  });

  it("since", () => {
    expect(asDate(since(d(2005, 2, 22, 10, 10, 10), 1))).toEqual(d(2005, 2, 22, 10, 10, 11));
    expect(asDate(since(d(2005, 2, 22, 10, 10, 10), 3600))).toEqual(d(2005, 2, 22, 11, 10, 10));
    expect(asDate(since(d(2005, 2, 22, 10, 10, 10), 86400 * 2))).toEqual(
      d(2005, 2, 24, 10, 10, 10),
    );
    expect(asDate(since(d(2005, 2, 22, 10, 10, 10), 86400 * 2 + 3600 + 25))).toEqual(
      d(2005, 2, 24, 11, 10, 35),
    );
  });

  it("advance", () => {
    const t = d(2005, 1, 22, 15, 15, 10);
    expect(asDate(advance(t, { years: 1 }))).toEqual(d(2006, 1, 22, 15, 15, 10));
    expect(asDate(advance(t, { months: 1 }))).toEqual(d(2005, 2, 22, 15, 15, 10));
    expect(asDate(advance(t, { days: 1 }))).toEqual(d(2005, 1, 23, 15, 15, 10));
  });

  it("prev day with time local", () => {
    const t = new Date();
    const result = asDate(prevDay(t));
    expect(result < t).toBe(true);
  });

  it("next day with time local", () => {
    const t = d(2005, 6, 15, 12, 0, 0);
    const result = asDate(nextDay(t));
    expect(result.getDate()).toBe(16);
    expect(result.getMonth()).toBe(5);
  });

  it("prev day", () => {
    const at = (instant: Temporal.Instant): number => instant.epochMilliseconds;
    expect(at(prevDay(dateTimeInit(2005, 2, 22, 10, 10, 10), -2))).toBe(
      dateTimeInit(2005, 2, 24, 10, 10, 10).getTime(),
    );
    expect(at(prevDay(dateTimeInit(2005, 2, 22, 10, 10, 10), -1))).toBe(
      dateTimeInit(2005, 2, 23, 10, 10, 10).getTime(),
    );
    expect(at(prevDay(dateTimeInit(2005, 2, 22, 10, 10, 10), 0))).toBe(
      dateTimeInit(2005, 2, 22, 10, 10, 10).getTime(),
    );
    expect(at(prevDay(dateTimeInit(2005, 2, 22, 10, 10, 10), 1))).toBe(
      dateTimeInit(2005, 2, 21, 10, 10, 10).getTime(),
    );
    expect(at(prevDay(dateTimeInit(2005, 2, 22, 10, 10, 10), 2))).toBe(
      dateTimeInit(2005, 2, 20, 10, 10, 10).getTime(),
    );
    expect(at(prevDay(dateTimeInit(2005, 2, 22, 10, 10, 10)))).toBe(
      dateTimeInit(2005, 2, 21, 10, 10, 10).getTime(),
    );
    expect(at(prevDay(asDate(prevDay(dateTimeInit(2005, 3, 2, 10, 10, 10)))))).toBe(
      dateTimeInit(2005, 2, 28, 10, 10, 10).getTime(),
    );
  });

  it("next day", () => {
    const at = (instant: Temporal.Instant): number => instant.epochMilliseconds;
    expect(at(nextDay(dateTimeInit(2005, 2, 22, 10, 10, 10), -2))).toBe(
      dateTimeInit(2005, 2, 20, 10, 10, 10).getTime(),
    );
    expect(at(nextDay(dateTimeInit(2005, 2, 22, 10, 10, 10), -1))).toBe(
      dateTimeInit(2005, 2, 21, 10, 10, 10).getTime(),
    );
    expect(at(nextDay(dateTimeInit(2005, 2, 22, 10, 10, 10), 0))).toBe(
      dateTimeInit(2005, 2, 22, 10, 10, 10).getTime(),
    );
    expect(at(nextDay(dateTimeInit(2005, 2, 22, 10, 10, 10), 1))).toBe(
      dateTimeInit(2005, 2, 23, 10, 10, 10).getTime(),
    );
    expect(at(nextDay(dateTimeInit(2005, 2, 22, 10, 10, 10), 2))).toBe(
      dateTimeInit(2005, 2, 24, 10, 10, 10).getTime(),
    );
    expect(at(nextDay(dateTimeInit(2005, 2, 22, 10, 10, 10)))).toBe(
      dateTimeInit(2005, 2, 23, 10, 10, 10).getTime(),
    );
    expect(at(nextDay(asDate(nextDay(dateTimeInit(2005, 2, 28, 10, 10, 10)))))).toBe(
      dateTimeInit(2005, 3, 2, 10, 10, 10).getTime(),
    );
  });

  it("prev month", () => {
    const at = (instant: Temporal.Instant): number => instant.epochMilliseconds;
    expect(at(prevMonth(dateTimeInit(2005, 2, 22, 10, 10, 10), -2))).toBe(
      dateTimeInit(2005, 4, 22, 10, 10, 10).getTime(),
    );
    expect(at(prevMonth(dateTimeInit(2005, 2, 22, 10, 10, 10), -1))).toBe(
      dateTimeInit(2005, 3, 22, 10, 10, 10).getTime(),
    );
    expect(at(prevMonth(dateTimeInit(2005, 2, 22, 10, 10, 10), 0))).toBe(
      dateTimeInit(2005, 2, 22, 10, 10, 10).getTime(),
    );
    expect(at(prevMonth(dateTimeInit(2005, 2, 22, 10, 10, 10), 1))).toBe(
      dateTimeInit(2005, 1, 22, 10, 10, 10).getTime(),
    );
    expect(at(prevMonth(dateTimeInit(2005, 2, 22, 10, 10, 10), 2))).toBe(
      dateTimeInit(2004, 12, 22, 10, 10, 10).getTime(),
    );
    expect(at(prevMonth(dateTimeInit(2005, 2, 22, 10, 10, 10)))).toBe(
      dateTimeInit(2005, 1, 22, 10, 10, 10).getTime(),
    );
    expect(at(prevMonth(asDate(prevMonth(dateTimeInit(2005, 2, 22, 10, 10, 10)))))).toBe(
      dateTimeInit(2004, 12, 22, 10, 10, 10).getTime(),
    );
  });

  it("next month", () => {
    const at = (instant: Temporal.Instant): number => instant.epochMilliseconds;
    expect(at(nextMonth(dateTimeInit(2005, 2, 22, 10, 10, 10), -2))).toBe(
      dateTimeInit(2004, 12, 22, 10, 10, 10).getTime(),
    );
    expect(at(nextMonth(dateTimeInit(2005, 2, 22, 10, 10, 10), -1))).toBe(
      dateTimeInit(2005, 1, 22, 10, 10, 10).getTime(),
    );
    expect(at(nextMonth(dateTimeInit(2005, 2, 22, 10, 10, 10), 0))).toBe(
      dateTimeInit(2005, 2, 22, 10, 10, 10).getTime(),
    );
    expect(at(nextMonth(dateTimeInit(2005, 2, 22, 10, 10, 10), 1))).toBe(
      dateTimeInit(2005, 3, 22, 10, 10, 10).getTime(),
    );
    expect(at(nextMonth(dateTimeInit(2005, 2, 22, 10, 10, 10), 2))).toBe(
      dateTimeInit(2005, 4, 22, 10, 10, 10).getTime(),
    );
    expect(at(nextMonth(dateTimeInit(2005, 2, 22, 10, 10, 10)))).toBe(
      dateTimeInit(2005, 3, 22, 10, 10, 10).getTime(),
    );
    expect(at(nextMonth(asDate(nextMonth(dateTimeInit(2005, 2, 22, 10, 10, 10)))))).toBe(
      dateTimeInit(2005, 4, 22, 10, 10, 10).getTime(),
    );
  });

  it("prev year", () => {
    const at = (instant: Temporal.Instant): number => instant.epochMilliseconds;
    expect(at(prevYear(dateTimeInit(2005, 6, 5, 10, 10, 10), -2))).toBe(
      dateTimeInit(2007, 6, 5, 10, 10, 10).getTime(),
    );
    expect(at(prevYear(dateTimeInit(2005, 6, 5, 10, 10, 10), -1))).toBe(
      dateTimeInit(2006, 6, 5, 10, 10, 10).getTime(),
    );
    expect(at(prevYear(dateTimeInit(2005, 6, 5, 10, 10, 10), 0))).toBe(
      dateTimeInit(2005, 6, 5, 10, 10, 10).getTime(),
    );
    expect(at(prevYear(dateTimeInit(2005, 6, 5, 10, 10, 10), 1))).toBe(
      dateTimeInit(2004, 6, 5, 10, 10, 10).getTime(),
    );
    expect(at(prevYear(dateTimeInit(2005, 6, 5, 10, 10, 10), 2))).toBe(
      dateTimeInit(2003, 6, 5, 10, 10, 10).getTime(),
    );
    expect(at(prevYear(dateTimeInit(2005, 6, 5, 10, 10, 10)))).toBe(
      dateTimeInit(2004, 6, 5, 10, 10, 10).getTime(),
    );
    expect(at(prevYear(asDate(prevYear(dateTimeInit(2005, 6, 5, 10, 10, 10)))))).toBe(
      dateTimeInit(2003, 6, 5, 10, 10, 10).getTime(),
    );
  });

  it("next year", () => {
    const at = (instant: Temporal.Instant): number => instant.epochMilliseconds;
    expect(at(nextYear(dateTimeInit(2005, 6, 5, 10, 10, 10), -2))).toBe(
      dateTimeInit(2003, 6, 5, 10, 10, 10).getTime(),
    );
    expect(at(nextYear(dateTimeInit(2005, 6, 5, 10, 10, 10), -1))).toBe(
      dateTimeInit(2004, 6, 5, 10, 10, 10).getTime(),
    );
    expect(at(nextYear(dateTimeInit(2005, 6, 5, 10, 10, 10), 0))).toBe(
      dateTimeInit(2005, 6, 5, 10, 10, 10).getTime(),
    );
    expect(at(nextYear(dateTimeInit(2005, 6, 5, 10, 10, 10), 1))).toBe(
      dateTimeInit(2006, 6, 5, 10, 10, 10).getTime(),
    );
    expect(at(nextYear(dateTimeInit(2005, 6, 5, 10, 10, 10), 2))).toBe(
      dateTimeInit(2007, 6, 5, 10, 10, 10).getTime(),
    );
    expect(at(nextYear(dateTimeInit(2005, 6, 5, 10, 10, 10)))).toBe(
      dateTimeInit(2006, 6, 5, 10, 10, 10).getTime(),
    );
    expect(at(nextYear(asDate(nextYear(dateTimeInit(2005, 6, 5, 10, 10, 10)))))).toBe(
      dateTimeInit(2007, 6, 5, 10, 10, 10).getTime(),
    );
  });
});

function marshalDump(t: RubyTime): string {
  return JSON.stringify({
    nanoseconds: t.toTime().epochNanoseconds.toString(),
    utc: t.isUtc(),
  });
}

function marshalLoad(dumped: string): RubyTime {
  const { nanoseconds, utc } = JSON.parse(dumped) as { nanoseconds: string; utc: boolean };
  const at = RubyTime.at(new Rational(BigInt(nanoseconds), 1_000_000_000n));
  return utc ? at.getutc() : at.getlocal();
}

describe("TimeExtMarshalingTest", () => {
  it("marshalling with utc instance", () => {
    const t = RubyTime.utc(2000);
    const unmarshalled = marshalLoad(marshalDump(t));
    expect(unmarshalled.zone).toBe("UTC");
    expect(unmarshalled.toTime().epochNanoseconds).toBe(t.toTime().epochNanoseconds);
  });

  it("marshalling with local instance", () => {
    const t = RubyTime.local(2000);
    const unmarshalled = marshalLoad(marshalDump(t));
    expect(unmarshalled.zone).toBe(t.zone);
    expect(unmarshalled.toTime().epochNanoseconds).toBe(t.toTime().epochNanoseconds);
  });

  it("marshalling with frozen utc instance", () => {
    const t = RubyTime.utc(2000);
    Object.freeze(t);
    const unmarshalled = marshalLoad(marshalDump(t));
    expect(unmarshalled.zone).toBe("UTC");
    expect(unmarshalled.toTime().epochNanoseconds).toBe(t.toTime().epochNanoseconds);
  });

  it("marshalling with frozen local instance", () => {
    const t = RubyTime.local(2000);
    Object.freeze(t);
    const unmarshalled = marshalLoad(marshalDump(t));
    expect(unmarshalled.zone).toBe(t.zone);
    expect(unmarshalled.toTime().epochNanoseconds).toBe(t.toTime().epochNanoseconds);
  });

  it("marshalling preserves fractional seconds", () => {
    const t = RubyTime.parse("00:00:00.500");
    const unmarshalled = marshalLoad(marshalDump(t));
    expect(unmarshalled.toF()).toBe(t.toF());
    expect(unmarshalled.toTime().epochNanoseconds).toBe(t.toTime().epochNanoseconds);
  });

  it("last quarter on 31st", () => {
    expect(lastQuarter(d(2004, 5, 31)).epochMilliseconds).toBe(d(2004, 2, 29).getTime());
  });
});
