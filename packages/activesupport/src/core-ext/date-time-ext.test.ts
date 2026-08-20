import { describe, it, expect, afterEach } from "vitest";
import { DateTime, Rational, Temporal } from "@blazetrails/date";
import {
  advance,
  ago,
  beginningOfDay,
  beginningOfHour,
  beginningOfMinute,
  change,
  current,
  endOfDay,
  endOfHour,
  endOfMinute,
  isUtc,
  middleOfDay,
  secondsSinceMidnight,
  secondsUntilEndOfDay,
  since,
  subsec,
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
import { setZone } from "../time-zone-config.js";
import { ArgumentError } from "../hash-utils.js";
import {
  advance as timeAdvance,
  beginningOfQuarter,
  endOfMonth,
  isFuture,
  isPast,
  isToday,
  isTomorrow,
  isYesterday,
  lastWeek,
  nextDay,
  prevDay,
  toDate,
} from "../time-ext.js";
import { DATE_FORMATS, xmlschema } from "./time/conversions.js";
import { toTime } from "./time/compatibility.js";

afterEach(() => {
  setFrozenTime(null);
  setZone(null);
});

function asDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

function d(year: number, month: number, day: number, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(year, month - 1, day, hour, min, sec, ms);
}

/** `DateTime.civil`, the receiver every `date_time/calculations.rb` member takes. */
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

/** The end-of-period second `Rational(999999999, 1000)` usec lands on. */
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

    // Rails wraps these three in `with_env_tz "US/Central"`; a `DateTime`
    // carries its own offset, so the ambient zone never reaches `:iso8601`.
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
    // Rails asserts `datetime.readable_inspect == datetime.inspect`, the alias
    // its `alias_method :inspect, :readable_inspect` installs; trails reopens
    // no `::DateTime`, so the alias target is compared directly.
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
    const dt = new Date("2005-02-22T10:10:10Z");
    expect(dt instanceof Date).toBe(true);
    expect(dt.getTime()).toBeGreaterThan(0);
  });

  it("getlocal", () => {
    const dt = new Date("2005-02-22T10:10:10Z");
    expect(dt.getFullYear()).toBeGreaterThan(2004);
  });

  it("to date", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const result = toDate(dt);
    expect(result.day).toBe(22);
    expect(result.month).toBe(2);
  });

  it("to datetime", () => {
    const dt = Temporal.PlainDateTime.from("2005-02-22T10:10:10");
    const result = toTime(dt);
    expect(result.epochNanoseconds).toBe(dt.toZonedDateTime("UTC").epochNanoseconds);
  });

  it("to time", () => {
    const dt = Temporal.PlainDateTime.from("2005-02-22T10:10:10");
    const result = toTime(dt);
    expect(result.epochNanoseconds).toBe(dt.toZonedDateTime("UTC").epochNanoseconds);
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
    const dt = d(2005, 2, 15, 10, 10, 10);
    const result = asDate(endOfMonth(dt));
    expect(result.getDate()).toBe(28);
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

    // datetime with non-zero offset
    expect(change(dt(2005, 2, 22, 15, 15, 10), { offset: new Rational(-5, 24) }).toString()).toBe(
      DateTime.civil(2005, 2, 22, 15, 15, 10, new Rational(-5, 24)).toString(),
    );

    // datetime with fractions of a second
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
    // If the time deltas were processed first, the following datetimes would be
    // advanced to 2010/04/01 instead.
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
    const dt = d(2005, 2, 22, 10, 10, 10);
    const result = asDate(lastWeek(dt, "monday"));
    expect(result.getDay()).toBe(1);
    expect(result < dt).toBe(true);
  });

  it("date time should have correct last week for leap year", () => {
    const dt = d(2016, 3, 7);
    const result = asDate(lastWeek(dt, "monday"));
    expect(result.getDay()).toBe(1);
    expect(result < dt).toBe(true);
  });

  it("last quarter on 31st", () => {
    const dt = d(2005, 10, 31, 10, 10, 10);
    const quarterStart = beginningOfQuarter(dt);
    const lastQuarterStart = asDate(timeAdvance(asDate(quarterStart), { months: -3 }));
    expect(lastQuarterStart.getMonth()).toBe(6); // July
  });

  it("xmlschema", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const result = xmlschema(dt);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("today with offset", () => {
    const now = new Date();
    expect(isToday(now)).toBe(true);
    expect(isToday(asDate(prevDay(now)))).toBe(false);
  });

  it("today without offset", () => {
    const now = new Date();
    expect(isToday(now)).toBe(true);
    expect(isToday(asDate(nextDay(now)))).toBe(false);
  });

  it("yesterday with offset", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it("yesterday without offset", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it("prev day without offset", () => {
    const t = new Date();
    const result = asDate(prevDay(t));
    expect(result < t).toBe(true);
  });

  it("tomorrow with offset", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it("tomorrow without offset", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it("next day without offset", () => {
    const t = new Date();
    const result = asDate(nextDay(t));
    expect(result > t).toBe(true);
  });

  it("past with offset", () => {
    expect(isPast(new Date(Date.now() - 10000))).toBe(true);
  });

  it("past without offset", () => {
    expect(isPast(new Date(Date.now() - 10000))).toBe(true);
  });

  it("future with offset", () => {
    expect(isFuture(new Date(Date.now() + 10000))).toBe(true);
  });

  it("future without offset", () => {
    expect(isFuture(new Date(Date.now() + 10000))).toBe(true);
  });

  it("current returns date today when zone is not set", () => {
    // Rails stubs `Time.now` and pins TZ to US/Eastern to name the offset
    // outright; trails freezes the same local wall clock and reads the offset
    // back off the host zone, so the assertion holds wherever it runs.
    const now = d(1999, 12, 31, 23, 59, 59);
    setFrozenTime(now);
    const dt = current();
    expect(dt.year).toBe(1999);
    expect(dt.month).toBe(12);
    expect(dt.day).toBe(31);
    expect(dt.hour).toBe(23);
    expect(dt.minute).toBe(59);
    expect(dt.second).toBe(59);
  });

  it("current returns time zone today when zone is set", () => {
    setZone("Eastern Time (US & Canada)");
    const now = d(1999, 12, 31, 23, 59, 59);
    setFrozenTime(now);
    const dt = current() as Temporal.ZonedDateTime;
    expect(dt.timeZoneId).toBe("America/New_York");
    expect(dt.toInstant().epochMilliseconds).toBe(now.getTime());
  });

  it("current without time zone", () => {
    const dt = current();
    expect(dt instanceof Temporal.PlainDateTime || dt instanceof Temporal.ZonedDateTime).toBe(true);
  });

  it("current with time zone", () => {
    setZone("Eastern Time (US & Canada)");
    const dt = current();
    expect(dt instanceof Temporal.PlainDateTime || dt instanceof Temporal.ZonedDateTime).toBe(true);
  });

  it("acts like date", () => {
    const dt = new Date();
    expect(dt instanceof Date).toBe(true);
  });

  it("acts like time", () => {
    const dt = new Date();
    expect(typeof dt.getHours()).toBe("number");
  });

  it("blank?", () => {
    expect(new Date() instanceof Date).toBe(true);
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
    const dt = new Date("2005-02-22T10:10:10Z");
    expect(dt.getUTCHours()).toBe(10);
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
    const dt1 = d(2005, 2, 22, 10, 10, 10);
    const dt2 = d(2005, 2, 22, 10, 10, 11);
    expect(dt1 < dt2).toBe(true);
  });

  it("compare with datetime", () => {
    const dt1 = d(2005, 2, 22, 10, 10, 10);
    const dt2 = d(2005, 2, 22, 10, 10, 10);
    expect(dt1.getTime()).toBe(dt2.getTime());
  });

  it.skip("compare with time with zone");

  it("compare with string", () => {
    const dt = d(2005, 2, 22);
    const str = dt.toISOString();
    expect(new Date(str).getFullYear()).toBe(2005);
  });

  it("compare with integer", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const timestamp = dt.getTime();
    expect(typeof timestamp).toBe("number");
    expect(timestamp > 0).toBe(true);
  });

  it("compare with float", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const asFloat = dt.getTime() / 1000;
    expect(typeof asFloat).toBe("number");
  });

  it.skip("compare with rational");

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
    const t = d(2005, 6, 15, 12, 0, 0);
    const result = asDate(prevDay(t));
    expect(result.getDate()).toBe(14);
    expect(result.getMonth()).toBe(5);
  });

  it("next day with offset", () => {
    const t = d(2005, 6, 15, 12, 0, 0);
    const result = asDate(nextDay(t));
    expect(result.getDate()).toBe(16);
    expect(result.getMonth()).toBe(5);
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
    // leap day plus one year
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
