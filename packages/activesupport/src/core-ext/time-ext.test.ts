import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Date as RubyDate,
  DateTime as RubyDateTime,
  Temporal,
  Time as RubyTime,
  resetLocalTimeZoneId,
} from "@blazetrails/date";
import { Range, Rational } from "@blazetrails/ruby-compat";
import {
  assertNothingRaised,
  assertPredicate,
  assertRaise,
  assertRaises,
  assertNil,
} from "../testing/assertions.js";
import { assertDeprecated } from "../testing/deprecation.js";
import { deprecator } from "../deprecator.js";
import { Duration } from "../duration.js";
import { setFrozenTime } from "../time-travel.js";
import { inTimeZone } from "./date-and-time/zones.js";
import { zone as timeZone, setZone } from "../time-zone-config.js";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../values/time-zone.js";
import "./time/calculations.js";
import { ArgumentError } from "../hash-utils.js";
import {
  nextDay,
  prevDay,
  advance,
  ago,
  change,
  toDate,
  daysInMonth,
  daysInYear,
  nextWeek,
  nextMonth,
  prevMonth,
  nextYear,
  prevYear,
} from "../time-ext.js";
import { toFs, DATE_FORMATS, formattedOffset } from "./time/conversions.js";
import { toTime } from "./time/compatibility.js";
import {
  lastQuarter,
  isFuture,
  isPast,
  isNextDay,
  isPrevDay,
  isToday,
  isTomorrow,
  isYesterday,
} from "./date-and-time/calculations.js";

type CalculationsTime = RubyTime & {
  tomorrow(): RubyTime;
  yesterday(): RubyTime;
  lastWeek(startDay?: string): RubyTime;
};

expect.addEqualityTesters([
  (a: unknown, b: unknown) => {
    if (a instanceof RubyTime) return a.compareWithCoercion(b) === 0;
    if (b instanceof RubyTime) return b.compareWithCoercion(a) === 0;
    return undefined;
  },
]);

function stubDateCurrent(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2000, 0, 1, 12));
}

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

function withTimeCurrent<T>(current: Date | TimeWithZone, fn: () => T): T {
  setFrozenTime(current instanceof Date ? current : new Date(current.toI() * 1000));
  try {
    return fn();
  } finally {
    setFrozenTime(null);
  }
}

function withTzDefault<T>(tz: TimeZone | string | null, fn: () => T): T {
  const oldTz = timeZone();
  setZone(tz);
  try {
    return fn();
  } finally {
    setZone(oldTz);
  }
}

