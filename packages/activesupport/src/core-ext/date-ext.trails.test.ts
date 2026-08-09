/**
 * trails-only cover for the arms of `core_ext/date/calculations.rb` that Rails'
 * own `date_ext_test.rb` never names: the ten `alias`es (`:70-72`, `:78-82`,
 * `:88`) and the two coercion arms `compare_with_coercion` (`:152-158`) and
 * `plus_without_duration`/`minus_without_duration` (`:97`, `:107`).
 */

import { describe, it, expect, afterEach } from "vitest";
import { Temporal } from "@blazetrails/date";
import * as DateExt from "./date/calculations.js";
import { resetZone } from "../time-zone-config.js";
import { Duration } from "../duration.js";
import { TimeZone } from "../values/time-zone.js";
import { TimeWithZone } from "../time-with-zone.js";

const pd = (year: number, month: number, day: number) => new Temporal.PlainDate(year, month, day);

describe("date calculations aliases", () => {
  afterEach(() => {
    resetZone();
  });

  it("beginning_of_day aliases", () => {
    expect(DateExt.midnight).toBe(DateExt.beginningOfDay);
    expect(DateExt.atMidnight).toBe(DateExt.beginningOfDay);
    expect(DateExt.atBeginningOfDay).toBe(DateExt.beginningOfDay);
  });

  it("middle_of_day aliases", () => {
    expect(DateExt.midday).toBe(DateExt.middleOfDay);
    expect(DateExt.noon).toBe(DateExt.middleOfDay);
    expect(DateExt.atMidday).toBe(DateExt.middleOfDay);
    expect(DateExt.atNoon).toBe(DateExt.middleOfDay);
    expect(DateExt.atMiddleOfDay).toBe(DateExt.middleOfDay);
  });

  it("end_of_day alias", () => {
    expect(DateExt.atEndOfDay).toBe(DateExt.endOfDay);
  });

  it("in is an alias of since", () => {
    expect(DateExt.in).toBe(DateExt.since);
    expect(DateExt.in(pd(2005, 2, 21), 45).hour).toBe(0);
  });
});

describe("date calculations coercion arms", () => {
  it("plus_without_duration answers the day n days later", () => {
    expect(DateExt.plusWithoutDuration(pd(2005, 2, 21), 3)).toEqual(pd(2005, 2, 24));
  });

  it("minus_without_duration answers a day count against a date", () => {
    expect(DateExt.minusWithoutDuration(pd(2005, 2, 24), pd(2005, 2, 21))).toBe(3);
    expect(DateExt.minusWithoutDuration(pd(2005, 2, 24), 3)).toEqual(pd(2005, 2, 21));
  });

  it("minus_with_duration subtracts a duration", () => {
    expect(DateExt.minusWithDuration(pd(2017, 1, 3), Duration.days(2))).toEqual(pd(2017, 1, 1));
  });

  it("plus_with_duration widens for a zero sub-day part and not for a zero day part", () => {
    // `@parts.reject! { |k, v| v.zero? } unless value == 0` (duration.rb:228)
    // keeps `0.seconds`, which `sum` routes through `Date#since`.
    expect(DateExt.plusWithDuration(pd(2017, 1, 1), Duration.seconds(0))).toBeInstanceOf(
      TimeWithZone,
    );
    expect(DateExt.plusWithDuration(pd(2017, 1, 1), Duration.minutes(0))).toBeInstanceOf(
      TimeWithZone,
    );
    expect(DateExt.plusWithDuration(pd(2017, 1, 1), Duration.hours(0))).toBeInstanceOf(
      TimeWithZone,
    );
    expect(DateExt.plusWithDuration(pd(2017, 1, 1), Duration.days(0))).toEqual(pd(2017, 1, 1));
    expect(DateExt.plusWithDuration(pd(2017, 1, 1), Duration.months(0))).toEqual(pd(2017, 1, 1));
  });

  it("plus_with_duration drops the zeroes of a non-zero duration", () => {
    // `1.day + 0.seconds` has a non-zero value, so `@parts` rejects the zero
    // and the result stays a calendar day.
    expect(
      DateExt.plusWithDuration(pd(2017, 1, 1), Duration.days(1).plus(Duration.seconds(0))),
    ).toEqual(pd(2017, 1, 2));
  });

  it("plus_with_duration applies the parts in merge order", () => {
    // `@parts.merge(other._parts)` (duration.rb:270) keeps the receiver's keys
    // first, and `sum` applies them in that order.
    expect(
      DateExt.plusWithDuration(pd(2017, 1, 30), Duration.months(1).plus(Duration.days(1))),
    ).toEqual(pd(2017, 3, 1));
    expect(
      DateExt.plusWithDuration(pd(2017, 1, 30), Duration.days(1).plus(Duration.months(1))),
    ).toEqual(pd(2017, 2, 28));
  });

  it("plus_with_duration appends new keys in the other duration's own order", () => {
    // `1.day + 1.month` merges into `1.second`'s parts as {seconds, days,
    // months}, so the widened Time advances by a day and then a month rather
    // than in a canonical order.
    const dayThenMonth = Duration.days(1).plus(Duration.months(1));
    const monthThenDay = Duration.months(1).plus(Duration.days(1));
    expect(DateExt.plusWithDuration(pd(2017, 1, 30), dayThenMonth)).toEqual(pd(2017, 2, 28));
    expect(DateExt.plusWithDuration(pd(2017, 1, 30), monthThenDay)).toEqual(pd(2017, 3, 1));
    expect(
      (
        DateExt.plusWithDuration(
          pd(2017, 1, 30),
          Duration.seconds(1).plus(dayThenMonth),
        ) as TimeWithZone
      ).toDate(),
    ).toEqual(pd(2017, 2, 28));
    expect(
      (
        DateExt.plusWithDuration(
          pd(2017, 1, 30),
          Duration.seconds(1).plus(monthThenDay),
        ) as TimeWithZone
      ).toDate(),
    ).toEqual(pd(2017, 3, 1));
  });

  it("compare_without_coercion orders two dates", () => {
    expect(DateExt.compareWithoutCoercion(pd(2005, 2, 21), pd(2005, 2, 22))).toBe(-1);
    expect(DateExt.compareWithoutCoercion(pd(2005, 2, 21), pd(2005, 2, 21))).toBe(0);
    expect(DateExt.compareWithoutCoercion(pd(2005, 2, 22), pd(2005, 2, 21))).toBe(1);
  });

  it("compare_with_coercion widens the day to midnight at offset 0", () => {
    const date = pd(2005, 2, 21);
    const midnight = date.toZonedDateTime("UTC").toInstant();
    expect(DateExt.compareWithCoercion(date, midnight.add({ hours: 1 }))).toBe(-1);
    expect(DateExt.compareWithCoercion(date, midnight)).toBe(0);
    expect(DateExt.compareWithCoercion(date, midnight.subtract({ hours: 1 }))).toBe(1);
    expect(DateExt.compareWithCoercion(date, new Date(midnight.epochMilliseconds))).toBe(0);
    expect(DateExt.compareWithCoercion(date, TimeZone.find("UTC")!.local(2005, 2, 21))).toBe(0);
  });
});
