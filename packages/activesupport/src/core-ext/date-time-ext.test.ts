import { describe, it, expect, afterEach, vi } from "vitest";
import {
  Date as RubyDate,
  DateTime,
  DateTime as RubyDateTime,
  Temporal,
  Time,
  resetLocalTimeZoneId,
} from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import { actsLike } from "./object/acts-like.js";
import {
  advance,
  ago,
  beginningOfDay,
  beginningOfHour,
  beginningOfMinute,
  change,
  compare,
  current,
  endOfDay,
  endOfHour,
  endOfMinute,
  getlocal,
  getutc,
  isUtc,
  localtime,
  middleOfDay,
  secondsSinceMidnight,
  secondsUntilEndOfDay,
  since,
  subsec,
  utc,
  utcOffset,
} from "./date-time/calculations.js";
import {
  civilFromFormat,
  formattedOffset,
  nsec,
  readableInspect,
  toF,
  toFormattedS,
  toFs,
  toI,
  usec,
} from "./date-time/conversions.js";
import { setFrozenTime } from "../time-travel.js";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../values/time-zone.js";
import { setZone } from "../time-zone-config.js";
import { ArgumentError } from "../hash-utils.js";
import {
  endOfMonth,
  isFuture,
  isNextDay,
  isPast,
  isPrevDay,
  isToday,
  isTomorrow,
  isYesterday,
  lastQuarter,
  lastWeek,
} from "./date-and-time/calculations.js";
import { preserveTimezone } from "./date-and-time/compatibility.js";
import { isBlank } from "./object/blank.js";
import { assertNotPredicate, assertPredicate, assertNil } from "../testing/assertions.js";
import { DATE_FORMATS } from "./time/conversions.js";
import { toTime } from "./time/compatibility.js";

afterEach(() => {
  setFrozenTime(null);
  setZone(null);
});

function asDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

function withEnvTz<T>(tz: string, fn: () => T): T {
  vi.stubEnv("TZ", tz);
  resetLocalTimeZoneId();
  try {
    return fn();
  } finally {
    vi.unstubAllEnvs();
    resetLocalTimeZoneId();
  }
}

function withDateCurrent<T>(today: Temporal.PlainDate, fn: () => T): T {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(today.year, today.month - 1, today.day, 12));
  try {
    return fn();
  } finally {
    vi.useRealTimers();
  }
}

function withFrozen<T>(
  now: Time | Temporal.ZonedDateTime | Temporal.PlainDateTime,
  fn: () => T,
): T {
  const instant =
    now instanceof Time
      ? now.toTime().toInstant()
      : now instanceof Temporal.PlainDateTime
        ? now.toZonedDateTime("UTC").toInstant()
        : now.toInstant();
  setFrozenTime(new Date(instant.epochMilliseconds));
  try {
    return fn();
  } finally {
    setFrozenTime(null);
  }
}

function sameInstant(expected: Time, actual: Temporal.ZonedDateTime): void {
  expect(actual.epochNanoseconds).toBe(expected.toTime().epochNanoseconds);
}

function sameTime(actual: Time, expected: Time): void {
  expect(actual.toTime().epochNanoseconds).toBe(expected.toTime().epochNanoseconds);
}

function d(year: number, month: number, day: number, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(year, month - 1, day, hour, min, sec, ms);
}

function dt(
  year: number,
  month = 1,
  day = 1,
  hour = 0,
  min = 0,
  sec: number | Rational = 0,
): Temporal.PlainDateTime | Temporal.ZonedDateTime {
  return DateTime.civil(year, month, day, hour, min, sec);
}

const END_OF_PERIOD_SEC = new Rational(59999999999, 1000000000);

