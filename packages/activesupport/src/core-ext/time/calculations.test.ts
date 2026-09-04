import { afterEach, describe, expect, it } from "vitest";
import { Time as RubyTime, resetLocalTimeZoneId } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import { ArgumentError } from "../../hash-utils.js";
import "./calculations.js";

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

function expectSameTime(actual: RubyTime, expected: RubyTime): void {
  expect(actual.toTime().toInstant().epochNanoseconds).toBe(
    expected.toTime().toInstant().epochNanoseconds,
  );
}

function expectWithinDelta(actual: RubyTime, expected: RubyTime, delta: number): void {
  expect(Math.abs(actual.toI() - expected.toI())).toBeLessThanOrEqual(delta);
}

const NSEC_999999999_OVER_1000 = new Rational(999999999, 1000);

describe("TimeExtCalculationsTest", () => {
  it("change", () => {
    expectSameTime(
      RubyTime.local(2005, 2, 22, 15, 15, 10).change({ year: 2006 }),
      RubyTime.local(2006, 2, 22, 15, 15, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 22, 15, 15, 10).change({ month: 6 }),
      RubyTime.local(2005, 6, 22, 15, 15, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 22, 15, 15, 10).change({ year: 2012, month: 9 }),
      RubyTime.local(2012, 9, 22, 15, 15, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 22, 15, 15, 10).change({ hour: 16 }),
      RubyTime.local(2005, 2, 22, 16),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 22, 15, 15, 10).change({ hour: 16, min: 45 }),
      RubyTime.local(2005, 2, 22, 16, 45),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 22, 15, 15, 10).change({ min: 45 }),
      RubyTime.local(2005, 2, 22, 15, 45),
    );

    expectSameTime(
      RubyTime.local(2005, 1, 2, 11, 22, 33, 44).change({ hour: 5 }),
      RubyTime.local(2005, 1, 2, 5, 0, 0, 0),
    );
    expectSameTime(
      RubyTime.local(2005, 1, 2, 11, 22, 33, 44).change({ min: 6 }),
      RubyTime.local(2005, 1, 2, 11, 6, 0, 0),
    );
    expectSameTime(
      RubyTime.local(2005, 1, 2, 11, 22, 33, 44).change({ sec: 7 }),
      RubyTime.local(2005, 1, 2, 11, 22, 7, 0),
    );
    expectSameTime(
      RubyTime.local(2005, 1, 2, 11, 22, 33, 44).change({ usec: 8 }),
      RubyTime.local(2005, 1, 2, 11, 22, 33, 8),
    );
    expectSameTime(
      RubyTime.local(2005, 1, 2, 11, 22, 33, 2).change({ nsec: 8000 }),
      RubyTime.local(2005, 1, 2, 11, 22, 33, 8),
    );
    expect(() => RubyTime.local(2005, 1, 2, 11, 22, 33, 8).change({ usec: 1, nsec: 1 })).toThrow(
      ArgumentError,
    );
    expect(() =>
      RubyTime.new(2015, 5, 9, 10, 0, 0, "+03:00").change({ nsec: 999999999 }),
    ).not.toThrow();
  });

  it("advance", () => {
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ years: 1 }),
      RubyTime.local(2006, 2, 28, 15, 15, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ months: 4 }),
      RubyTime.local(2005, 6, 28, 15, 15, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ weeks: 3 }),
      RubyTime.local(2005, 3, 21, 15, 15, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ weeks: 3.5 }),
      RubyTime.local(2005, 3, 25, 3, 15, 10),
    );
    expectWithinDelta(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ weeks: 3.7 }),
      RubyTime.local(2005, 3, 26, 12, 51, 10),
      1,
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ days: 5 }),
      RubyTime.local(2005, 3, 5, 15, 15, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ days: 5.5 }),
      RubyTime.local(2005, 3, 6, 3, 15, 10),
    );
    expectWithinDelta(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ days: 5.7 }),
      RubyTime.local(2005, 3, 6, 8, 3, 10),
      1,
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ years: 7, months: 7 }),
      RubyTime.local(2012, 9, 28, 15, 15, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ years: 7, months: 19, days: 5 }),
      RubyTime.local(2013, 10, 3, 15, 15, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ years: 7, months: 19, weeks: 2, days: 5 }),
      RubyTime.local(2013, 10, 17, 15, 15, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ years: -3, months: -2, days: -1 }),
      RubyTime.local(2001, 12, 27, 15, 15, 10),
    );
    expectSameTime(
      RubyTime.local(2004, 2, 29, 15, 15, 10).advance({ years: 1 }),
      RubyTime.local(2005, 2, 28, 15, 15, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ hours: 5 }),
      RubyTime.local(2005, 2, 28, 20, 15, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ minutes: 7 }),
      RubyTime.local(2005, 2, 28, 15, 22, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ seconds: 9 }),
      RubyTime.local(2005, 2, 28, 15, 15, 19),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ hours: 5, minutes: 7, seconds: 9 }),
      RubyTime.local(2005, 2, 28, 20, 22, 19),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ hours: -5, minutes: -7, seconds: -9 }),
      RubyTime.local(2005, 2, 28, 10, 8, 1),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 28, 15, 15, 10).advance({
        years: 7,
        months: 19,
        weeks: 2,
        days: 5,
        hours: 5,
        minutes: 7,
        seconds: 9,
      }),
      RubyTime.local(2013, 10, 17, 20, 22, 19),
    );
  });

  it("ago", () => {
    expectSameTime(
      RubyTime.local(2005, 2, 22, 10, 10, 10).ago(1),
      RubyTime.local(2005, 2, 22, 10, 10, 9),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 22, 10, 10, 10).ago(3600),
      RubyTime.local(2005, 2, 22, 9, 10, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 22, 10, 10, 10).ago(86400 * 2),
      RubyTime.local(2005, 2, 20, 10, 10, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 22, 10, 10, 10).ago(86400 * 2 + 3600 + 25),
      RubyTime.local(2005, 2, 20, 9, 9, 45),
    );
  });

  it("since", () => {
    expectSameTime(
      RubyTime.local(2005, 2, 22, 10, 10, 10).since(1),
      RubyTime.local(2005, 2, 22, 10, 10, 11),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 22, 10, 10, 10).since(3600),
      RubyTime.local(2005, 2, 22, 11, 10, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 22, 10, 10, 10).since(86400 * 2),
      RubyTime.local(2005, 2, 24, 10, 10, 10),
    );
    expectSameTime(
      RubyTime.local(2005, 2, 22, 10, 10, 10).since(86400 * 2 + 3600 + 25),
      RubyTime.local(2005, 2, 24, 11, 10, 35),
    );
    expectSameTime(
      RubyTime.utc(2038, 1, 18, 11, 59, 59).since(86400 * 2),
      RubyTime.utc(2038, 1, 20, 11, 59, 59),
    );
  });

  it("days in month with year", () => {
    expect(RubyTime.daysInMonth(1, 2005)).toBe(31);

    expect(RubyTime.daysInMonth(2, 2005)).toBe(28);
    expect(RubyTime.daysInMonth(2, 2004)).toBe(29);
    expect(RubyTime.daysInMonth(2, 2000)).toBe(29);
    expect(RubyTime.daysInMonth(2, 1900)).toBe(28);

    expect(RubyTime.daysInMonth(3, 2005)).toBe(31);
    expect(RubyTime.daysInMonth(4, 2005)).toBe(30);
    expect(RubyTime.daysInMonth(5, 2005)).toBe(31);
    expect(RubyTime.daysInMonth(6, 2005)).toBe(30);
    expect(RubyTime.daysInMonth(7, 2005)).toBe(31);
    expect(RubyTime.daysInMonth(8, 2005)).toBe(31);
    expect(RubyTime.daysInMonth(9, 2005)).toBe(30);
    expect(RubyTime.daysInMonth(10, 2005)).toBe(31);
    expect(RubyTime.daysInMonth(11, 2005)).toBe(30);
    expect(RubyTime.daysInMonth(12, 2005)).toBe(31);
  });

  it("days in year with year", () => {
    expect(RubyTime.daysInYear(2005)).toBe(365);
    expect(RubyTime.daysInYear(2004)).toBe(366);
    expect(RubyTime.daysInYear(2000)).toBe(366);
    expect(RubyTime.daysInYear(1900)).toBe(365);
  });

  it("rfc3339 parse", () => {
    const time = RubyTime.rfc3339("1999-12-31T19:00:00.125-05:00");

    expect(time.year).toBe(1999);
    expect(time.month).toBe(12);
    expect(time.day).toBe(31);
    expect(time.hour).toBe(19);
    expect(time.min).toBe(0);
    expect(time.sec).toBe(0);
    expect(time.usec).toBe(125000);
    expect(time.utcOffset).toBe(-18000);

    expect(() => RubyTime.rfc3339("1999-12-31")).toThrow(
      expect.objectContaining({ message: "invalid date" }),
    );
    expect(() => RubyTime.rfc3339("1999-12-31T19:00:00")).toThrow(
      expect.objectContaining({ message: "invalid date" }),
    );
    expect(() => RubyTime.rfc3339("foobar")).toThrow(
      expect.objectContaining({ message: "invalid date" }),
    );
  });
});
