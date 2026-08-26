import { afterEach, describe, expect, it } from "vitest";
import { Rational, Time as RubyTime, resetLocalTimeZoneId } from "@blazetrails/date";
import "./calculations.js";

function withEnvTz<T>(tz: string, fn: () => T): T {
  const orig = process.env.TZ;
  process.env.TZ = tz;
  // `Time`'s local-zone memo is MRI's `tzset` cache; `TZ` moving under it has
  // to drop it, exactly as `tzset` does.
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
      // "start DST"
      expectSameTime(
        RubyTime.local(2006, 4, 2, 10, 10, 10).beginningOfDay(),
        RubyTime.local(2006, 4, 2, 0, 0, 0),
      );
      // "ends DST"
      expectSameTime(
        RubyTime.local(2006, 10, 29, 10, 10, 10).beginningOfDay(),
        RubyTime.local(2006, 10, 29, 0, 0, 0),
      );
    });
    withEnvTz("NZ", () => {
      // "ends DST"
      expectSameTime(
        RubyTime.local(2006, 3, 19, 10, 10, 10).beginningOfDay(),
        RubyTime.local(2006, 3, 19, 0, 0, 0),
      );
      // "start DST"
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
      // "start DST"
      expectSameTime(
        RubyTime.local(2007, 4, 2, 10, 10, 10).endOfDay(),
        RubyTime.local(2007, 4, 2, 23, 59, 59, NSEC_999999999_OVER_1000),
      );
      // "ends DST"
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
});
