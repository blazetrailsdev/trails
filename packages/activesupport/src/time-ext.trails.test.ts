/**
 * trails-only coverage for the offset-carrying `to_time` arms in
 * `time-ext.ts` — `Time#to_time` (`core_ext/time/compatibility.rb:13-15`) and
 * `DateTime#to_time` (`core_ext/date_time/compatibility.rb:15-17`). Rails'
 * `test_to_time` reads these off a bare `Time` receiver; trails' matching
 * tests in `time-ext.test.ts` are bound to the JS-`Date` arm, so the switch is
 * exercised here instead.
 */
import { describe, it, expect, afterEach } from "vitest";
import { Temporal, Time as RubyTime, resetLocalTimeZoneId } from "@blazetrails/date";
import { toTime } from "./core-ext/time/compatibility.js";
import { advance, change } from "./time-ext.js";
import { offsetInSeconds, secondsSinceUnixEpoch } from "./core-ext/date-time/conversions.js";
import { setPreserveTimezone } from "./core-ext/date-and-time/compatibility.js";

/**
 * `TimeZoneTestHelpers#with_env_tz` (`test/time_zone_test_helpers.rb:20-25`).
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

describe("to_time over a receiver that carries an offset", () => {
  afterEach(() => {
    setPreserveTimezone(null);
  });

  it("Time#to_time returns self when preserve_timezone is set", () => {
    setPreserveTimezone(true);
    const time = new RubyTime(2005, 2, 21, 17, 44, 30, 3600);
    const result = toTime(time);
    expect(result.offset).toBe("+01:00");
    expect(result.hour).toBe(17);
  });

  it("Time#to_time returns getlocal when preserve_timezone is false", () => {
    setPreserveTimezone(false);
    const time = new RubyTime(2005, 2, 21, 17, 44, 30, 3600);
    const result = toTime(time);
    expect(result.timeZoneId).toBe(Temporal.Now.timeZoneId());
    expect(result.epochNanoseconds).toBe(time.toTime().epochNanoseconds);
  });

  it("DateTime#to_time returns getlocal(utc_offset) when preserve_timezone is set", () => {
    setPreserveTimezone(true);
    const datetime = Temporal.PlainDateTime.from("2005-02-21T10:11:12").toZonedDateTime("+05:00");
    const result = toTime(datetime);
    expect(result.offset).toBe("+05:00");
    expect(result.hour).toBe(10);
  });

  it("DateTime#to_time returns getlocal when preserve_timezone is false", () => {
    setPreserveTimezone(false);
    const datetime = Temporal.PlainDateTime.from("2005-02-21T10:11:12").toZonedDateTime("+05:00");
    const result = toTime(datetime);
    expect(result.timeZoneId).toBe(Temporal.Now.timeZoneId());
    expect(result.epochNanoseconds).toBe(datetime.epochNanoseconds);
  });

  it("DateTime#to_time reads a PlainDateTime as +00:00", () => {
    setPreserveTimezone(true);
    const result = toTime(Temporal.PlainDateTime.from("2005-02-21T10:11:12"));
    expect(result.offset).toBe("+00:00");
    expect(result.hour).toBe(10);
  });
});

describe("DateTime's private conversion helpers", () => {
  it("offset_in_seconds reads the receiver's offset as whole seconds", () => {
    expect(offsetInSeconds(Temporal.PlainDateTime.from("2005-02-21T10:11:12"))).toBe(0);
    expect(
      offsetInSeconds(Temporal.PlainDateTime.from("2005-02-21T10:11:12").toZonedDateTime("+05:30")),
    ).toBe(19800);
  });

  it("seconds_since_unix_epoch subtracts the offset from the local wall clock", () => {
    expect(secondsSinceUnixEpoch(Temporal.PlainDateTime.from("1970-01-01T00:00:00"))).toBe(0);
    expect(secondsSinceUnixEpoch(Temporal.PlainDateTime.from("2005-02-21T10:11:12"))).toBe(
      Date.UTC(2005, 1, 21, 10, 11, 12) / 1000,
    );
    expect(
      secondsSinceUnixEpoch(
        Temporal.PlainDateTime.from("2005-02-21T10:11:12").toZonedDateTime("+05:00"),
      ),
    ).toBe(Date.UTC(2005, 1, 21, 5, 11, 12) / 1000);
  });
});

describe("change over a ::Time receiver", () => {
  it("returns a ::Time, cascading the reset from the largest option given", () => {
    const t = RubyTime.utc(2012, 8, 29, 22, 35, 30);
    const changed = change(t, { hour: 0 });
    expect(changed).toBeInstanceOf(RubyTime);
    expect([changed.year, changed.mon, changed.day]).toEqual([2012, 8, 29]);
    expect([changed.hour, changed.min, changed.sec]).toEqual([0, 0, 0]);
    expect(changed.isUtc()).toBe(true);
  });

  it("usec: 0 drops the sub-second and leaves the rest alone", () => {
    const t = RubyTime.utc(2012, 8, 29, 22, 35, 30, 123456);
    const changed = change(t, { usec: 0 });
    expect(changed.nsec).toBe(0);
    expect([changed.hour, changed.min, changed.sec]).toEqual([22, 35, 30]);
  });
});

/**
 * `Time#advance`'s `:weeks`/`:days` normalisation is `divmod(1)`
 * (`core_ext/time/calculations.rb:195-201`), which FLOORS: `(-1.5).divmod(1)`
 * is `[-2, 0.5]` on ruby 3.3.11, not the `[-1, -0.5]` truncation would give.
 * The two quotients only part company across a DST boundary, where the whole
 * days are added on the calendar and the carried remainder in seconds. Rails
 * has no test over a negative fractional `:weeks`/`:days`, so the two
 * expectations below are MRI's own answers for the Rails body, transcribed.
 * The `::Time` receiver is covered in
 * `core-ext/time/calculations.trails.test.ts`; this is the JS-`Date` arm.
 */
describe("advance over a JS Date receiver", () => {
  it("floors a negative fractional weeks like Ruby's divmod", () => {
    withEnvTz("US/Eastern", () => {
      const advanced = advance(new Date(2005, 3, 13, 15, 15, 10), { weeks: -1.5 });
      expect(new Date(advanced.epochMilliseconds)).toEqual(new Date(2005, 3, 3, 4, 15, 10));
    });
  });

  it("floors a negative fractional days like Ruby's divmod", () => {
    withEnvTz("US/Eastern", () => {
      const advanced = advance(new Date(2005, 3, 8, 15, 15, 10), { days: -5.5 });
      expect(new Date(advanced.epochMilliseconds)).toEqual(new Date(2005, 3, 3, 4, 15, 10));
    });
  });
});