const savedTZ = process.env.TZ;
afterEach(() => {
  vi.useRealTimers();
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
    withEnvTz("US/Eastern", () => {
      expect(
        RubyTime.local(2005, 4, 3, 1, 59, 59).secondsSinceMidnight(),
        "just before DST start",
      ).toEqual(2 * 3600 - 1);
      expect(
        RubyTime.local(2005, 4, 3, 3, 0, 1).secondsSinceMidnight(),
        "just after DST start",
      ).toEqual(2 * 3600 + 1);
    });
    withEnvTz("NZ", () => {
      expect(
        RubyTime.local(2006, 10, 1, 1, 59, 59).secondsSinceMidnight(),
        "just before DST start",
      ).toEqual(2 * 3600 - 1);
      expect(
        RubyTime.local(2006, 10, 1, 3, 0, 1).secondsSinceMidnight(),
        "just after DST start",
      ).toEqual(2 * 3600 + 1);
    });
  });

  it("seconds since midnight at daylight savings time end", () => {
    withEnvTz("US/Eastern", () => {
      expect(
        RubyTime.local(2005, 10, 30, 0, 59, 59).secondsSinceMidnight(),
        "just before DST end",
      ).toEqual(1 * 3600 - 1);
      expect(
        RubyTime.local(2005, 10, 30, 2, 0, 1).secondsSinceMidnight(),
        "just after DST end",
      ).toEqual(3 * 3600 + 1);
      expect(
        RubyTime.local(0, 30, 1, 30, 10, 2005, null, null, true, null).secondsSinceMidnight(),
        "before DST end",
      ).toEqual(1 * 3600 + 30 * 60);
      expect(
        RubyTime.local(0, 30, 1, 30, 10, 2005, null, null, false, null).secondsSinceMidnight(),
        "after DST end",
      ).toEqual(2 * 3600 + 30 * 60);
    });
    withEnvTz("NZ", () => {
      expect(
        RubyTime.local(2006, 3, 19, 1, 59, 59).secondsSinceMidnight(),
        "just before DST end",
      ).toEqual(2 * 3600 - 1);
      expect(
        RubyTime.local(2006, 3, 19, 3, 0, 1).secondsSinceMidnight(),
        "just after DST end",
      ).toEqual(4 * 3600 + 1);
      expect(
        RubyTime.local(0, 30, 2, 19, 3, 2006, null, null, true, null).secondsSinceMidnight(),
        "before DST end",
      ).toEqual(2 * 3600 + 30 * 60);
      expect(
        RubyTime.local(0, 30, 2, 19, 3, 2006, null, null, false, null).secondsSinceMidnight(),
        "after DST end",
      ).toEqual(3 * 3600 + 30 * 60);
    });
  });

  it("seconds until end of day at daylight savings time start", () => {
    withEnvTz("US/Eastern", () => {
      expect(
        RubyTime.local(2005, 4, 3, 1, 59, 59).secondsUntilEndOfDay(),
        "just before DST start",
      ).toEqual(21 * 3600);
      expect(
        RubyTime.local(2005, 4, 3, 3, 0, 1).secondsUntilEndOfDay(),
        "just after DST start",
      ).toEqual(21 * 3600 - 2);
    });
    withEnvTz("NZ", () => {
      expect(
        RubyTime.local(2006, 10, 1, 1, 59, 59).secondsUntilEndOfDay(),
        "just before DST start",
      ).toEqual(21 * 3600);
      expect(
        RubyTime.local(2006, 10, 1, 3, 0, 1).secondsUntilEndOfDay(),
        "just after DST start",
      ).toEqual(21 * 3600 - 2);
    });
  });

  it("seconds until end of day at daylight savings time end", () => {
    withEnvTz("US/Eastern", () => {
      expect(
        RubyTime.local(2005, 10, 30, 0, 59, 59).secondsUntilEndOfDay(),
        "just before DST end",
      ).toEqual(24 * 3600);
      expect(
        RubyTime.local(2005, 10, 30, 2, 0, 1).secondsUntilEndOfDay(),
        "just after DST end",
      ).toEqual(22 * 3600 - 2);
      expect(
        RubyTime.local(0, 30, 1, 30, 10, 2005, null, null, true, null).secondsUntilEndOfDay(),
        "before DST end",
      ).toEqual(24 * 3600 - 30 * 60 - 1);
      expect(
        RubyTime.local(0, 30, 1, 30, 10, 2005, null, null, false, null).secondsUntilEndOfDay(),
        "after DST end",
      ).toEqual(23 * 3600 - 30 * 60 - 1);
    });
    withEnvTz("NZ", () => {
      expect(
        RubyTime.local(2006, 3, 19, 1, 59, 59).secondsUntilEndOfDay(),
        "just before DST end",
      ).toEqual(23 * 3600);
      expect(
        RubyTime.local(2006, 3, 19, 3, 0, 1).secondsUntilEndOfDay(),
        "just after DST end",
      ).toEqual(21 * 3600 - 2);
      expect(
        RubyTime.local(0, 30, 2, 19, 3, 2006, null, null, true, null).secondsUntilEndOfDay(),
        "before DST end",
      ).toEqual(23 * 3600 - 30 * 60 - 1);
      expect(
        RubyTime.local(0, 30, 2, 19, 3, 2006, null, null, false, null).secondsUntilEndOfDay(),
        "after DST end",
      ).toEqual(22 * 3600 - 30 * 60 - 1);
    });
  });

  it("sec fraction", () => {
    let time = RubyTime.utc(2016, 4, 23, 0, 0, new Rational(1, 1_000_000_000)) as any;
    expect(time.secFraction()).toEqual(new Rational(1, 1_000_000_000));

    time = RubyTime.utc(2016, 4, 23, 0, 0, 0.000_000_001);
    expect(time.secFraction()).toBeInstanceOf(Rational);
    expect(time.secFraction().toF()).toEqual(0.000_000_001);

    time = RubyTime.utc(2016, 4, 23, 0, 0, 0, new Rational(1, 1_000));
    expect(time.secFraction()).toEqual(new Rational(1, 1_000_000_000));

    time = RubyTime.utc(2016, 4, 23, 0, 0, 0, 0.001);
    expect(time.secFraction()).toBeInstanceOf(Rational);
    expect(time.secFraction().toF()).toEqual(0.001 / 1000000);
  });

  it.skip("floor", () => {
    // BLOCKED: activesupport-time-floor-ceil-ndigits
    const time = RubyTime.utc(2016, 4, 23, 0, 0, new Rational(123456789, 1_000_000_000)) as any;

    expect(time.floor().subsec).toEqual(new Rational(0, 1));
    expect(time.floor(1).subsec).toEqual(new Rational(1, 10));
    expect(time.floor(2).subsec).toEqual(new Rational(12, 100));
    expect(time.floor(9).subsec).toEqual(new Rational(123456789, 1_000_000_000));
    expect(time.floor(10).subsec).toEqual(new Rational(123456789, 1_000_000_000));
  });

  it.skip("ceil", () => {
    // BLOCKED: activesupport-time-floor-ceil-ndigits
    const time = RubyTime.utc(2016, 4, 30, 23, 59, new Rational(59123456789, 1_000_000_000)) as any;

    expect(time.ceil().subsec).toEqual(new Rational(0, 1));
    expect(time.ceil()).toEqual(RubyTime.utc(2016, 5, 1, 0, 0));

    expect(time.ceil(3).subsec).toEqual(new Rational(124, 1000));
    expect(time.ceil(5).subsec).toEqual(new Rational(12346, 100000));
    expect(time.ceil(8).subsec).toEqual(new Rational(12345679, 100000000));
    expect(time.ceil(9).subsec).toEqual(new Rational(123456789, 1_000_000_000));
    expect(time.ceil(11).subsec.toF()).toEqual(new Rational(123456789, 1_000_000_000).toF());
  });

  it("daylight savings time crossings backward start", () => {
    withEnvTz("US/Eastern", () => {
      expect(
        RubyTime.local(2005, 4, 3, 4, 18, 0).ago(Duration.hours(24)),
        "dt-24.hours=>st",
      ).toEqual(RubyTime.local(2005, 4, 2, 3, 18, 0));
      expect(RubyTime.local(2005, 4, 3, 4, 18, 0).ago(86400), "dt-86400=>st").toEqual(
        RubyTime.local(2005, 4, 2, 3, 18, 0),
      );
      expect(
        RubyTime.local(2005, 4, 3, 4, 18, 0).ago(Duration.seconds(86400)),
        "dt-86400.seconds=>st",
      ).toEqual(RubyTime.local(2005, 4, 2, 3, 18, 0));
      expect(
        RubyTime.local(2005, 4, 2, 4, 18, 0).ago(Duration.hours(24)),
        "st-24.hours=>st",
      ).toEqual(RubyTime.local(2005, 4, 1, 4, 18, 0));
      expect(RubyTime.local(2005, 4, 2, 4, 18, 0).ago(86400), "st-86400=>st").toEqual(
        RubyTime.local(2005, 4, 1, 4, 18, 0),
      );
      expect(
        RubyTime.local(2005, 4, 2, 4, 18, 0).ago(Duration.seconds(86400)),
        "st-86400.seconds=>st",
      ).toEqual(RubyTime.local(2005, 4, 1, 4, 18, 0));
    });
    withEnvTz("NZ", () => {
      expect(
        RubyTime.local(2006, 10, 1, 4, 18, 0).ago(Duration.hours(24)),
        "dt-24.hours=>st",
      ).toEqual(RubyTime.local(2006, 9, 30, 3, 18, 0));
      expect(RubyTime.local(2006, 10, 1, 4, 18, 0).ago(86400), "dt-86400=>st").toEqual(
        RubyTime.local(2006, 9, 30, 3, 18, 0),
      );
      expect(
        RubyTime.local(2006, 10, 1, 4, 18, 0).ago(Duration.seconds(86400)),
        "dt-86400.seconds=>st",
      ).toEqual(RubyTime.local(2006, 9, 30, 3, 18, 0));
      expect(
        RubyTime.local(2006, 9, 30, 4, 18, 0).ago(Duration.hours(24)),
        "st-24.hours=>st",
      ).toEqual(RubyTime.local(2006, 9, 29, 4, 18, 0));
      expect(RubyTime.local(2006, 9, 30, 4, 18, 0).ago(86400), "st-86400=>st").toEqual(
        RubyTime.local(2006, 9, 29, 4, 18, 0),
      );
      expect(
        RubyTime.local(2006, 9, 30, 4, 18, 0).ago(Duration.seconds(86400)),
        "st-86400.seconds=>st",
      ).toEqual(RubyTime.local(2006, 9, 29, 4, 18, 0));
    });
  });

  it("daylight savings time crossings backward end", () => {
    withEnvTz("US/Eastern", () => {
      expect(
        RubyTime.local(2005, 10, 30, 4, 3, 0).ago(Duration.hours(24)),
        "st-24.hours=>dt",
      ).toEqual(RubyTime.local(2005, 10, 29, 5, 3));
      expect(RubyTime.local(2005, 10, 30, 4, 3, 0).ago(86400), "st-86400=>dt").toEqual(
        RubyTime.local(2005, 10, 29, 5, 3),
      );
      expect(
        RubyTime.local(2005, 10, 30, 4, 3, 0).ago(Duration.seconds(86400)),
        "st-86400.seconds=>dt",
      ).toEqual(RubyTime.local(2005, 10, 29, 5, 3));
      expect(
        RubyTime.local(2005, 10, 29, 4, 3, 0).ago(Duration.hours(24)),
        "dt-24.hours=>dt",
      ).toEqual(RubyTime.local(2005, 10, 28, 4, 3));
      expect(RubyTime.local(2005, 10, 29, 4, 3, 0).ago(86400), "dt-86400=>dt").toEqual(
        RubyTime.local(2005, 10, 28, 4, 3),
      );
      expect(
        RubyTime.local(2005, 10, 29, 4, 3, 0).ago(Duration.seconds(86400)),
        "dt-86400.seconds=>dt",
      ).toEqual(RubyTime.local(2005, 10, 28, 4, 3));
    });
    withEnvTz("NZ", () => {
      expect(
        RubyTime.local(2006, 3, 19, 4, 3, 0).ago(Duration.hours(24)),
        "st-24.hours=>dt",
      ).toEqual(RubyTime.local(2006, 3, 18, 5, 3));
      expect(RubyTime.local(2006, 3, 19, 4, 3, 0).ago(86400), "st-86400=>dt").toEqual(
        RubyTime.local(2006, 3, 18, 5, 3),
      );
      expect(
        RubyTime.local(2006, 3, 19, 4, 3, 0).ago(Duration.seconds(86400)),
        "st-86400.seconds=>dt",
      ).toEqual(RubyTime.local(2006, 3, 18, 5, 3));
      expect(
        RubyTime.local(2006, 3, 18, 4, 3, 0).ago(Duration.hours(24)),
        "dt-24.hours=>dt",
      ).toEqual(RubyTime.local(2006, 3, 17, 4, 3));
      expect(RubyTime.local(2006, 3, 18, 4, 3, 0).ago(86400), "dt-86400=>dt").toEqual(
        RubyTime.local(2006, 3, 17, 4, 3),
      );
      expect(
        RubyTime.local(2006, 3, 18, 4, 3, 0).ago(Duration.seconds(86400)),
        "dt-86400.seconds=>dt",
      ).toEqual(RubyTime.local(2006, 3, 17, 4, 3));
    });
  });

  it("daylight savings time crossings backward start 1day", () => {
    withEnvTz("US/Eastern", () => {
      expect(RubyTime.local(2005, 4, 3, 4, 18, 0).ago(Duration.days(1)), "dt-1.day=>st").toEqual(
        RubyTime.local(2005, 4, 2, 4, 18, 0),
      );
      expect(RubyTime.local(2005, 4, 2, 4, 18, 0).ago(Duration.days(1)), "st-1.day=>st").toEqual(
        RubyTime.local(2005, 4, 1, 4, 18, 0),
      );
    });
    withEnvTz("NZ", () => {
      expect(RubyTime.local(2006, 10, 1, 4, 18, 0).ago(Duration.days(1)), "dt-1.day=>st").toEqual(
        RubyTime.local(2006, 9, 30, 4, 18, 0),
      );
      expect(RubyTime.local(2006, 9, 30, 4, 18, 0).ago(Duration.days(1)), "st-1.day=>st").toEqual(
        RubyTime.local(2006, 9, 29, 4, 18, 0),
      );
    });
  });

  it("daylight savings time crossings backward end 1day", () => {
    withEnvTz("US/Eastern", () => {
      expect(RubyTime.local(2005, 10, 30, 4, 3, 0).ago(Duration.days(1)), "st-1.day=>dt").toEqual(
        RubyTime.local(2005, 10, 29, 4, 3),
      );
      expect(RubyTime.local(2005, 10, 29, 4, 3, 0).ago(Duration.days(1)), "dt-1.day=>dt").toEqual(
        RubyTime.local(2005, 10, 28, 4, 3),
      );
    });
    withEnvTz("NZ", () => {
      expect(RubyTime.local(2006, 3, 19, 4, 3, 0).ago(Duration.days(1)), "st-1.day=>dt").toEqual(
        RubyTime.local(2006, 3, 18, 4, 3),
      );
      expect(RubyTime.local(2006, 3, 18, 4, 3, 0).ago(Duration.days(1)), "dt-1.day=>dt").toEqual(
        RubyTime.local(2006, 3, 17, 4, 3),
      );
    });
  });

  it("since with instance of time deprecated", async () => {
    await assertDeprecated(null, deprecator(), () => {
      RubyTime.now().since(RubyTime.now());
    });
  });

  it("daylight savings time crossings forward start", () => {
    withEnvTz("US/Eastern", () => {
      expect(
        RubyTime.local(2005, 4, 2, 19, 27, 0).since(Duration.hours(24)),
        "st+24.hours=>dt",
      ).toEqual(RubyTime.local(2005, 4, 3, 20, 27, 0));
      expect(RubyTime.local(2005, 4, 2, 19, 27, 0).since(86400), "st+86400=>dt").toEqual(
        RubyTime.local(2005, 4, 3, 20, 27, 0),
      );
      expect(
        RubyTime.local(2005, 4, 2, 19, 27, 0).since(Duration.seconds(86400)),
        "st+86400.seconds=>dt",
      ).toEqual(RubyTime.local(2005, 4, 3, 20, 27, 0));
      expect(
        RubyTime.local(2005, 4, 3, 19, 27, 0).since(Duration.hours(24)),
        "dt+24.hours=>dt",
      ).toEqual(RubyTime.local(2005, 4, 4, 19, 27, 0));
      expect(RubyTime.local(2005, 4, 3, 19, 27, 0).since(86400), "dt+86400=>dt").toEqual(
        RubyTime.local(2005, 4, 4, 19, 27, 0),
      );
      expect(
        RubyTime.local(2005, 4, 3, 19, 27, 0).since(Duration.seconds(86400)),
        "dt+86400.seconds=>dt",
      ).toEqual(RubyTime.local(2005, 4, 4, 19, 27, 0));
    });
    withEnvTz("NZ", () => {
      expect(
        RubyTime.local(2006, 9, 30, 19, 27, 0).since(Duration.hours(24)),
        "st+24.hours=>dt",
      ).toEqual(RubyTime.local(2006, 10, 1, 20, 27, 0));
      expect(RubyTime.local(2006, 9, 30, 19, 27, 0).since(86400), "st+86400=>dt").toEqual(
        RubyTime.local(2006, 10, 1, 20, 27, 0),
      );
      expect(
        RubyTime.local(2006, 9, 30, 19, 27, 0).since(Duration.seconds(86400)),
        "st+86400.seconds=>dt",
      ).toEqual(RubyTime.local(2006, 10, 1, 20, 27, 0));
      expect(
        RubyTime.local(2006, 10, 1, 19, 27, 0).since(Duration.hours(24)),
        "dt+24.hours=>dt",
      ).toEqual(RubyTime.local(2006, 10, 2, 19, 27, 0));
      expect(RubyTime.local(2006, 10, 1, 19, 27, 0).since(86400), "dt+86400=>dt").toEqual(
        RubyTime.local(2006, 10, 2, 19, 27, 0),
      );
      expect(
        RubyTime.local(2006, 10, 1, 19, 27, 0).since(Duration.seconds(86400)),
        "dt+86400.seconds=>dt",
      ).toEqual(RubyTime.local(2006, 10, 2, 19, 27, 0));
    });
  });

  it("daylight savings time crossings forward start 1day", () => {
    withEnvTz("US/Eastern", () => {
      expect(RubyTime.local(2005, 4, 2, 19, 27, 0).since(Duration.days(1)), "st+1.day=>dt").toEqual(
        RubyTime.local(2005, 4, 3, 19, 27, 0),
      );
      expect(RubyTime.local(2005, 4, 3, 19, 27, 0).since(Duration.days(1)), "dt+1.day=>dt").toEqual(
        RubyTime.local(2005, 4, 4, 19, 27, 0),
      );
    });
    withEnvTz("NZ", () => {
      expect(
        RubyTime.local(2006, 9, 30, 19, 27, 0).since(Duration.days(1)),
        "st+1.day=>dt",
      ).toEqual(RubyTime.local(2006, 10, 1, 19, 27, 0));
      expect(
        RubyTime.local(2006, 10, 1, 19, 27, 0).since(Duration.days(1)),
        "dt+1.day=>dt",
      ).toEqual(RubyTime.local(2006, 10, 2, 19, 27, 0));
    });
  });

  it("daylight savings time crossings forward start tomorrow", () => {
    withEnvTz("US/Eastern", () => {
      expect(
        (RubyTime.local(2005, 4, 2, 19, 27, 0) as CalculationsTime).tomorrow(),
        "st+1.day=>dt",
      ).toEqual(RubyTime.local(2005, 4, 3, 19, 27, 0));
      expect(
        (RubyTime.local(2005, 4, 3, 19, 27, 0) as CalculationsTime).tomorrow(),
        "dt+1.day=>dt",
      ).toEqual(RubyTime.local(2005, 4, 4, 19, 27, 0));
    });
    withEnvTz("NZ", () => {
      expect(
        (RubyTime.local(2006, 9, 30, 19, 27, 0) as CalculationsTime).tomorrow(),
        "st+1.day=>dt",
      ).toEqual(RubyTime.local(2006, 10, 1, 19, 27, 0));
      expect(
        (RubyTime.local(2006, 10, 1, 19, 27, 0) as CalculationsTime).tomorrow(),
        "dt+1.day=>dt",
      ).toEqual(RubyTime.local(2006, 10, 2, 19, 27, 0));
    });
  });

  it("daylight savings time crossings backward start yesterday", () => {
    withEnvTz("US/Eastern", () => {
      expect(
        (RubyTime.local(2005, 4, 3, 19, 27, 0) as CalculationsTime).yesterday(),
        "dt-1.day=>st",
      ).toEqual(RubyTime.local(2005, 4, 2, 19, 27, 0));
      expect(
        (RubyTime.local(2005, 4, 4, 19, 27, 0) as CalculationsTime).yesterday(),
        "dt-1.day=>dt",
      ).toEqual(RubyTime.local(2005, 4, 3, 19, 27, 0));
    });
    withEnvTz("NZ", () => {
      expect(
        (RubyTime.local(2006, 10, 1, 19, 27, 0) as CalculationsTime).yesterday(),
        "dt-1.day=>st",
      ).toEqual(RubyTime.local(2006, 9, 30, 19, 27, 0));
      expect(
        (RubyTime.local(2006, 10, 2, 19, 27, 0) as CalculationsTime).yesterday(),
        "dt-1.day=>dt",
      ).toEqual(RubyTime.local(2006, 10, 1, 19, 27, 0));
    });
  });

  it("daylight savings time crossings forward end", () => {
    withEnvTz("US/Eastern", () => {
      expect(
        RubyTime.local(2005, 10, 30, 0, 45, 0).since(Duration.hours(24)),
        "dt+24.hours=>st",
      ).toEqual(RubyTime.local(2005, 10, 30, 23, 45, 0));
      expect(RubyTime.local(2005, 10, 30, 0, 45, 0).since(86400), "dt+86400=>st").toEqual(
        RubyTime.local(2005, 10, 30, 23, 45, 0),
      );
      expect(
        RubyTime.local(2005, 10, 30, 0, 45, 0).since(Duration.seconds(86400)),
        "dt+86400.seconds=>st",
      ).toEqual(RubyTime.local(2005, 10, 30, 23, 45, 0));
      expect(
        RubyTime.local(2005, 10, 31, 0, 45, 0).since(Duration.hours(24)),
        "st+24.hours=>st",
      ).toEqual(RubyTime.local(2005, 11, 1, 0, 45, 0));
      expect(RubyTime.local(2005, 10, 31, 0, 45, 0).since(86400), "st+86400=>st").toEqual(
        RubyTime.local(2005, 11, 1, 0, 45, 0),
      );
      expect(
        RubyTime.local(2005, 10, 31, 0, 45, 0).since(Duration.seconds(86400)),
        "st+86400.seconds=>st",
      ).toEqual(RubyTime.local(2005, 11, 1, 0, 45, 0));
    });
    withEnvTz("NZ", () => {
      expect(
        RubyTime.local(2006, 3, 19, 1, 45, 0).since(Duration.hours(24)),
        "dt+24.hours=>st",
      ).toEqual(RubyTime.local(2006, 3, 20, 0, 45, 0));
      expect(RubyTime.local(2006, 3, 19, 1, 45, 0).since(86400), "dt+86400=>st").toEqual(
        RubyTime.local(2006, 3, 20, 0, 45, 0),
      );
      expect(
        RubyTime.local(2006, 3, 19, 1, 45, 0).since(Duration.seconds(86400)),
        "dt+86400.seconds=>st",
      ).toEqual(RubyTime.local(2006, 3, 20, 0, 45, 0));
      expect(
        RubyTime.local(2006, 3, 20, 1, 45, 0).since(Duration.hours(24)),
        "st+24.hours=>st",
      ).toEqual(RubyTime.local(2006, 3, 21, 1, 45, 0));
      expect(RubyTime.local(2006, 3, 20, 1, 45, 0).since(86400), "st+86400=>st").toEqual(
        RubyTime.local(2006, 3, 21, 1, 45, 0),
      );
      expect(
        RubyTime.local(2006, 3, 20, 1, 45, 0).since(Duration.seconds(86400)),
        "st+86400.seconds=>st",
      ).toEqual(RubyTime.local(2006, 3, 21, 1, 45, 0));
    });
  });

  it("daylight savings time crossings forward end 1day", () => {
    withEnvTz("US/Eastern", () => {
      expect(
        RubyTime.local(2005, 10, 30, 0, 45, 0).since(Duration.days(1)),
        "dt+1.day=>st",
      ).toEqual(RubyTime.local(2005, 10, 31, 0, 45, 0));
      expect(
        RubyTime.local(2005, 10, 31, 0, 45, 0).since(Duration.days(1)),
        "st+1.day=>st",
      ).toEqual(RubyTime.local(2005, 11, 1, 0, 45, 0));
    });
    withEnvTz("NZ", () => {
      expect(RubyTime.local(2006, 3, 19, 1, 45, 0).since(Duration.days(1)), "dt+1.day=>st").toEqual(
        RubyTime.local(2006, 3, 20, 1, 45, 0),
      );
      expect(RubyTime.local(2006, 3, 20, 1, 45, 0).since(Duration.days(1)), "st+1.day=>st").toEqual(
        RubyTime.local(2006, 3, 21, 1, 45, 0),
      );
    });
  });

  it("daylight savings time crossings forward end tomorrow", () => {
    withEnvTz("US/Eastern", () => {
      expect(
        (RubyTime.local(2005, 10, 30, 0, 45, 0) as CalculationsTime).tomorrow(),
        "dt+1.day=>st",
      ).toEqual(RubyTime.local(2005, 10, 31, 0, 45, 0));
      expect(
        (RubyTime.local(2005, 10, 31, 0, 45, 0) as CalculationsTime).tomorrow(),
        "st+1.day=>st",
      ).toEqual(RubyTime.local(2005, 11, 1, 0, 45, 0));
    });
    withEnvTz("NZ", () => {
      expect(
        (RubyTime.local(2006, 3, 19, 1, 45, 0) as CalculationsTime).tomorrow(),
        "dt+1.day=>st",
      ).toEqual(RubyTime.local(2006, 3, 20, 1, 45, 0));
      expect(
        (RubyTime.local(2006, 3, 20, 1, 45, 0) as CalculationsTime).tomorrow(),
        "st+1.day=>st",
      ).toEqual(RubyTime.local(2006, 3, 21, 1, 45, 0));
    });
  });

  it("daylight savings time crossings backward end yesterday", () => {
    withEnvTz("US/Eastern", () => {
      expect(
        (RubyTime.local(2005, 10, 31, 0, 45, 0) as CalculationsTime).yesterday(),
        "st-1.day=>dt",
      ).toEqual(RubyTime.local(2005, 10, 30, 0, 45, 0));
      expect(
        (RubyTime.local(2005, 11, 1, 0, 45, 0) as CalculationsTime).yesterday(),
        "st-1.day=>st",
      ).toEqual(RubyTime.local(2005, 10, 31, 0, 45, 0));
    });
    withEnvTz("NZ", () => {
      expect(
        (RubyTime.local(2006, 3, 20, 1, 45, 0) as CalculationsTime).yesterday(),
        "st-1.day=>dt",
      ).toEqual(RubyTime.local(2006, 3, 19, 1, 45, 0));
      expect(
        (RubyTime.local(2006, 3, 21, 1, 45, 0) as CalculationsTime).yesterday(),
        "st-1.day=>st",
      ).toEqual(RubyTime.local(2006, 3, 20, 1, 45, 0));
    });
  });

  it("change", async () => {
    expect(RubyTime.local(2005, 2, 22, 15, 15, 10).change({ year: 2006 })).toEqual(
      RubyTime.local(2006, 2, 22, 15, 15, 10),
    );
    expect(RubyTime.local(2005, 2, 22, 15, 15, 10).change({ month: 6 })).toEqual(
      RubyTime.local(2005, 6, 22, 15, 15, 10),
    );
    expect(RubyTime.local(2005, 2, 22, 15, 15, 10).change({ year: 2012, month: 9 })).toEqual(
      RubyTime.local(2012, 9, 22, 15, 15, 10),
    );
    expect(RubyTime.local(2005, 2, 22, 15, 15, 10).change({ hour: 16 })).toEqual(
      RubyTime.local(2005, 2, 22, 16),
    );
    expect(RubyTime.local(2005, 2, 22, 15, 15, 10).change({ hour: 16, min: 45 })).toEqual(
      RubyTime.local(2005, 2, 22, 16, 45),
    );
    expect(RubyTime.local(2005, 2, 22, 15, 15, 10).change({ min: 45 })).toEqual(
      RubyTime.local(2005, 2, 22, 15, 45),
    );
    expect(RubyTime.local(2005, 1, 2, 11, 22, 33, 44).change({ hour: 5 })).toEqual(
      RubyTime.local(2005, 1, 2, 5, 0, 0, 0),
    );
    expect(RubyTime.local(2005, 1, 2, 11, 22, 33, 44).change({ min: 6 })).toEqual(
      RubyTime.local(2005, 1, 2, 11, 6, 0, 0),
    );
    expect(RubyTime.local(2005, 1, 2, 11, 22, 33, 44).change({ sec: 7 })).toEqual(
      RubyTime.local(2005, 1, 2, 11, 22, 7, 0),
    );
    expect(RubyTime.local(2005, 1, 2, 11, 22, 33, 44).change({ usec: 8 })).toEqual(
      RubyTime.local(2005, 1, 2, 11, 22, 33, 8),
    );
    expect(RubyTime.local(2005, 1, 2, 11, 22, 33, 2).change({ nsec: 8000 })).toEqual(
      RubyTime.local(2005, 1, 2, 11, 22, 33, 8),
    );
    await assertRaise([ArgumentError], {}, () =>
      RubyTime.local(2005, 1, 2, 11, 22, 33, 8).change({ usec: 1, nsec: 1 }),
    );
    await assertNothingRaised(() =>
      RubyTime.new(2015, 5, 9, 10, 0, 0, "+03:00").change({ nsec: 999999999 }),
    );
  });

  it("utc change", () => {
    expect(RubyTime.utc(2005, 2, 22, 15, 15, 10).change({ year: 2006 })).toEqual(
      RubyTime.utc(2006, 2, 22, 15, 15, 10),
    );
    expect(RubyTime.utc(2005, 2, 22, 15, 15, 10).change({ month: 6 })).toEqual(
      RubyTime.utc(2005, 6, 22, 15, 15, 10),
    );
    expect(RubyTime.utc(2005, 2, 22, 15, 15, 10).change({ year: 2012, month: 9 })).toEqual(
      RubyTime.utc(2012, 9, 22, 15, 15, 10),
    );
    expect(RubyTime.utc(2005, 2, 22, 15, 15, 10).change({ hour: 16 })).toEqual(
      RubyTime.utc(2005, 2, 22, 16),
    );
    expect(RubyTime.utc(2005, 2, 22, 15, 15, 10).change({ hour: 16, min: 45 })).toEqual(
      RubyTime.utc(2005, 2, 22, 16, 45),
    );
    expect(RubyTime.utc(2005, 2, 22, 15, 15, 10).change({ min: 45 })).toEqual(
      RubyTime.utc(2005, 2, 22, 15, 45),
    );
    expect(RubyTime.utc(2005, 1, 2, 11, 22, 33, 2).change({ nsec: 8000 })).toEqual(
      RubyTime.utc(2005, 1, 2, 11, 22, 33, 8),
    );
  });

  it("offset change", async () => {
    expect(RubyTime.new(2005, 2, 22, 15, 15, 10, "-08:00").change({ year: 2006 })).toEqual(
      RubyTime.new(2006, 2, 22, 15, 15, 10, "-08:00"),
    );
    expect(RubyTime.new(2005, 2, 22, 15, 15, 10, "-08:00").change({ month: 6 })).toEqual(
      RubyTime.new(2005, 6, 22, 15, 15, 10, "-08:00"),
    );
    expect(
      RubyTime.new(2005, 2, 22, 15, 15, 10, "-08:00").change({ year: 2012, month: 9 }),
    ).toEqual(RubyTime.new(2012, 9, 22, 15, 15, 10, "-08:00"));
    expect(RubyTime.new(2005, 2, 22, 15, 15, 10, "-08:00").change({ hour: 16 })).toEqual(
      RubyTime.new(2005, 2, 22, 16, 0, 0, "-08:00"),
    );
    expect(RubyTime.new(2005, 2, 22, 15, 15, 10, "-08:00").change({ hour: 16, min: 45 })).toEqual(
      RubyTime.new(2005, 2, 22, 16, 45, 0, "-08:00"),
    );
    expect(RubyTime.new(2005, 2, 22, 15, 15, 10, "-08:00").change({ min: 45 })).toEqual(
      RubyTime.new(2005, 2, 22, 15, 45, 0, "-08:00"),
    );
    expect(RubyTime.new(2005, 2, 22, 15, 15, 0, "-08:00").change({ sec: 10 })).toEqual(
      RubyTime.new(2005, 2, 22, 15, 15, 10, "-08:00"),
    );
    expect(RubyTime.new(2005, 2, 22, 15, 15, 0, "-08:00").change({ usec: 10 }).usec).toEqual(10);
    expect(RubyTime.new(2005, 2, 22, 15, 15, 0, "-08:00").change({ nsec: 10 }).nsec).toEqual(10);
    await assertRaise([ArgumentError], {}, () =>
      RubyTime.new(2005, 2, 22, 15, 15, 45, "-08:00").change({ usec: 1000000 }),
    );
    await assertRaise([ArgumentError], {}, () =>
      RubyTime.new(2005, 2, 22, 15, 15, 45, "-08:00").change({ nsec: 1000000000 }),
    );
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
    expect(oneAm1.epochNanoseconds).toBeLessThan(oneAm2.epochNanoseconds);

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

  it.skip("change preserves fractional seconds on zoned time", () => {
    // BLOCKED: activesupport-time-new-timezone-object-argument
    withTzDefault("US/Eastern", () => {
      const time = (RubyTime.new as any)(
        2005,
        10,
        30,
        0,
        0,
        new Rational(99, 100),
        timeZone(),
      ).plus(0);
      const time2 = change(time, { month: 1 }) as any;

      expect(time.inspect()).toEqual("2005-10-30 00:00:00.99 -0400");
      expect(time2.inspect()).toEqual("2005-01-30 00:00:00.99 -0500");
    });
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
    expect(one30Am1.epochNanoseconds).toBeLessThan(one30Am2.epochNanoseconds);

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
    expect(RubyTime.utc(2005, 2, 22, 15, 15, 10).advance({ years: 1 })).toEqual(
      RubyTime.utc(2006, 2, 22, 15, 15, 10),
    );
    expect(RubyTime.utc(2005, 2, 22, 15, 15, 10).advance({ months: 4 })).toEqual(
      RubyTime.utc(2005, 6, 22, 15, 15, 10),
    );
    expect(RubyTime.utc(2005, 2, 28, 15, 15, 10).advance({ weeks: 3 })).toEqual(
      RubyTime.utc(2005, 3, 21, 15, 15, 10),
    );
    expect(RubyTime.utc(2005, 2, 28, 15, 15, 10).advance({ weeks: 3.5 })).toEqual(
      RubyTime.utc(2005, 3, 25, 3, 15, 10),
    );
    expect(
      RubyTime.utc(2005, 2, 28, 15, 15, 10)
        .advance({ weeks: 3.7 })
        .minus(RubyTime.utc(2005, 3, 26, 12, 51, 10)),
    ).toBeCloseTo(0, 0);
    expect(RubyTime.utc(2005, 2, 28, 15, 15, 10).advance({ days: 5 })).toEqual(
      RubyTime.utc(2005, 3, 5, 15, 15, 10),
    );
    expect(RubyTime.utc(2005, 2, 28, 15, 15, 10).advance({ days: 5.5 })).toEqual(
      RubyTime.utc(2005, 3, 6, 3, 15, 10),
    );
    expect(
      RubyTime.utc(2005, 2, 28, 15, 15, 10)
        .advance({ days: 5.7 })
        .minus(RubyTime.utc(2005, 3, 6, 8, 3, 10)),
    ).toBeCloseTo(0, 0);
    expect(RubyTime.utc(2005, 2, 22, 15, 15, 10).advance({ years: 7, months: 7 })).toEqual(
      RubyTime.utc(2012, 9, 22, 15, 15, 10),
    );
    expect(
      RubyTime.utc(2005, 2, 22, 15, 15, 10).advance({ years: 7, months: 19, days: 11 }),
    ).toEqual(RubyTime.utc(2013, 10, 3, 15, 15, 10));
    expect(
      RubyTime.utc(2005, 2, 28, 15, 15, 10).advance({ years: 7, months: 19, weeks: 2, days: 5 }),
    ).toEqual(RubyTime.utc(2013, 10, 17, 15, 15, 10));
    expect(
      RubyTime.utc(2005, 2, 28, 15, 15, 10).advance({ years: -3, months: -2, days: -1 }),
    ).toEqual(RubyTime.utc(2001, 12, 27, 15, 15, 10));
    expect(RubyTime.utc(2004, 2, 29, 15, 15, 10).advance({ years: 1 })).toEqual(
      RubyTime.utc(2005, 2, 28, 15, 15, 10),
    );
    expect(RubyTime.utc(2005, 2, 28, 15, 15, 10).advance({ hours: 5 })).toEqual(
      RubyTime.utc(2005, 2, 28, 20, 15, 10),
    );
    expect(RubyTime.utc(2005, 2, 28, 15, 15, 10).advance({ minutes: 7 })).toEqual(
      RubyTime.utc(2005, 2, 28, 15, 22, 10),
    );
    expect(RubyTime.utc(2005, 2, 28, 15, 15, 10).advance({ seconds: 9 })).toEqual(
      RubyTime.utc(2005, 2, 28, 15, 15, 19),
    );
    expect(
      RubyTime.utc(2005, 2, 28, 15, 15, 10).advance({ hours: 5, minutes: 7, seconds: 9 }),
    ).toEqual(RubyTime.utc(2005, 2, 28, 20, 22, 19));
    expect(
      RubyTime.utc(2005, 2, 28, 15, 15, 10).advance({ hours: -5, minutes: -7, seconds: -9 }),
    ).toEqual(RubyTime.utc(2005, 2, 28, 10, 8, 1));
    expect(
      RubyTime.utc(2005, 2, 28, 15, 15, 10).advance({
        years: 7,
        months: 19,
        weeks: 2,
        days: 5,
        hours: 5,
        minutes: 7,
        seconds: 9,
      }),
    ).toEqual(RubyTime.utc(2013, 10, 17, 20, 22, 19));
  });

  it("offset advance", () => {
    expect(RubyTime.new(2005, 2, 22, 15, 15, 10, "-08:00").advance({ years: 1 })).toEqual(
      RubyTime.new(2006, 2, 22, 15, 15, 10, "-08:00"),
    );
    expect(RubyTime.new(2005, 2, 22, 15, 15, 10, "-08:00").advance({ months: 4 })).toEqual(
      RubyTime.new(2005, 6, 22, 15, 15, 10, "-08:00"),
    );
    expect(RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00").advance({ weeks: 3 })).toEqual(
      RubyTime.new(2005, 3, 21, 15, 15, 10, "-08:00"),
    );
    expect(RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00").advance({ weeks: 3.5 })).toEqual(
      RubyTime.new(2005, 3, 25, 3, 15, 10, "-08:00"),
    );
    expect(
      RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00")
        .advance({ weeks: 3.7 })
        .minus(RubyTime.new(2005, 3, 26, 12, 51, 10, "-08:00")),
    ).toBeCloseTo(0, 0);
    expect(RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00").advance({ days: 5 })).toEqual(
      RubyTime.new(2005, 3, 5, 15, 15, 10, "-08:00"),
    );
    expect(RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00").advance({ days: 5.5 })).toEqual(
      RubyTime.new(2005, 3, 6, 3, 15, 10, "-08:00"),
    );
    expect(
      RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00")
        .advance({ days: 5.7 })
        .minus(RubyTime.new(2005, 3, 6, 8, 3, 10, "-08:00")),
    ).toBeCloseTo(0, 0);
    expect(
      RubyTime.new(2005, 2, 22, 15, 15, 10, "-08:00").advance({ years: 7, months: 7 }),
    ).toEqual(RubyTime.new(2012, 9, 22, 15, 15, 10, "-08:00"));
    expect(
      RubyTime.new(2005, 2, 22, 15, 15, 10, "-08:00").advance({ years: 7, months: 19, days: 11 }),
    ).toEqual(RubyTime.new(2013, 10, 3, 15, 15, 10, "-08:00"));
    expect(
      RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00").advance({
        years: 7,
        months: 19,
        weeks: 2,
        days: 5,
      }),
    ).toEqual(RubyTime.new(2013, 10, 17, 15, 15, 10, "-08:00"));
    expect(
      RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00").advance({ years: -3, months: -2, days: -1 }),
    ).toEqual(RubyTime.new(2001, 12, 27, 15, 15, 10, "-08:00"));
    expect(RubyTime.new(2004, 2, 29, 15, 15, 10, "-08:00").advance({ years: 1 })).toEqual(
      RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00"),
    );
    expect(RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00").advance({ hours: 5 })).toEqual(
      RubyTime.new(2005, 2, 28, 20, 15, 10, "-08:00"),
    );
    expect(RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00").advance({ minutes: 7 })).toEqual(
      RubyTime.new(2005, 2, 28, 15, 22, 10, "-08:00"),
    );
    expect(RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00").advance({ seconds: 9 })).toEqual(
      RubyTime.new(2005, 2, 28, 15, 15, 19, "-08:00"),
    );
    expect(
      RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00").advance({ hours: 5, minutes: 7, seconds: 9 }),
    ).toEqual(RubyTime.new(2005, 2, 28, 20, 22, 19, "-08:00"));
    expect(
      RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00").advance({
        hours: -5,
        minutes: -7,
        seconds: -9,
      }),
    ).toEqual(RubyTime.new(2005, 2, 28, 10, 8, 1, "-08:00"));
    expect(
      RubyTime.new(2005, 2, 28, 15, 15, 10, "-08:00").advance({
        years: 7,
        months: 19,
        weeks: 2,
        days: 5,
        hours: 5,
        minutes: 7,
        seconds: 9,
      }),
    ).toEqual(RubyTime.new(2013, 10, 17, 20, 22, 19, "-08:00"));
  });

  it("advance with nsec", () => {
    const t = new Date(108.635108);
    const result = advance(t, { months: 0 });
    expect(result.epochMilliseconds).toBe(t.getTime());
  });

  it("advance gregorian proleptic", () => {
    expect(RubyTime.local(1582, 10, 15, 15, 15, 10).advance({ days: -1 })).toEqual(
      RubyTime.local(1582, 10, 14, 15, 15, 10),
    );
    expect(RubyTime.local(1582, 10, 14, 15, 15, 10).advance({ days: 1 })).toEqual(
      RubyTime.local(1582, 10, 15, 15, 15, 10),
    );
    expect(RubyTime.local(1582, 10, 4, 15, 15, 10).advance({ days: 1 })).toEqual(
      RubyTime.local(1582, 10, 5, 15, 15, 10),
    );
    expect(RubyTime.local(1582, 10, 5, 15, 15, 10).advance({ days: -1 })).toEqual(
      RubyTime.local(1582, 10, 4, 15, 15, 10),
    );
    expect(RubyTime.local(1000, 10, 4, 15, 15, 10).advance({ years: -1 })).toEqual(
      RubyTime.local(999, 10, 4, 15, 15, 10),
    );
    expect(RubyTime.local(999, 10, 4, 15, 15, 10).advance({ years: 1 })).toEqual(
      RubyTime.local(1000, 10, 4, 15, 15, 10),
    );
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
    withEnvTz("US/Eastern", () => {
      expect((RubyTime.local(2005, 3, 1, 15, 15, 10) as CalculationsTime).lastWeek()).toEqual(
        RubyTime.local(2005, 2, 21),
      );
      expect(
        (RubyTime.local(2005, 3, 1, 15, 15, 10) as CalculationsTime).lastWeek(":tuesday"),
      ).toEqual(RubyTime.local(2005, 2, 22));
      expect(
        (RubyTime.local(2005, 3, 1, 15, 15, 10) as CalculationsTime).lastWeek(":friday"),
      ).toEqual(RubyTime.local(2005, 2, 25));
      expect((RubyTime.local(2006, 11, 6, 0, 0, 0) as CalculationsTime).lastWeek()).toEqual(
        RubyTime.local(2006, 10, 30),
      );
      expect(
        (RubyTime.local(2006, 11, 23, 0, 0, 0) as CalculationsTime).lastWeek(":wednesday"),
      ).toEqual(RubyTime.local(2006, 11, 15));
    });
  });

  it("next week near daylight start", () => {
    withEnvTz("America/New_York", () => {
      const result = asDate(nextWeek(new Date(2006, 3, 2, 23, 1, 0), ":monday"));
      expect(result.getDate()).toBe(3);
      expect(result.getMonth()).toBe(3);
    });
  });

  it("next week near daylight end", () => {
    withEnvTz("America/New_York", () => {
      const result = asDate(nextWeek(new Date(2006, 9, 29, 23, 1, 0), ":monday"));
      expect(result.getDate()).toBe(30);
      expect(result.getMonth()).toBe(9);
    });
  });

  it("to fs", () => {
    const time = RubyTime.utc(2005, 2, 21, 17, 44, 30.12345678901);
    expect(toFs(time, "doesnt_exist")).toEqual(time.toS());
    expect(toFs(time, "db")).toEqual("2005-02-21 17:44:30");
    expect(toFs(time, "short")).toEqual("21 Feb 17:44");
    expect(toFs(time, "time")).toEqual("17:44");
    expect(toFs(time, "number")).toEqual("20050221174430");
    expect(toFs(time, "nsec")).toEqual("20050221174430123456789");
    expect(toFs(time, "usec")).toEqual("20050221174430123456");
    expect(toFs(time, "long")).toEqual("February 21, 2005 17:44");
    expect(toFs(time, "long_ordinal")).toEqual("February 21st, 2005 17:44");
    withEnvTz("UTC", () => {
      expect(toFs(time, "rfc822")).toEqual("Mon, 21 Feb 2005 17:44:30 +0000");
      expect(toFs(time, "rfc2822")).toEqual("Mon, 21 Feb 2005 17:44:30 -0000");
      expect(toFs(time, "inspect")).toEqual("2005-02-21 17:44:30.123456789 +0000");
    });
    withEnvTz("US/Central", () => {
      expect(toFs(RubyTime.local(2009, 2, 5, 14, 30, 5), "rfc822")).toEqual(
        "Thu, 05 Feb 2009 14:30:05 -0600",
      );
      expect(toFs(RubyTime.local(2008, 6, 9, 4, 5, 1), "rfc822")).toEqual(
        "Mon, 09 Jun 2008 04:05:01 -0500",
      );
      expect(toFs(RubyTime.local(2009, 2, 5, 14, 30, 5), "rfc2822")).toEqual(
        "Thu, 05 Feb 2009 14:30:05 -0600",
      );
      expect(toFs(RubyTime.local(2008, 6, 9, 4, 5, 1), "rfc2822")).toEqual(
        "Mon, 09 Jun 2008 04:05:01 -0500",
      );
      expect(toFs(RubyTime.local(2009, 2, 5, 14, 30, 5), "iso8601")).toEqual(
        "2009-02-05T14:30:05-06:00",
      );
      expect(toFs(RubyTime.local(2008, 6, 9, 4, 5, 1), "iso8601")).toEqual(
        "2008-06-09T04:05:01-05:00",
      );
      expect(toFs(RubyTime.utc(2009, 2, 5, 14, 30, 5), "iso8601")).toEqual("2009-02-05T14:30:05Z");
      expect(toFs(RubyTime.local(2009, 2, 5, 14, 30, 5), "inspect")).toEqual(
        "2009-02-05 14:30:05.000000000 -0600",
      );
      expect(toFs(RubyTime.local(2008, 6, 9, 4, 5, 1), "inspect")).toEqual(
        "2008-06-09 04:05:01.000000000 -0500",
      );
    });
    expect(toFs(time, "db")).toEqual("2005-02-21 17:44:30");
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
    const time = RubyTime.new(1999, 12, 31, 19, 0, new Rational(1, 8), -18000);
    expect(time.rfc3339(3)).toBe("1999-12-31T19:00:00.125-05:00");
  });

  it("to date", () => {
    expect(toDate(d(2005, 2, 21, 17, 44, 30)).equals(new Temporal.PlainDate(2005, 2, 21))).toBe(
      true,
    );
  });

  it.skip("to datetime", () => {
    // BLOCKED: activesupport-time-to-datetime-start-and-to-time
    expect(RubyDateTime.civil(2005, 2, 21, 17, 44, 30, 0)).toEqual(
      RubyTime.utc(2005, 2, 21, 17, 44, 30).toDatetime(),
    );
    withEnvTz("US/Eastern", () => {
      expect(
        RubyDateTime.civil(
          2005,
          2,
          21,
          17,
          44,
          30,
          new Rational(RubyTime.local(2005, 2, 21, 17, 44, 30).utcOffset, 86400),
        ),
      ).toEqual(RubyTime.local(2005, 2, 21, 17, 44, 30).toDatetime());
    });
    withEnvTz("NZ", () => {
      expect(
        RubyDateTime.civil(
          2005,
          2,
          21,
          17,
          44,
          30,
          new Rational(RubyTime.local(2005, 2, 21, 17, 44, 30).utcOffset, 86400),
        ),
      ).toEqual(RubyTime.local(2005, 2, 21, 17, 44, 30).toDatetime());
    });
    expect(RubyDate.ITALY).toEqual(
      (RubyTime.utc(2005, 2, 21, 17, 44, 30).toDatetime() as any).start,
    );
  });

  it("to time", () => {
    withEnvTz("US/Eastern", () => {
      expect(toTime(RubyTime.local(2005, 2, 21, 17, 44, 30)).constructor).toBe(RubyTime);
      expect(toTime(RubyTime.local(2005, 2, 21, 17, 44, 30))).toEqual(
        RubyTime.local(2005, 2, 21, 17, 44, 30),
      );
      expect(toTime(RubyTime.local(2005, 2, 21, 17, 44, 30)).utcOffset).toBe(
        RubyTime.local(2005, 2, 21, 17, 44, 30).utcOffset,
      );
    });
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

  it("xmlschema is available", async () => {
    await assertNothingRaised(() => RubyTime.now().xmlschema());
  });

  it("today with time local", () => {
    stubDateCurrent();
    expect(isToday(RubyTime.local(1999, 12, 31, 23, 59, 59))).toBe(false);
    expect(isToday(RubyTime.local(2000, 1, 1, 0))).toBe(true);
    expect(isToday(RubyTime.local(2000, 1, 1, 23, 59, 59))).toBe(true);
    expect(isToday(RubyTime.local(2000, 1, 2, 0))).toBe(false);
  });

  it("today with time utc", () => {
    stubDateCurrent();
    expect(isToday(RubyTime.utc(1999, 12, 31, 23, 59, 59))).toBe(false);
    expect(isToday(RubyTime.utc(2000, 1, 1, 0))).toBe(true);
    expect(isToday(RubyTime.utc(2000, 1, 1, 23, 59, 59))).toBe(true);
    expect(isToday(RubyTime.utc(2000, 1, 2, 0))).toBe(false);
  });

  it("yesterday with time local", () => {
    stubDateCurrent();
    expect(isYesterday(RubyTime.local(1999, 12, 31, 23, 59, 59))).toBe(true);
    expect(isYesterday(RubyTime.local(2000, 1, 1, 0))).toBe(false);
    expect(isYesterday(RubyTime.local(1999, 12, 31))).toBe(true);
    expect(isYesterday(RubyTime.local(2000, 1, 2, 0))).toBe(false);
  });

  it("yesterday with time utc", () => {
    stubDateCurrent();
    expect(isYesterday(RubyTime.utc(1999, 12, 31, 23, 59, 59))).toBe(true);
    expect(isYesterday(RubyTime.utc(2000, 1, 1, 0))).toBe(false);
    expect(isYesterday(RubyTime.utc(1999, 12, 31))).toBe(true);
    expect(isYesterday(RubyTime.utc(2000, 1, 2, 0))).toBe(false);
  });

  it("prev day with time utc", () => {
    stubDateCurrent();
    expect(isPrevDay(RubyTime.utc(1999, 12, 31, 23, 59, 59))).toBe(true);
    expect(isPrevDay(RubyTime.utc(2000, 1, 1, 0))).toBe(false);
    expect(isPrevDay(RubyTime.utc(1999, 12, 31))).toBe(true);
    expect(isPrevDay(RubyTime.utc(2000, 1, 2, 0))).toBe(false);
  });

  it("tomorrow with time local", () => {
    stubDateCurrent();
    expect(isTomorrow(RubyTime.local(1999, 12, 31, 23, 59, 59))).toBe(false);
    expect(isTomorrow(RubyTime.local(2000, 1, 2, 0))).toBe(true);
    expect(isTomorrow(RubyTime.local(2000, 1, 2, 23, 59, 59))).toBe(true);
    expect(isTomorrow(RubyTime.local(2000, 1, 1, 0))).toBe(false);
  });

  it("tomorrow with time utc", () => {
    stubDateCurrent();
    expect(isTomorrow(RubyTime.utc(1999, 12, 31, 23, 59, 59))).toBe(false);
    expect(isTomorrow(RubyTime.utc(2000, 1, 2, 0))).toBe(true);
    expect(isTomorrow(RubyTime.utc(2000, 1, 2, 23, 59, 59))).toBe(true);
    expect(isTomorrow(RubyTime.utc(2000, 1, 1, 0))).toBe(false);
  });

  it("next day with time utc", () => {
    stubDateCurrent();
    expect(isNextDay(RubyTime.utc(1999, 12, 31, 23, 59, 59))).toBe(false);
    expect(isNextDay(RubyTime.utc(2000, 1, 2, 0))).toBe(true);
    expect(isNextDay(RubyTime.utc(2000, 1, 2, 23, 59, 59))).toBe(true);
    expect(isNextDay(RubyTime.utc(2000, 1, 1, 0))).toBe(false);
  });

  it("past with time current as time local", () => {
    withEnvTz("US/Eastern", () => {
      withTimeCurrent(d(2005, 2, 10, 15, 30, 45), () => {
        expect(isPast(d(2005, 2, 10, 15, 30, 44))).toBe(true);
        expect(isPast(d(2005, 2, 10, 15, 30, 45))).toBe(false);
        expect(isPast(d(2005, 2, 10, 15, 30, 46))).toBe(false);
        expect(isPast(utc(2005, 2, 10, 20, 30, 44))).toBe(true);
        expect(isPast(utc(2005, 2, 10, 20, 30, 45))).toBe(false);
        expect(isPast(utc(2005, 2, 10, 20, 30, 46))).toBe(false);
      });
    });
  });

  it("past with time current as time with zone", () => {
    withEnvTz("US/Eastern", () => {
      const twz = inTimeZone(
        RubyTime.utc(2005, 2, 10, 15, 30, 45),
        "Central Time (US & Canada)",
      ) as TimeWithZone;
      withTimeCurrent(twz, () => {
        expect(isPast(d(2005, 2, 10, 10, 30, 44))).toBe(true);
        expect(isPast(d(2005, 2, 10, 10, 30, 45))).toBe(false);
        expect(isPast(d(2005, 2, 10, 10, 30, 46))).toBe(false);
        expect(isPast(utc(2005, 2, 10, 15, 30, 44))).toBe(true);
        expect(isPast(utc(2005, 2, 10, 15, 30, 45))).toBe(false);
        expect(isPast(utc(2005, 2, 10, 15, 30, 46))).toBe(false);
      });
    });
  });

  it("future with time current as time local", () => {
    withEnvTz("US/Eastern", () => {
      withTimeCurrent(d(2005, 2, 10, 15, 30, 45), () => {
        expect(isFuture(d(2005, 2, 10, 15, 30, 44))).toBe(false);
        expect(isFuture(d(2005, 2, 10, 15, 30, 45))).toBe(false);
        expect(isFuture(d(2005, 2, 10, 15, 30, 46))).toBe(true);
        expect(isFuture(utc(2005, 2, 10, 20, 30, 44))).toBe(false);
        expect(isFuture(utc(2005, 2, 10, 20, 30, 45))).toBe(false);
        expect(isFuture(utc(2005, 2, 10, 20, 30, 46))).toBe(true);
      });
    });
  });

  it("future with time current as time with zone", () => {
    withEnvTz("US/Eastern", () => {
      const twz = inTimeZone(
        RubyTime.utc(2005, 2, 10, 15, 30, 45),
        "Central Time (US & Canada)",
      ) as TimeWithZone;
      withTimeCurrent(twz, () => {
        expect(isFuture(d(2005, 2, 10, 10, 30, 44))).toBe(false);
        expect(isFuture(d(2005, 2, 10, 10, 30, 45))).toBe(false);
        expect(isFuture(d(2005, 2, 10, 10, 30, 46))).toBe(true);
        expect(isFuture(utc(2005, 2, 10, 15, 30, 44))).toBe(false);
        expect(isFuture(utc(2005, 2, 10, 15, 30, 45))).toBe(false);
        expect(isFuture(utc(2005, 2, 10, 15, 30, 46))).toBe(true);
      });
    });
  });

  it("acts like time", () => {
    assertPredicate(RubyTime.new(), (t) => t.actsLikeTime());
  });

  it("formatted offset with utc", () => {
    expect(formattedOffset(RubyTime.utc(2000))).toEqual("+00:00");
    expect(formattedOffset(RubyTime.utc(2000), false)).toEqual("+0000");
    expect(formattedOffset(RubyTime.utc(2000), true, "UTC")).toEqual("UTC");
  });

  it("formatted offset with local", () => {
    withEnvTz("US/Eastern", () => {
      expect(formattedOffset(RubyTime.local(2000))).toEqual("-05:00");
      expect(formattedOffset(RubyTime.local(2000), false)).toEqual("-0500");
      expect(formattedOffset(RubyTime.local(2000, 7))).toEqual("-04:00");
      expect(formattedOffset(RubyTime.local(2000, 7), false)).toEqual("-0400");
    });
  });

  it("compare with time", () => {
    expect(RubyTime.utc(2000).compare(RubyTime.utc(1999, 12, 31, 23, 59, 59, 999))).toBe(1);
    expect(RubyTime.utc(2000).compare(RubyTime.utc(2000, 1, 1, 0, 0, 0))).toBe(0);
    expect(RubyTime.utc(2000).compare(RubyTime.utc(2000, 1, 1, 0, 0, 0, 1))).toBe(-1);
  });

  it("compare with datetime", () => {
    expect(RubyTime.utc(2000).compare(RubyDateTime.civil(1999, 12, 31, 23, 59, 59))).toBe(1);
    expect(RubyTime.utc(2000).compare(RubyDateTime.civil(2000, 1, 1, 0, 0, 0))).toBe(0);
    expect(RubyTime.utc(2000).compare(RubyDateTime.civil(2000, 1, 1, 0, 0, 1))).toBe(-1);
  });

  it("compare with time with zone", () => {
    expect(
      RubyTime.utc(2000).compare(
        new TimeWithZone(RubyTime.utc(1999, 12, 31, 23, 59, 59), TimeZone.find("UTC")!),
      ),
    ).toBe(1);
    expect(
      RubyTime.utc(2000).compare(
        new TimeWithZone(RubyTime.utc(2000, 1, 1, 0, 0, 0), TimeZone.find("UTC")!),
      ),
    ).toBe(0);
    expect(
      RubyTime.utc(2000).compare(
        new TimeWithZone(RubyTime.utc(2000, 1, 1, 0, 0, 1), TimeZone.find("UTC")!),
      ),
    ).toBe(-1);
  });

  it("compare with string", () => {
    expect(RubyTime.utc(2000).compare(RubyTime.utc(1999, 12, 31, 23, 59, 59, 999).toS())).toBe(1);
    expect(RubyTime.utc(2000).compare(RubyTime.utc(2000, 1, 1, 0, 0, 0).toS())).toBe(0);
    expect(RubyTime.utc(2000).compare(RubyTime.utc(2000, 1, 1, 0, 0, 1, 0).toS())).toBe(-1);
    assertNil(RubyTime.utc(2000).compare("Invalid as Time"));
  });

  it("at with datetime", () => {
    expect(
      RubyTime.at(RubyDateTime.civil(2000, 1, 1, 0, 0, 0))
        .toR()
        .toString(),
    ).toBe(RubyTime.utc(2000, 1, 1, 0, 0, 0).toR().toString());

    expect(() =>
      expect(RubyTime.at(RubyDateTime.civil(2000, 1, 1, 0, 0, 0), 0)).toEqual(
        RubyTime.utc(2000, 1, 1, 0, 0, 0),
      ),
    ).toThrow(TypeError);
  });

  it("at with datetime returns local time", () => {
    withEnvTz("US/Eastern", () => {
      let dt = RubyDateTime.civil(2000, 1, 1, 0, 0, 0, 0);
      expect(RubyTime.at(dt).toR().toString()).toBe(
        RubyTime.local(1999, 12, 31, 19, 0, 0).toR().toString(),
      );
      expect(RubyTime.at(dt).zone).toBe("EST");
      expect(RubyTime.at(dt).utcOffset).toBe(-18000);

      dt = RubyDateTime.civil(2000, 7, 1, 1, 0, 0, new Rational(1, 24));
      expect(RubyTime.at(dt).toR().toString()).toBe(
        RubyTime.local(2000, 6, 30, 20, 0, 0).toR().toString(),
      );
      expect(RubyTime.at(dt).zone).toBe("EDT");
      expect(RubyTime.at(dt).utcOffset).toBe(-14400);
    });
  });

  it("at with time with zone", () => {
    const twz = new TimeWithZone(RubyTime.utc(2000, 1, 1, 0, 0, 0), TimeZone.find("UTC")!);
    expect(RubyTime.at(twz).toR().toString()).toBe(
      RubyTime.utc(2000, 1, 1, 0, 0, 0).toR().toString(),
    );

    expect(() => expect(RubyTime.at(twz, 0)).toEqual(RubyTime.utc(2000, 1, 1, 0, 0, 0))).toThrow(
      TypeError,
    );
  });

  it("at with in option", () => {
    expect((RubyTime.at as any)(31337, { in: -28800 })).toEqual(
      RubyTime.new(1970, 1, 1, 0, 42, 17, "-08:00"),
    );
  });

  it("at with time with zone returns local time", () => {
    withEnvTz("US/Eastern", () => {
      let twz = new TimeWithZone(RubyTime.utc(2000, 1, 1, 0, 0, 0), TimeZone.find("London")!);
      expect(RubyTime.at(twz).toR().toString()).toBe(
        RubyTime.local(1999, 12, 31, 19, 0, 0).toR().toString(),
      );
      expect(RubyTime.at(twz).zone).toBe("EST");
      expect(RubyTime.at(twz).utcOffset).toBe(-18000);

      twz = new TimeWithZone(RubyTime.utc(2000, 7, 1, 0, 0, 0), TimeZone.find("London")!);
      expect(RubyTime.at(twz).toR().toString()).toBe(
        RubyTime.local(2000, 6, 30, 20, 0, 0).toR().toString(),
      );
      expect(RubyTime.at(twz).zone).toBe("EDT");
      expect(RubyTime.at(twz).utcOffset).toBe(-14400);
    });
  });

  it("at with time microsecond precision", () => {
    const t = utc(2000, 1, 1, 0, 0, 0);
    expect(t.getTime()).toBe(Date.UTC(2000, 0, 1));
  });

  it("at with utc time", () => {
    withEnvTz("US/Eastern", () => {
      expect(RubyTime.at(RubyTime.utc(2000))).toEqual(RubyTime.utc(2000));
      expect(RubyTime.at(RubyTime.utc(2000)).zone).toEqual("UTC");
      expect(RubyTime.at(RubyTime.utc(2000)).utcOffset).toEqual(0);
    });
  });

  it("at with local time", () => {
    withEnvTz("US/Eastern", () => {
      expect(RubyTime.at(RubyTime.local(2000))).toEqual(RubyTime.local(2000));
      expect(RubyTime.at(RubyTime.local(2000)).zone).toEqual("EST");
      expect(RubyTime.at(RubyTime.local(2000)).utcOffset).toEqual(-18000);
      expect(RubyTime.at(RubyTime.local(2000, 7, 1))).toEqual(RubyTime.local(2000, 7, 1));
      expect(RubyTime.at(RubyTime.local(2000, 7, 1)).zone).toEqual("EDT");
      expect(RubyTime.at(RubyTime.local(2000, 7, 1)).utcOffset).toEqual(-14400);
    });
  });

  it("eql?", () => {
    expect(
      RubyTime.utc(2000).eql(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("UTC")!)),
    ).toBe(true);
    expect(
      RubyTime.utc(2000).eql(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("Hawaii")!)),
    ).toBe(true);
    expect(
      RubyTime.utc(2000, 1, 1, 0, 0, 1).eql(
        new TimeWithZone(RubyTime.utc(2000), TimeZone.find("UTC")!),
      ),
    ).toBe(false);
  });

  it("minus with time with zone", () => {
    expect(
      RubyTime.utc(2000, 1, 2).minusWithCoercion(
        new TimeWithZone(RubyTime.utc(2000, 1, 1), TimeZone.find("UTC")!),
      ),
    ).toBe(86_400.0);
  });

  it("minus with datetime", () => {
    expect(RubyTime.utc(2000, 1, 2).minusWithCoercion(RubyDateTime.civil(2000, 1, 1))).toBe(
      86_400.0,
    );
  });

  it("time created with local constructor cannot represent times during hour skipped by dst", () => {
    withEnvTz("US/Eastern", () => {
      expect(RubyTime.local(2006, 4, 2, 2)).toEqual(RubyTime.local(2006, 4, 2, 3));
      assertPredicate(RubyTime.local(2006, 4, 2, 2), (t) => t.isDst());
    });
  });

  it("case equality", () => {
    class Sub extends RubyTime {}
    const utcZone = TimeZone.find("UTC")!;
    expect(RubyTime.utc(2000) instanceof RubyTime).toBeTruthy();
    expect(new TimeWithZone(RubyTime.utc(2000), utcZone) instanceof RubyTime).toBeTruthy();
    expect(Sub.utc(2000) instanceof RubyTime).toBeTruthy();
    expect(RubyDateTime.civil(2000) instanceof RubyTime).toEqual(false);
    expect(RubyTime.utc(2000) instanceof Sub).toEqual(false);
    expect(new TimeWithZone(RubyTime.utc(2000), utcZone) instanceof Sub).toEqual(false);
  });

  it("all day with timezone", () => {
    const beginningOfDay = new TimeWithZone(
      null,
      TimeZone.find("Hawaii")!,
      RubyTime.local(2011, 6, 7, 0, 0, 0),
    );
    const endOfDay = new TimeWithZone(
      null,
      TimeZone.find("Hawaii")!,
      RubyTime.local(2011, 6, 7, 23, 59, 59, new Rational(999999999, 1000)),
    );
    expect(
      (
        new TimeWithZone(
          RubyTime.local(2011, 6, 7, 10, 10, 10),
          TimeZone.find("Hawaii")!,
        ) as TimeWithZone & { allDay(): Range<TimeWithZone> }
      ).allDay().begin,
    ).toEqual(beginningOfDay);
    expect(
      (
        new TimeWithZone(
          RubyTime.local(2011, 6, 7, 10, 10, 10),
          TimeZone.find("Hawaii")!,
        ) as TimeWithZone & { allDay(): Range<TimeWithZone> }
      ).allDay().end,
    ).toEqual(endOfDay);
  });

  it("rfc3339 parse", async () => {
    const time = RubyTime.rfc3339("1999-12-31T19:00:00.125-05:00");
    expect(time.year).toEqual(1999);
    expect(time.month).toEqual(12);
    expect(time.day).toEqual(31);
    expect(time.hour).toEqual(19);
    expect(time.min).toEqual(0);
    expect(time.sec).toEqual(0);
    expect(time.usec).toEqual(125000);
    expect(time.utcOffset).toEqual(-18000);
    let exception = await assertRaises([ArgumentError], {}, () => RubyTime.rfc3339("1999-12-31"));
    expect(exception.message).toEqual("invalid date");
    exception = await assertRaises([ArgumentError], {}, () =>
      RubyTime.rfc3339("1999-12-31T19:00:00"),
    );
    expect(exception.message).toEqual("invalid date");
    exception = await assertRaises([ArgumentError], {}, () => RubyTime.rfc3339("foobar"));
    expect(exception.message).toEqual("invalid date");
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
    expect(RubyTime.local(2005, 2, 22, 10, 10, 10).since(1)).toEqual(
      RubyTime.local(2005, 2, 22, 10, 10, 11),
    );
    expect(RubyTime.local(2005, 2, 22, 10, 10, 10).since(3600)).toEqual(
      RubyTime.local(2005, 2, 22, 11, 10, 10),
    );
    expect(RubyTime.local(2005, 2, 22, 10, 10, 10).since(86400 * 2)).toEqual(
      RubyTime.local(2005, 2, 24, 10, 10, 10),
    );
    expect(RubyTime.local(2005, 2, 22, 10, 10, 10).since(86400 * 2 + 3600 + 25)).toEqual(
      RubyTime.local(2005, 2, 24, 11, 10, 35),
    );
    expect(RubyTime.utc(2038, 1, 18, 11, 59, 59).since(86400 * 2)).toEqual(
      RubyDateTime.civil(2038, 1, 20, 11, 59, 59),
    );
  });

  it.skip("advance", () => {
    // BLOCKED: activesupport-time-new-timezone-object-argument
    expect(RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ years: 1 })).toEqual(
      RubyTime.local(2006, 2, 28, 15, 15, 10),
    );
    expect(RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ months: 4 })).toEqual(
      RubyTime.local(2005, 6, 28, 15, 15, 10),
    );
    expect(RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ weeks: 3 })).toEqual(
      RubyTime.local(2005, 3, 21, 15, 15, 10),
    );
    expect(RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ weeks: 3.5 })).toEqual(
      RubyTime.local(2005, 3, 25, 3, 15, 10),
    );
    expect(
      RubyTime.local(2005, 2, 28, 15, 15, 10)
        .advance({ weeks: 3.7 })
        .minus(RubyTime.local(2005, 3, 26, 12, 51, 10)),
    ).toBeCloseTo(0, 0);
    expect(RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ days: 5 })).toEqual(
      RubyTime.local(2005, 3, 5, 15, 15, 10),
    );
    expect(RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ days: 5.5 })).toEqual(
      RubyTime.local(2005, 3, 6, 3, 15, 10),
    );
    expect(
      RubyTime.local(2005, 2, 28, 15, 15, 10)
        .advance({ days: 5.7 })
        .minus(RubyTime.local(2005, 3, 6, 8, 3, 10)),
    ).toBeCloseTo(0, 0);
    expect(RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ years: 7, months: 7 })).toEqual(
      RubyTime.local(2012, 9, 28, 15, 15, 10),
    );
    expect(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ years: 7, months: 19, days: 5 }),
    ).toEqual(RubyTime.local(2013, 10, 3, 15, 15, 10));
    expect(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ years: 7, months: 19, weeks: 2, days: 5 }),
    ).toEqual(RubyTime.local(2013, 10, 17, 15, 15, 10));
    expect(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ years: -3, months: -2, days: -1 }),
    ).toEqual(RubyTime.local(2001, 12, 27, 15, 15, 10));
    expect(RubyTime.local(2004, 2, 29, 15, 15, 10).advance({ years: 1 })).toEqual(
      RubyTime.local(2005, 2, 28, 15, 15, 10),
    );
    expect(RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ hours: 5 })).toEqual(
      RubyTime.local(2005, 2, 28, 20, 15, 10),
    );
    expect(RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ minutes: 7 })).toEqual(
      RubyTime.local(2005, 2, 28, 15, 22, 10),
    );
    expect(RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ seconds: 9 })).toEqual(
      RubyTime.local(2005, 2, 28, 15, 15, 19),
    );
    expect(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ hours: 5, minutes: 7, seconds: 9 }),
    ).toEqual(RubyTime.local(2005, 2, 28, 20, 22, 19));
    expect(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ hours: -5, minutes: -7, seconds: -9 }),
    ).toEqual(RubyTime.local(2005, 2, 28, 10, 8, 1));
    expect(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({
        years: 7,
        months: 19,
        weeks: 2,
        days: 5,
        hours: 5,
        minutes: 7,
        seconds: 9,
      }),
    ).toEqual(RubyTime.local(2013, 10, 17, 20, 22, 19));

    const moscow = TimeZone.find("Moscow")!;
    expect(RubyTime.new(2021, 5, 29, 0, 0, 0, "+03:00")).toEqual(
      (RubyTime.new as any)(2021, 5, 29, 0, 0, 0, moscow),
    );
    expect(RubyTime.new(2021, 5, 29, 0, 0, 0, "+03:00").advance({ seconds: 60 })).toEqual(
      (RubyTime.new as any)(2021, 5, 29, 0, 0, 0, moscow).advance({ seconds: 60 }),
    );
    expect(RubyTime.new(2021, 5, 29, 0, 0, 0, "+03:00").advance({ days: 3 })).toEqual(
      (RubyTime.new as any)(2021, 5, 29, 0, 0, 0, moscow).advance({ days: 3 }),
    );

    expect(TimeZone.find("Moscow")!.local(2021, 5, 29, 0, 0, 0)).toEqual(
      RubyTime.new(2021, 5, 29, 0, 0, 0, "+03:00"),
    );
    expect(TimeZone.find("Moscow")!.local(2021, 5, 29, 0, 0, 0).advance({ seconds: 60 })).toEqual(
      RubyTime.new(2021, 5, 29, 0, 0, 0, "+03:00").advance({ seconds: 60 }),
    );
    expect(TimeZone.find("Moscow")!.local(2021, 5, 29, 0, 0, 0).advance({ days: 3 })).toEqual(
      RubyTime.new(2021, 5, 29, 0, 0, 0, "+03:00").advance({ days: 3 }),
    );
  });

  it("prev day with time local", () => {
    stubDateCurrent();
    expect(isPrevDay(RubyTime.local(1999, 12, 31, 23, 59, 59))).toBe(true);
    expect(isPrevDay(RubyTime.local(2000, 1, 1, 0))).toBe(false);
    expect(isPrevDay(RubyTime.local(1999, 12, 31))).toBe(true);
    expect(isPrevDay(RubyTime.local(2000, 1, 2, 0))).toBe(false);
  });

  it("next day with time local", () => {
    stubDateCurrent();
    expect(isNextDay(RubyTime.local(1999, 12, 31, 23, 59, 59))).toBe(false);
    expect(isNextDay(RubyTime.local(2000, 1, 2, 0))).toBe(true);
    expect(isNextDay(RubyTime.local(2000, 1, 2, 23, 59, 59))).toBe(true);
    expect(isNextDay(RubyTime.local(2000, 1, 1, 0))).toBe(false);
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
