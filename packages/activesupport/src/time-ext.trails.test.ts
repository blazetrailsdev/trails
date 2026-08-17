/**
 * trails-only coverage for the offset-carrying `to_time` arms in
 * `time-ext.ts` — `Time#to_time` (`core_ext/time/compatibility.rb:13-15`) and
 * `DateTime#to_time` (`core_ext/date_time/compatibility.rb:15-17`). Rails'
 * `test_to_time` reads these off a bare `Time` receiver; trails' matching
 * tests in `time-ext.test.ts` are bound to the JS-`Date` arm, so the switch is
 * exercised here instead.
 */
import { describe, it, expect, afterEach } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { toTime } from "./time-ext.js";
import { offsetInSeconds, secondsSinceUnixEpoch } from "./core-ext/date-time/conversions.js";
import { setPreserveTimezone } from "./core-ext/date-and-time/compatibility.js";

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