describe("DateTimeExtCalculationsTest", () => {
  it("to fs", () => {
    const datetime = dt(2005, 2, 21, 14, 30, 0);
    expect(toFs(datetime, "db")).toBe("2005-02-21 14:30:00");
    expect(toFs(datetime, "inspect")).toBe("2005-02-21 14:30:00.000000000 +0000");
    expect(toFs(datetime, "time")).toBe("14:30");
    expect(toFs(datetime, "short")).toBe("21 Feb 14:30");
    expect(toFs(datetime, "long")).toBe("February 21, 2005 14:30");
    expect(toFs(datetime, "rfc822")).toBe("Mon, 21 Feb 2005 14:30:00 +0000");
    expect(toFs(datetime, "rfc2822")).toBe("Mon, 21 Feb 2005 14:30:00 +0000");
    expect(toFs(datetime, "long_ordinal")).toBe("February 21st, 2005 14:30");
    expect(toFs(datetime)).toMatch(/^2005-02-21T14:30:00(Z|\+00:00)$/);
    expect(toFs(datetime, "not_existent")).toMatch(/^2005-02-21T14:30:00(Z|\+00:00)$/);

    expect(
      toFs(DateTime.civil(2009, 2, 5, 14, 30, 5, new Rational(-21600, 86400)), "iso8601"),
    ).toBe("2009-02-05T14:30:05-06:00");
    expect(toFs(DateTime.civil(2008, 6, 9, 4, 5, 1, new Rational(-18000, 86400)), "iso8601")).toBe(
      "2008-06-09T04:05:01-05:00",
    );
    expect(toFs(DateTime.civil(2009, 2, 5, 14, 30, 5), "iso8601")).toBe(
      "2009-02-05T14:30:05+00:00",
    );

    expect(toFormattedS(datetime, "db")).toBe("2005-02-21 14:30:00");
  });

  it("readable inspect", () => {
    const datetime = dt(2005, 2, 21, 14, 30, 0);
    expect(readableInspect(datetime)).toBe("Mon, 21 Feb 2005 14:30:00 +0000");
    expect(readableInspect(datetime)).toBe(toFs(datetime, "rfc822"));
  });

  it("to fs with custom date format", () => {
    DATE_FORMATS.custom = "%Y%m%d%H%M%S";
    try {
      expect(toFs(dt(2005, 2, 21, 14, 30, 0), "custom")).toBe("20050221143000");
    } finally {
      delete DATE_FORMATS.custom;
    }
  });

  it("localtime", () => {
    withEnvTz("US/Eastern", () => {
      expect(localtime(DateTime.civil(2016, 3, 11, 15, 11, 12, 0))).toBeInstanceOf(Time);
      sameTime(
        localtime(DateTime.civil(2016, 3, 11, 15, 11, 12, 0)),
        Time.local(2016, 3, 11, 10, 11, 12),
      );
      sameTime(
        localtime(DateTime.civil(2016, 3, 21, 15, 11, 12, 0)),
        Time.local(2016, 3, 21, 11, 11, 12),
      );
      sameTime(
        localtime(DateTime.civil(2016, 4, 1, 16, 11, 12, new Rational(1, 24))),
        Time.local(2016, 4, 1, 11, 11, 12),
      );
    });
  });

  it("getlocal", () => {
    withEnvTz("US/Eastern", () => {
      expect(getlocal(DateTime.civil(2016, 3, 11, 15, 11, 12, 0))).toBeInstanceOf(Time);
      sameTime(
        getlocal(DateTime.civil(2016, 3, 11, 15, 11, 12, 0)),
        Time.local(2016, 3, 11, 10, 11, 12),
      );
      sameTime(
        getlocal(DateTime.civil(2016, 3, 21, 15, 11, 12, 0)),
        Time.local(2016, 3, 21, 11, 11, 12),
      );
      sameTime(
        getlocal(DateTime.civil(2016, 4, 1, 16, 11, 12, new Rational(1, 24))),
        Time.local(2016, 4, 1, 11, 11, 12),
      );
    });
  });

  it("to date", () => {
    expect(new RubyDateTime(DateTime.civil(2005, 2, 21, 14, 30, 0)).toDate().toString()).toBe(
      new RubyDate(2005, 2, 21).toDate().toString(),
    );
  });

  it("to datetime", () => {
    const dt = Temporal.PlainDateTime.from("2005-02-22T10:10:10");
    const result = toTime(dt);
    expect(result.epochNanoseconds).toBe(dt.toZonedDateTime("UTC").epochNanoseconds);
  });

  it("to time", () => {
    withEnvTz("US/Eastern", () => {
      expect(toTime(DateTime.civil(2005, 2, 21, 10, 11, 12, 0))).toBeInstanceOf(
        Temporal.ZonedDateTime,
      );

      if (preserveTimezone()) {
        sameInstant(
          Time.local(2005, 2, 21, 5, 11, 12).getlocal(0),
          toTime(DateTime.civil(2005, 2, 21, 10, 11, 12, 0)),
        );
        // eslint-disable-next-line vitest/no-conditional-expect
        expect(toTime(DateTime.civil(2005, 2, 21, 10, 11, 12, 0)).offsetNanoseconds / 1e9).toBe(
          Time.local(2005, 2, 21, 5, 11, 12).getlocal(0).utcOffset,
        );
      } else {
        sameInstant(
          Time.local(2005, 2, 21, 5, 11, 12),
          toTime(DateTime.civil(2005, 2, 21, 10, 11, 12, 0)),
        );
        // eslint-disable-next-line vitest/no-conditional-expect
        expect(toTime(DateTime.civil(2005, 2, 21, 10, 11, 12, 0)).offsetNanoseconds / 1e9).toBe(
          Time.local(2005, 2, 21, 5, 11, 12).utcOffset,
        );
      }
    });
  });

  it("to time preserves fractional seconds", () => {
    const dt = Temporal.PlainDateTime.from("2005-02-22T10:10:10.5");
    const result = toTime(dt);
    expect(result.millisecond).toBe(500);
  });

  it("civil from format", () => {
    expect(civilFromFormat("local", 2010, 5, 4).toPlainDateTime().toString()).toBe(
      "2010-05-04T00:00:00",
    );
    expect(civilFromFormat("utc", 2010, 5, 4).epochMilliseconds).toBe(Date.UTC(2010, 4, 4));
  });

  it("middle of day", () => {
    expect(middleOfDay(dt(2005, 2, 4, 10, 10, 10)).toString()).toBe(
      dt(2005, 2, 4, 12, 0, 0).toString(),
    );
  });

  it("beginning of minute", () => {
    expect(beginningOfMinute(dt(2005, 2, 4, 19, 30, 10)).toString()).toBe(
      dt(2005, 2, 4, 19, 30, 0).toString(),
    );
  });

  it("end of minute", () => {
    expect(endOfMinute(dt(2005, 2, 4, 19, 30, 10)).toString()).toBe(
      dt(2005, 2, 4, 19, 30, END_OF_PERIOD_SEC).toString(),
    );
  });

  it("end of month", () => {
    expect(endOfMonth.call(DateTime.civil(2005, 3, 20, 10, 10, 10)).toString()).toBe(
      DateTime.civil(2005, 3, 31, 23, 59, END_OF_PERIOD_SEC).toString(),
    );
    expect(endOfMonth.call(DateTime.civil(2005, 2, 20, 10, 10, 10)).toString()).toBe(
      DateTime.civil(2005, 2, 28, 23, 59, END_OF_PERIOD_SEC).toString(),
    );
    expect(endOfMonth.call(DateTime.civil(2005, 4, 20, 10, 10, 10)).toString()).toBe(
      DateTime.civil(2005, 4, 30, 23, 59, END_OF_PERIOD_SEC).toString(),
    );
  });

  it("change", () => {
    const receiver = dt(2005, 2, 22, 15, 15, 10);
    expect(change(receiver, { year: 2006 }).toString()).toBe(
      dt(2006, 2, 22, 15, 15, 10).toString(),
    );
    expect(change(receiver, { month: 6 }).toString()).toBe(dt(2005, 6, 22, 15, 15, 10).toString());
    expect(change(receiver, { year: 2012, month: 9 }).toString()).toBe(
      dt(2012, 9, 22, 15, 15, 10).toString(),
    );
    expect(change(receiver, { hour: 16 }).toString()).toBe(dt(2005, 2, 22, 16).toString());
    expect(change(receiver, { hour: 16, min: 45 }).toString()).toBe(
      dt(2005, 2, 22, 16, 45).toString(),
    );
    expect(change(receiver, { min: 45 }).toString()).toBe(dt(2005, 2, 22, 15, 45).toString());

    expect(change(dt(2005, 2, 22, 15, 15, 10), { offset: new Rational(-5, 24) }).toString()).toBe(
      DateTime.civil(2005, 2, 22, 15, 15, 10, new Rational(-5, 24)).toString(),
    );

    expect(change(dt(2005, 2, 22, 15, 15, 10.7), { day: 1 }).toString()).toBe(
      dt(2005, 2, 1, 15, 15, 10.7).toString(),
    );
    expect(change(dt(2005, 1, 2, 11, 22, 33), { usec: 8 }).toString()).toBe(
      dt(2005, 1, 2, 11, 22, new Rational(33000008, 1000000)).toString(),
    );
    expect(change(dt(2005, 1, 2, 11, 22, 33), { nsec: 8000 }).toString()).toBe(
      dt(2005, 1, 2, 11, 22, new Rational(33000008, 1000000)).toString(),
    );
    expect(() => change(dt(2005, 1, 2, 11, 22, 0), { usec: 1, nsec: 1 })).toThrow(ArgumentError);
    expect(() => change(dt(2005, 1, 2, 11, 22, 0), { usec: 1000000 })).toThrow(ArgumentError);
    expect(() => change(dt(2005, 1, 2, 11, 22, 0), { nsec: 1000000000 })).toThrow(ArgumentError);
    expect(() => change(dt(2005, 1, 2, 11, 22, 0), { usec: 999999 })).not.toThrow();
    expect(() => change(dt(2005, 1, 2, 11, 22, 0), { nsec: 999999999 })).not.toThrow();
  });

  it("advance partial days", () => {
    expect(advance(dt(2012, 9, 28, 1, 15, 10), { days: 1.5 }).toString()).toBe(
      dt(2012, 9, 29, 13, 15, 10).toString(),
    );
    expect(advance(dt(2012, 9, 28, 1, 15, 10), { days: 0.5 }).toString()).toBe(
      dt(2012, 9, 28, 13, 15, 10).toString(),
    );
    expect(advance(dt(2012, 9, 28, 1, 15, 10), { days: 1.5, months: 1 }).toString()).toBe(
      dt(2012, 10, 29, 13, 15, 10).toString(),
    );
  });

  it("advanced processes first the date deltas and then the time deltas", () => {
    expect(advance(dt(2010, 2, 28, 23, 59, 59), { months: 1, seconds: 1 }).toString()).toBe(
      dt(2010, 3, 29).toString(),
    );
    expect(advance(dt(2010, 2, 28, 23, 59), { months: 1, minutes: 1 }).toString()).toBe(
      dt(2010, 3, 29).toString(),
    );
    expect(advance(dt(2010, 2, 28, 23), { months: 1, hours: 1 }).toString()).toBe(
      dt(2010, 3, 29).toString(),
    );
    expect(
      advance(dt(2010, 2, 28, 22, 58, 59), {
        months: 1,
        hours: 1,
        minutes: 1,
        seconds: 1,
      }).toString(),
    ).toBe(dt(2010, 3, 29).toString());
  });

  it("last week", () => {
    expect(lastWeek.call(DateTime.civil(2005, 3, 1, 15, 15, 10)).toString()).toBe(
      DateTime.civil(2005, 2, 21).toString(),
    );
    expect(lastWeek.call(DateTime.civil(2005, 3, 1, 15, 15, 10), ":tuesday").toString()).toBe(
      DateTime.civil(2005, 2, 22).toString(),
    );
    expect(lastWeek.call(DateTime.civil(2005, 3, 1, 15, 15, 10), ":friday").toString()).toBe(
      DateTime.civil(2005, 2, 25).toString(),
    );
    expect(lastWeek.call(DateTime.civil(2006, 11, 6, 0, 0, 0)).toString()).toBe(
      DateTime.civil(2006, 10, 30).toString(),
    );
    expect(lastWeek.call(DateTime.civil(2006, 11, 23, 0, 0, 0), ":wednesday").toString()).toBe(
      DateTime.civil(2006, 11, 15).toString(),
    );
  });

  it("date time should have correct last week for leap year", () => {
    expect(lastWeek.call(DateTime.civil(2016, 3, 7)).toString()).toBe(
      DateTime.civil(2016, 2, 29).toString(),
    );
  });

  it("last quarter on 31st", () => {
    expect(lastQuarter.call(DateTime.civil(2004, 5, 31)).toString()).toBe(
      DateTime.civil(2004, 2, 29).toString(),
    );
  });

  it("xmlschema", () => {
    expect(new RubyDateTime(DateTime.civil(1880, 2, 28, 15, 15, 10)).xmlschema()).toMatch(
      /^1880-02-28T15:15:10\+00:?00$/,
    );
    expect(new RubyDateTime(DateTime.civil(1980, 2, 28, 15, 15, 10)).xmlschema()).toMatch(
      /^1980-02-28T15:15:10\+00:?00$/,
    );
    expect(new RubyDateTime(DateTime.civil(2080, 2, 28, 15, 15, 10)).xmlschema()).toMatch(
      /^2080-02-28T15:15:10\+00:?00$/,
    );
    expect(new RubyDateTime(DateTime.civil(1880, 2, 28, 15, 15, 10, -0.25)).xmlschema()).toMatch(
      /^1880-02-28T15:15:10-06:?00$/,
    );
    expect(new RubyDateTime(DateTime.civil(1980, 2, 28, 15, 15, 10, -0.25)).xmlschema()).toMatch(
      /^1980-02-28T15:15:10-06:?00$/,
    );
    expect(new RubyDateTime(DateTime.civil(2080, 2, 28, 15, 15, 10, -0.25)).xmlschema()).toMatch(
      /^2080-02-28T15:15:10-06:?00$/,
    );
  });

  it("today with offset", () => {
    withDateCurrent(new Temporal.PlainDate(2000, 1, 1), () => {
      expect(
        isToday.call(DateTime.civil(1999, 12, 31, 23, 59, 59, new Rational(-18000, 86400))),
      ).toBe(false);
      expect(isToday.call(DateTime.civil(2000, 1, 1, 0, 0, 0, new Rational(-18000, 86400)))).toBe(
        true,
      );
      expect(
        isToday.call(DateTime.civil(2000, 1, 1, 23, 59, 59, new Rational(-18000, 86400))),
      ).toBe(true);
      expect(isToday.call(DateTime.civil(2000, 1, 2, 0, 0, 0, new Rational(-18000, 86400)))).toBe(
        false,
      );
    });
  });

  it("today without offset", () => {
    withDateCurrent(new Temporal.PlainDate(2000, 1, 1), () => {
      expect(isToday.call(DateTime.civil(1999, 12, 31, 23, 59, 59))).toBe(false);
      expect(isToday.call(DateTime.civil(2000, 1, 1, 0))).toBe(true);
      expect(isToday.call(DateTime.civil(2000, 1, 1, 23, 59, 59))).toBe(true);
      expect(isToday.call(DateTime.civil(2000, 1, 2, 0))).toBe(false);
    });
  });

  it("yesterday with offset", () => {
    withDateCurrent(new Temporal.PlainDate(2000, 1, 1), () => {
      expect(
        isYesterday.call(DateTime.civil(1999, 12, 31, 23, 59, 59, new Rational(-18000, 86400))),
      ).toBe(true);
      expect(
        isYesterday.call(DateTime.civil(2000, 1, 1, 0, 0, 0, new Rational(-18000, 86400))),
      ).toBe(false);
      expect(
        isYesterday.call(DateTime.civil(2000, 1, 1, 23, 59, 59, new Rational(-18000, 86400))),
      ).toBe(false);
      expect(
        isYesterday.call(DateTime.civil(1999, 12, 31, 0, 0, 0, new Rational(-18000, 86400))),
      ).toBe(true);
    });
  });

  it("yesterday without offset", () => {
    withDateCurrent(new Temporal.PlainDate(2000, 1, 1), () => {
      expect(isYesterday.call(DateTime.civil(1999, 12, 31, 23, 59, 59))).toBe(true);
      expect(isYesterday.call(DateTime.civil(2000, 1, 1, 0))).toBe(false);
      expect(isYesterday.call(DateTime.civil(2000, 1, 1, 23, 59, 59))).toBe(false);
      expect(isYesterday.call(DateTime.civil(2000, 1, 2, 0))).toBe(false);
    });
  });

  it("prev day without offset", () => {
    withDateCurrent(new Temporal.PlainDate(2000, 1, 1), () => {
      expect(isPrevDay.call(DateTime.civil(1999, 12, 31, 23, 59, 59))).toBe(true);
      expect(isPrevDay.call(DateTime.civil(2000, 1, 1, 0))).toBe(false);
      expect(isPrevDay.call(DateTime.civil(2000, 1, 1, 23, 59, 59))).toBe(false);
      expect(isPrevDay.call(DateTime.civil(2000, 1, 2, 0))).toBe(false);
    });
  });

  it("tomorrow with offset", () => {
    withDateCurrent(new Temporal.PlainDate(2000, 1, 1), () => {
      expect(
        isTomorrow.call(DateTime.civil(1999, 12, 31, 23, 59, 59, new Rational(-18000, 86400))),
      ).toBe(false);
      expect(
        isTomorrow.call(DateTime.civil(2000, 1, 2, 0, 0, 0, new Rational(-18000, 86400))),
      ).toBe(true);
      expect(
        isTomorrow.call(DateTime.civil(2000, 1, 1, 23, 59, 59, new Rational(-18000, 86400))),
      ).toBe(false);
      expect(
        isTomorrow.call(DateTime.civil(2000, 1, 2, 23, 59, 59, new Rational(-18000, 86400))),
      ).toBe(true);
    });
  });

  it("tomorrow without offset", () => {
    withDateCurrent(new Temporal.PlainDate(2000, 1, 1), () => {
      expect(isTomorrow.call(DateTime.civil(1999, 12, 31, 23, 59, 59))).toBe(false);
      expect(isTomorrow.call(DateTime.civil(2000, 1, 2, 0))).toBe(true);
      expect(isTomorrow.call(DateTime.civil(2000, 1, 1, 23, 59, 59))).toBe(false);
      expect(isTomorrow.call(DateTime.civil(2000, 1, 3, 0))).toBe(false);
    });
  });

  it("next day without offset", () => {
    withDateCurrent(new Temporal.PlainDate(2000, 1, 1), () => {
      expect(isNextDay.call(DateTime.civil(1999, 12, 31, 23, 59, 59))).toBe(false);
      expect(isNextDay.call(DateTime.civil(2000, 1, 2, 0))).toBe(true);
      expect(isNextDay.call(DateTime.civil(2000, 1, 1, 23, 59, 59))).toBe(false);
      expect(isNextDay.call(DateTime.civil(2000, 1, 3, 0))).toBe(false);
    });
  });

  it("past with offset", () => {
    withFrozen(DateTime.civil(2005, 2, 10, 15, 30, 45, new Rational(-18000, 86400)), () => {
      expect(
        isPast.call(DateTime.civil(2005, 2, 10, 15, 30, 44, new Rational(-18000, 86400))),
      ).toBe(true);
      expect(
        isPast.call(DateTime.civil(2005, 2, 10, 15, 30, 45, new Rational(-18000, 86400))),
      ).toBe(false);
      expect(
        isPast.call(DateTime.civil(2005, 2, 10, 15, 30, 46, new Rational(-18000, 86400))),
      ).toBe(false);
    });
  });

  it("past without offset", () => {
    withFrozen(DateTime.civil(2005, 2, 10, 15, 30, 45, new Rational(-18000, 86400)), () => {
      expect(isPast.call(DateTime.civil(2005, 2, 10, 20, 30, 44))).toBe(true);
      expect(isPast.call(DateTime.civil(2005, 2, 10, 20, 30, 45))).toBe(false);
      expect(isPast.call(DateTime.civil(2005, 2, 10, 20, 30, 46))).toBe(false);
    });
  });

  it("future with offset", () => {
    withFrozen(DateTime.civil(2005, 2, 10, 15, 30, 45, new Rational(-18000, 86400)), () => {
      expect(
        isFuture.call(DateTime.civil(2005, 2, 10, 15, 30, 44, new Rational(-18000, 86400))),
      ).toBe(false);
      expect(
        isFuture.call(DateTime.civil(2005, 2, 10, 15, 30, 45, new Rational(-18000, 86400))),
      ).toBe(false);
      expect(
        isFuture.call(DateTime.civil(2005, 2, 10, 15, 30, 46, new Rational(-18000, 86400))),
      ).toBe(true);
    });
  });

  it("future without offset", () => {
    withFrozen(DateTime.civil(2005, 2, 10, 15, 30, 45, new Rational(-18000, 86400)), () => {
      expect(isFuture.call(DateTime.civil(2005, 2, 10, 20, 30, 44))).toBe(false);
      expect(isFuture.call(DateTime.civil(2005, 2, 10, 20, 30, 45))).toBe(false);
      expect(isFuture.call(DateTime.civil(2005, 2, 10, 20, 30, 46))).toBe(true);
    });
  });

  it("current returns date today when zone is not set", () => {
    withEnvTz("US/Eastern", () => {
      withFrozen(Time.local(1999, 12, 31, 23, 59, 59), () => {
        expect(
          compare(current(), DateTime.civil(1999, 12, 31, 23, 59, 59, new Rational(-18000, 86400))),
        ).toBe(0);
      });
    });
  });

  it("current returns time zone today when zone is set", () => {
    setZone(TimeZone.find("Eastern Time (US & Canada)"));
    withEnvTz("US/Eastern", () => {
      withFrozen(Time.local(1999, 12, 31, 23, 59, 59), () => {
        expect(
          compare(current(), DateTime.civil(1999, 12, 31, 23, 59, 59, new Rational(-18000, 86400))),
        ).toBe(0);
      });
    });
  });

  it("current without time zone", () => {
    expect(current()).toBeInstanceOf(
      new Date().getTimezoneOffset() === 0 ? Temporal.PlainDateTime : Temporal.ZonedDateTime,
    );
  });

  it("current with time zone", () => {
    withEnvTz("US/Eastern", () => {
      expect(current()).toBeInstanceOf(Temporal.ZonedDateTime);
    });
  });

  it("acts like date", () => {
    assertPredicate(DateTime.civil(-4712), (x) => actsLike.call(x, "date"));
  });

  it("acts like time", () => {
    assertPredicate(DateTime.civil(-4712), (x) => actsLike.call(x, "time"));
  });

  it("blank?", () => {
    assertNotPredicate(DateTime.civil(-4712), isBlank);
  });

  it("utc?", () => {
    expect(isUtc(dt(2005, 2, 21, 10, 11, 12))).toBe(true);
    expect(isUtc(DateTime.civil(2005, 2, 21, 10, 11, 12, 0))).toBe(true);
    expect(isUtc(DateTime.civil(2005, 2, 21, 10, 11, 12, 0.25))).toBe(false);
    expect(isUtc(DateTime.civil(2005, 2, 21, 10, 11, 12, -0.25))).toBe(false);
  });

  it("utc offset", () => {
    expect(utcOffset(dt(2005, 2, 21, 10, 11, 12))).toBe(0);
    expect(utcOffset(DateTime.civil(2005, 2, 21, 10, 11, 12, 0))).toBe(0);
    expect(utcOffset(DateTime.civil(2005, 2, 21, 10, 11, 12, 0.25))).toBe(21600);
    expect(utcOffset(DateTime.civil(2005, 2, 21, 10, 11, 12, -0.25))).toBe(-21600);
    expect(utcOffset(DateTime.civil(2005, 2, 21, 10, 11, 12, new Rational(-5, 24)))).toBe(-18000);
  });

  it("utc", () => {
    expect(utc(DateTime.civil(2005, 2, 21, 10, 11, 12, new Rational(-6, 24)))).toBeInstanceOf(Time);
    sameTime(
      utc(DateTime.civil(2005, 2, 21, 10, 11, 12, new Rational(-6, 24))),
      Time.utc(2005, 2, 21, 16, 11, 12),
    );
    sameTime(
      utc(DateTime.civil(2005, 2, 21, 10, 11, 12, new Rational(-5, 24))),
      Time.utc(2005, 2, 21, 15, 11, 12),
    );
    sameTime(utc(DateTime.civil(2005, 2, 21, 10, 11, 12, 0)), Time.utc(2005, 2, 21, 10, 11, 12));
    sameTime(
      utc(DateTime.civil(2005, 2, 21, 10, 11, 12, new Rational(1, 24))),
      Time.utc(2005, 2, 21, 9, 11, 12),
    );
    sameTime(
      getutc(DateTime.civil(2005, 2, 21, 10, 11, 12, new Rational(1, 24))),
      Time.utc(2005, 2, 21, 9, 11, 12),
    );
  });

  it("formatted offset with utc", () => {
    expect(formattedOffset(dt(2000))).toBe("+00:00");
    expect(formattedOffset(dt(2000), false)).toBe("+0000");
    expect(formattedOffset(dt(2000), true, "UTC")).toBe("UTC");
  });

  it("formatted offset with local", () => {
    const receiver = DateTime.civil(2005, 2, 21, 10, 11, 12, new Rational(-5, 24));
    expect(formattedOffset(receiver)).toBe("-05:00");
    expect(formattedOffset(receiver, false)).toBe("-0500");
  });

  it("compare with time", () => {
    expect(compare(dt(2000), Time.utc(1999, 12, 31, 23, 59, 59))).toBe(1);
    expect(compare(dt(2000), Time.utc(2000, 1, 1, 0, 0, 0))).toBe(0);
    expect(compare(dt(2000), Time.utc(2000, 1, 1, 0, 0, 1))).toBe(-1);
  });

  it("compare with datetime", () => {
    expect(compare(dt(2000), DateTime.civil(1999, 12, 31, 23, 59, 59))).toBe(1);
    expect(compare(dt(2000), DateTime.civil(2000, 1, 1, 0, 0, 0))).toBe(0);
    expect(compare(dt(2000), DateTime.civil(2000, 1, 1, 0, 0, 1))).toBe(-1);
  });

  it("compare with time with zone", () => {
    const utcZone = TimeZone.find("UTC")!;
    const twz = (t: Time): TimeWithZone => new TimeWithZone(t.toTime().toInstant(), utcZone);
    expect(compare(dt(2000), twz(Time.utc(1999, 12, 31, 23, 59, 59)))).toBe(1);
    expect(compare(dt(2000), twz(Time.utc(2000, 1, 1, 0, 0, 0)))).toBe(0);
    expect(compare(dt(2000), twz(Time.utc(2000, 1, 1, 0, 0, 1)))).toBe(-1);
  });

  it("compare with string", () => {
    expect(compare(dt(2000), Time.utc(1999, 12, 31, 23, 59, 59).toS())).toBe(1);
    expect(compare(dt(2000), Time.utc(2000, 1, 1, 0, 0, 0).toS())).toBe(0);
    expect(compare(dt(2000), Time.utc(2000, 1, 1, 0, 0, 1).toS())).toBe(-1);
    assertNil(compare(dt(2000), "Invalid as Time"));
  });

  it("compare with integer", () => {
    expect(compare(dt(1970, 1, 1, 12, 0, 0), 2440587)).toBe(1);
    expect(compare(dt(1970, 1, 1, 12, 0, 0), 2440588)).toBe(0);
    expect(compare(dt(1970, 1, 1, 12, 0, 0), 2440589)).toBe(-1);
  });

  it("compare with float", () => {
    expect(compare(dt(1970), 2440586.5)).toBe(1);
    expect(compare(dt(1970), 2440587.5)).toBe(0);
    expect(compare(dt(1970), 2440588.5)).toBe(-1);
  });

  it("compare with rational", () => {
    expect(compare(dt(1970), new Rational(4881173, 2))).toBe(1);
    expect(compare(dt(1970), new Rational(4881175, 2))).toBe(0);
    expect(compare(dt(1970), new Rational(4881177, 2))).toBe(-1);
  });

  it("to f", () => {
    expect(toF(dt(2000))).toBe(946684800.0);
    expect(toF(DateTime.civil(1999, 12, 31, 19, 0, 0, new Rational(-5, 24)))).toBe(946684800.0);
    expect(toF(DateTime.civil(1999, 12, 31, 19, 0, 0.5, new Rational(-5, 24)))).toBe(946684800.5);
  });

  it("to i", () => {
    expect(toI(dt(2000))).toBe(946684800);
    expect(toI(DateTime.civil(1999, 12, 31, 19, 0, 0, new Rational(-5, 24)))).toBe(946684800);
  });

  it("usec", () => {
    expect(usec(Temporal.PlainDateTime.from({ year: 2000, month: 1, day: 1 }))).toBe(0);
    expect(
      usec(Temporal.PlainDateTime.from({ year: 2000, month: 1, day: 1, millisecond: 500 })),
    ).toBe(500000);
  });

  it("nsec", () => {
    expect(nsec(Temporal.PlainDateTime.from({ year: 2000, month: 1, day: 1 }))).toBe(0);
    expect(
      nsec(Temporal.PlainDateTime.from({ year: 2000, month: 1, day: 1, millisecond: 500 })),
    ).toBe(500000000);
  });

  it("subsec", () => {
    expect(subsec(dt(2000))).toBe(0);
    expect(subsec(dt(2000, 1, 1, 0, 0, new Rational(1, 2)))).toBe(0.5);
  });

  it("seconds since midnight", () => {
    expect(secondsSinceMidnight(dt(2005, 1, 1, 0, 0, 1))).toBe(1);
    expect(secondsSinceMidnight(dt(2005, 1, 1, 0, 1, 0))).toBe(60);
    expect(secondsSinceMidnight(dt(2005, 1, 1, 1, 1, 0))).toBe(3660);
    expect(secondsSinceMidnight(dt(2005, 1, 1, 23, 59, 59))).toBe(86399);
  });

  it("seconds until end of day", () => {
    expect(secondsUntilEndOfDay(dt(2005, 1, 1, 23, 59, 59))).toBe(0);
    expect(secondsUntilEndOfDay(dt(2005, 1, 1, 23, 59, 58))).toBe(1);
    expect(secondsUntilEndOfDay(dt(2005, 1, 1, 23, 58, 59))).toBe(60);
    expect(secondsUntilEndOfDay(dt(2005, 1, 1, 22, 58, 59))).toBe(3660);
    expect(secondsUntilEndOfDay(dt(2005, 1, 1, 0, 0, 0))).toBe(86399);
  });

  it("beginning of hour", () => {
    expect(beginningOfHour(dt(2005, 2, 4, 19, 30, 10)).toString()).toBe(
      dt(2005, 2, 4, 19, 0, 0).toString(),
    );
  });

  it("end of hour", () => {
    expect(endOfHour(dt(2005, 2, 4, 19, 30, 10)).toString()).toBe(
      dt(2005, 2, 4, 19, 59, END_OF_PERIOD_SEC).toString(),
    );
  });

  it("prev day with offset", () => {
    withDateCurrent(new Temporal.PlainDate(2000, 1, 1), () => {
      expect(
        isPrevDay.call(DateTime.civil(1999, 12, 31, 23, 59, 59, new Rational(-18000, 86400))),
      ).toBe(true);
      expect(isPrevDay.call(DateTime.civil(2000, 1, 1, 0, 0, 0, new Rational(-18000, 86400)))).toBe(
        false,
      );
      expect(
        isPrevDay.call(DateTime.civil(2000, 1, 1, 23, 59, 59, new Rational(-18000, 86400))),
      ).toBe(false);
      expect(
        isPrevDay.call(DateTime.civil(1999, 12, 31, 0, 0, 0, new Rational(-18000, 86400))),
      ).toBe(true);
    });
  });

  it("next day with offset", () => {
    withDateCurrent(new Temporal.PlainDate(2000, 1, 1), () => {
      expect(
        isNextDay.call(DateTime.civil(1999, 12, 31, 23, 59, 59, new Rational(-18000, 86400))),
      ).toBe(false);
      expect(isNextDay.call(DateTime.civil(2000, 1, 2, 0, 0, 0, new Rational(-18000, 86400)))).toBe(
        true,
      );
      expect(
        isNextDay.call(DateTime.civil(2000, 1, 1, 23, 59, 59, new Rational(-18000, 86400))),
      ).toBe(false);
      expect(
        isNextDay.call(DateTime.civil(2000, 1, 2, 23, 59, 59, new Rational(-18000, 86400))),
      ).toBe(true);
    });
  });

  it("beginning of day", () => {
    expect(beginningOfDay(dt(2005, 2, 4, 10, 10, 10)).toString()).toBe(
      dt(2005, 2, 4, 0, 0, 0).toString(),
    );
  });

  it("end of day", () => {
    expect(endOfDay(dt(2005, 2, 4, 10, 10, 10)).toString()).toBe(
      dt(2005, 2, 4, 23, 59, END_OF_PERIOD_SEC).toString(),
    );
  });

  it("ago", () => {
    const receiver = dt(2005, 2, 22, 10, 10, 10);
    expect(ago(receiver, 1).toString()).toBe(dt(2005, 2, 22, 10, 10, 9).toString());
    expect(ago(receiver, 3600).toString()).toBe(dt(2005, 2, 22, 9, 10, 10).toString());
    expect(ago(receiver, 86400 * 2).toString()).toBe(dt(2005, 2, 20, 10, 10, 10).toString());
    expect(ago(receiver, 86400 * 2 + 3600 + 25).toString()).toBe(
      dt(2005, 2, 20, 9, 9, 45).toString(),
    );
  });

  it("since", () => {
    const receiver = dt(2005, 2, 22, 10, 10, 10);
    expect(since(receiver, 1).toString()).toBe(dt(2005, 2, 22, 10, 10, 11).toString());
    expect(since(receiver, 3600).toString()).toBe(dt(2005, 2, 22, 11, 10, 10).toString());
    expect(since(receiver, 86400 * 2).toString()).toBe(dt(2005, 2, 24, 10, 10, 10).toString());
    expect(since(receiver, 86400 * 2 + 3600 + 25).toString()).toBe(
      dt(2005, 2, 24, 11, 10, 35).toString(),
    );
    expect(since(receiver, 1.333).toString()).not.toBe(dt(2005, 2, 22, 10, 10, 11).toString());
    expect(since(receiver, 1.667).toString()).not.toBe(dt(2005, 2, 22, 10, 10, 12).toString());
  });

  it("advance", () => {
    const receiver = () => dt(2005, 2, 28, 15, 15, 10);
    expect(advance(receiver(), { years: 1 }).toString()).toBe(
      dt(2006, 2, 28, 15, 15, 10).toString(),
    );
    expect(advance(receiver(), { months: 4 }).toString()).toBe(
      dt(2005, 6, 28, 15, 15, 10).toString(),
    );
    expect(advance(receiver(), { weeks: 3 }).toString()).toBe(
      dt(2005, 3, 21, 15, 15, 10).toString(),
    );
    expect(advance(receiver(), { days: 5 }).toString()).toBe(dt(2005, 3, 5, 15, 15, 10).toString());
    expect(advance(receiver(), { years: 7, months: 7 }).toString()).toBe(
      dt(2012, 9, 28, 15, 15, 10).toString(),
    );
    expect(advance(receiver(), { years: 7, months: 19, days: 5 }).toString()).toBe(
      dt(2013, 10, 3, 15, 15, 10).toString(),
    );
    expect(advance(receiver(), { years: 7, months: 19, weeks: 2, days: 5 }).toString()).toBe(
      dt(2013, 10, 17, 15, 15, 10).toString(),
    );
    expect(advance(receiver(), { years: -3, months: -2, days: -1 }).toString()).toBe(
      dt(2001, 12, 27, 15, 15, 10).toString(),
    );
    expect(advance(dt(2004, 2, 29, 15, 15, 10), { years: 1 }).toString()).toBe(
      dt(2005, 2, 28, 15, 15, 10).toString(),
    );
    expect(advance(receiver(), { hours: 5 }).toString()).toBe(
      dt(2005, 2, 28, 20, 15, 10).toString(),
    );
    expect(advance(receiver(), { minutes: 7 }).toString()).toBe(
      dt(2005, 2, 28, 15, 22, 10).toString(),
    );
    expect(advance(receiver(), { seconds: 9 }).toString()).toBe(
      dt(2005, 2, 28, 15, 15, 19).toString(),
    );
    expect(advance(receiver(), { hours: 5, minutes: 7, seconds: 9 }).toString()).toBe(
      dt(2005, 2, 28, 20, 22, 19).toString(),
    );
    expect(advance(receiver(), { hours: -5, minutes: -7, seconds: -9 }).toString()).toBe(
      dt(2005, 2, 28, 10, 8, 1).toString(),
    );
    expect(
      advance(receiver(), {
        years: 7,
        months: 19,
        weeks: 2,
        days: 5,
        hours: 5,
        minutes: 7,
        seconds: 9,
      }).toString(),
    ).toBe(dt(2013, 10, 17, 20, 22, 19).toString());
  });
});
