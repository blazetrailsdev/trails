import { afterEach, describe, expect, it } from "vitest";
import { Rational, Time as RubyTime, resetLocalTimeZoneId } from "@blazetrails/date";
import { ArgumentError } from "../../hash-utils.js";
import "./calculations.js";

/**
 * `TimeZoneTestHelpers#with_env_tz` (`test/time_zone_test_helpers.rb:20-25`).
 * `Time`'s local-zone memo is MRI's `tzset` cache, so `TZ` moving under it has
 * to drop it, exactly as `tzset` does.
 */
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

/** `assert_equal` over two `Time`s is `Time#==`, which trails spells as the instant. */
function expectSameTime(actual: RubyTime, expected: RubyTime): void {
  expect(actual.toTime().toInstant().epochNanoseconds).toBe(
    expected.toTime().toInstant().epochNanoseconds,
  );
}

/** `assert_in_delta` over two `Time`s, in seconds. */
function expectWithinDelta(actual: RubyTime, expected: RubyTime, delta: number): void {
  expect(Math.abs(actual.toI() - expected.toI())).toBeLessThanOrEqual(delta);
}

const NSEC_999999999_OVER_1000 = new Rational(999999999, 1000);

describe("TimeExtCalculationsTest", () => {
  it("seconds since midnight", () => {
    expect(RubyTime.local(2005, 1, 1, 0, 0, 1).secondsSinceMidnight()).toBe(1);
    expect(RubyTime.local(2005, 1, 1, 0, 1, 0).secondsSinceMidnight()).toBe(60);
    expect(RubyTime.local(2005, 1, 1, 1, 1, 0).secondsSinceMidnight()).toBe(3660);
    expect(RubyTime.local(2005, 1, 1, 23, 59, 59).secondsSinceMidnight()).toBe(86399);
  });

  it("seconds until end of day", () => {
    expect(RubyTime.local(2005, 1, 1, 23, 59, 59).secondsUntilEndOfDay()).toBe(0);
    expect(RubyTime.local(2005, 1, 1, 23, 59, 58).secondsUntilEndOfDay()).toBe(1);
    expect(RubyTime.local(2005, 1, 1, 23, 58, 59).secondsUntilEndOfDay()).toBe(60);
    expect(RubyTime.local(2005, 1, 1, 22, 58, 59).secondsUntilEndOfDay()).toBe(3660);
    expect(RubyTime.local(2005, 1, 1, 0, 0, 0).secondsUntilEndOfDay()).toBe(86399);
  });

  it("beginning of day", () => {
    expectSameTime(
      RubyTime.local(2005, 2, 4, 10, 10, 10).beginningOfDay(),
      RubyTime.local(2005, 2, 4, 0, 0, 0),
    );
    withEnvTz("US/Eastern", () => {
      expectSameTime(
        RubyTime.local(2006, 4, 2, 10, 10, 10).beginningOfDay(),
        RubyTime.local(2006, 4, 2, 0, 0, 0),
      );
      expectSameTime(
        RubyTime.local(2006, 10, 29, 10, 10, 10).beginningOfDay(),
        RubyTime.local(2006, 10, 29, 0, 0, 0),
      );
    });
    withEnvTz("NZ", () => {
      expectSameTime(
        RubyTime.local(2006, 3, 19, 10, 10, 10).beginningOfDay(),
        RubyTime.local(2006, 3, 19, 0, 0, 0),
      );
      expectSameTime(
        RubyTime.local(2006, 10, 1, 10, 10, 10).beginningOfDay(),
        RubyTime.local(2006, 10, 1, 0, 0, 0),
      );
    });
  });

  it("middle of day", () => {
    expectSameTime(
      RubyTime.local(2005, 2, 4, 10, 10, 10).middleOfDay(),
      RubyTime.local(2005, 2, 4, 12, 0, 0),
    );
    withEnvTz("US/Eastern", () => {
      expectSameTime(
        RubyTime.local(2006, 4, 2, 10, 10, 10).middleOfDay(),
        RubyTime.local(2006, 4, 2, 12, 0, 0),
      );
      expectSameTime(
        RubyTime.local(2006, 10, 29, 10, 10, 10).middleOfDay(),
        RubyTime.local(2006, 10, 29, 12, 0, 0),
      );
    });
    withEnvTz("NZ", () => {
      expectSameTime(
        RubyTime.local(2006, 3, 19, 10, 10, 10).middleOfDay(),
        RubyTime.local(2006, 3, 19, 12, 0, 0),
      );
      expectSameTime(
        RubyTime.local(2006, 10, 1, 10, 10, 10).middleOfDay(),
        RubyTime.local(2006, 10, 1, 12, 0, 0),
      );
    });
  });

  it("beginning of hour", () => {
    expectSameTime(
      RubyTime.local(2005, 2, 4, 19, 30, 10).beginningOfHour(),
      RubyTime.local(2005, 2, 4, 19, 0, 0),
    );
  });

  it("beginning of minute", () => {
    expectSameTime(
      RubyTime.local(2005, 2, 4, 19, 30, 10).beginningOfMinute(),
      RubyTime.local(2005, 2, 4, 19, 30, 0),
    );
  });

  it("end of day", () => {
    expectSameTime(
      RubyTime.local(2007, 8, 12, 10, 10, 10).endOfDay(),
      RubyTime.local(2007, 8, 12, 23, 59, 59, NSEC_999999999_OVER_1000),
    );
    withEnvTz("US/Eastern", () => {
      expectSameTime(
        RubyTime.local(2007, 4, 2, 10, 10, 10).endOfDay(),
        RubyTime.local(2007, 4, 2, 23, 59, 59, NSEC_999999999_OVER_1000),
      );
      expectSameTime(
        RubyTime.local(2007, 10, 29, 10, 10, 10).endOfDay(),
        RubyTime.local(2007, 10, 29, 23, 59, 59, NSEC_999999999_OVER_1000),
      );
    });
    withEnvTz("NZ", () => {
      expectSameTime(
        RubyTime.local(2006, 3, 19, 10, 10, 10).endOfDay(),
        RubyTime.local(2006, 3, 19, 23, 59, 59, NSEC_999999999_OVER_1000),
      );
      expectSameTime(
        RubyTime.local(2006, 10, 1, 10, 10, 10).endOfDay(),
        RubyTime.local(2006, 10, 1, 23, 59, 59, NSEC_999999999_OVER_1000),
      );
    });
    withEnvTz("Asia/Yekaterinburg", () => {
      expectSameTime(
        RubyTime.new(2015, 2, 8, 8, 0, 0, "+05:00").endOfDay(),
        RubyTime.local(2015, 2, 8, 23, 59, 59, NSEC_999999999_OVER_1000),
      );
    });
  });

  it("end of hour", () => {
    expectSameTime(
      RubyTime.local(2005, 2, 4, 19, 30, 10).endOfHour(),
      RubyTime.local(2005, 2, 4, 19, 59, 59, NSEC_999999999_OVER_1000),
    );
  });

  it("end of minute", () => {
    expectSameTime(
      RubyTime.local(2005, 2, 4, 19, 30, 10).endOfMinute(),
      RubyTime.local(2005, 2, 4, 19, 30, 59, NSEC_999999999_OVER_1000),
    );
  });

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
});
