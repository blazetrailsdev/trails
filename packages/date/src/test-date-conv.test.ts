/**
 * Port of ruby/date's `test/date/test_date_conv.rb`.
 *
 * RFC 0088 answers `Temporal` where MRI answers `Date`/`DateTime`/`Time`
 * (`vendor/sources.ts`'s `date` entry), so every assertion below reads the
 * Temporal counterpart of the value Ruby asserts on: `Time` is
 * `Temporal.ZonedDateTime`, `Date` is `Temporal.PlainDate`, and `DateTime` is
 * `Temporal.PlainDateTime` — or a `ZonedDateTime`, once an offset is carried.
 *
 * Ruby's `with_tz` helper is not ported: it swaps `ENV["TZ"]`, and this repo
 * forbids `process.*`. The offset assertion it wraps is made directly instead —
 * a `ZonedDateTime` carries its own offset, so the host zone cannot change it.
 *
 * The five tests that build their subject with `Date#+` read the day fraction
 * off the gem-shaped receiver rather than off the converted value: MRI's
 * `to_date` answers `self`, so `d2.day_fraction` there *is* `d.day_fraction`,
 * while a `Temporal.PlainDate` has no time of day to carry one.
 *
 * `test_to_time__from_datetime`'s last block asserts
 * `t.subsec == Rational(456789123456789123, 10**18)`. `Temporal` holds
 * nanoseconds, so the sub-nanosecond tail truncates in the seat the way
 * `Time#nsec` truncates it in MRI (see `DateTime#toDatetime`); that block reads
 * the nanosecond here.
 */
import { describe, it, expect } from "vitest";
import { Temporal, Date, DateTime, Rational, Time } from "./index.js";

describe("TestDateConv", () => {
  it("to class", () => {
    const subjects = [new Time(2004, 9, 19, 1, 2, 3), new Date(2004, 9, 19)];
    for (const o of subjects) {
      expect(o.toTime()).toBeInstanceOf(Temporal.ZonedDateTime);
      expect(o.toDate()).toBeInstanceOf(Temporal.PlainDate);
    }
    const isDatetime = (v: unknown): boolean =>
      v instanceof Temporal.PlainDateTime || v instanceof Temporal.ZonedDateTime;
    expect(isDatetime(new DateTime(2004, 9, 19, 1, 2, 3).toDatetime())).toBe(true);
    expect(isDatetime(new Time(2004, 9, 19, 1, 2, 3).toDatetime())).toBe(true);
    expect(isDatetime(new Date(2004, 9, 19).toDatetime())).toBe(true);
  });

  it("to time  from time", () => {
    let t = Time.mktime(2004, 9, 19, 1, 2, 3, 456789);
    let t2 = t.toTime();
    expect([t2.year, t2.month, t2.day, t2.hour, t2.minute, t2.second, usec(t2)]).toEqual([
      2004, 9, 19, 1, 2, 3, 456789,
    ]);

    t = Time.utc(2004, 9, 19, 1, 2, 3, 456789);
    t2 = t.toTime().withTimeZone("UTC");
    expect([t2.year, t2.month, t2.day, t2.hour, t2.minute, t2.second, usec(t2)]).toEqual([
      2004, 9, 19, 1, 2, 3, 456789,
    ]);

    t = new Time(2004, 9, 19, 1, 2, 3, "+03:00");
    t2 = t.toTime();
    expect([t2.year, t2.month, t2.day, t2.hour, t2.minute, t2.second]).toEqual([
      2004, 9, 19, 1, 2, 3,
    ]);
    expect(t2.offsetNanoseconds / 1_000_000_000).toBe(3 * 60 * 60);
  });

  it("to time  from date", () => {
    const d = new Date(2004, 9, 19);
    const t = d.toTime();
    expect([t.year, t.month, t.day, t.hour, t.minute, t.second, usec(t)]).toEqual([
      2004, 9, 19, 0, 0, 0, 0,
    ]);
  });

  it("to time to date roundtrip  from gregorian date", () => {
    const d = new Date(1582, 10, 15);
    const t = d.toTime();
    expect([t.year, t.month, t.day, t.hour, t.minute, t.second, usec(t)]).toEqual([
      1582, 10, 15, 0, 0, 0, 0,
    ]);
    expect(timeToDate(t).toDate().equals(d.toDate())).toBe(true);
    expect(timeToDate(t).jd).toBe(d.jd);
  });

  it("to time to date roundtrip  from julian date", () => {
    const d = new Date(1582, 10, 4);
    const t = d.toTime();
    expect([t.year, t.month, t.day, t.hour, t.minute, t.second, usec(t)]).toEqual([
      1582, 10, 14, 0, 0, 0, 0,
    ]);
    expect(timeToDate(t).toDate().equals(d.toDate())).toBe(true);
    expect(timeToDate(t).jd).toBe(d.jd);
  });

  it("to time  from datetime", () => {
    let d = new DateTime(2004, 9, 19, 1, 2, 3, new Rational(8, 24)).plus(
      new Rational(456789, 86400000000),
    );
    let t = d.toTime();
    expect([t.year, t.month, t.day, t.hour, t.minute, t.second, usec(t)]).toEqual([
      2004, 9, 19, 1, 2, 3, 456789,
    ]);
    expect(t.offsetNanoseconds / 1_000_000_000).toBe(8 * 60 * 60);

    d = new DateTime(2004, 9, 19, 1, 2, 3, 0).plus(new Rational(456789, 86400000000));
    t = d.toTime().withTimeZone("UTC");
    expect([t.year, t.month, t.day, t.hour, t.minute, t.second, usec(t)]).toEqual([
      2004, 9, 19, 1, 2, 3, 456789,
    ]);

    d = new DateTime(1582, 10, 3, 1, 2, 3, 0).plus(new Rational(456789, 86400000000));
    t = d.toTime().withTimeZone("UTC");
    expect([t.year, t.month, t.day, t.hour, t.minute, t.second, usec(t)]).toEqual([
      1582, 10, 13, 1, 2, 3, 456789,
    ]);

    d = new DateTime(2004, 9, 19, 1, 2, 3, 0).plus(new Rational(456789123, 86400000000000));
    t = d.toTime().withTimeZone("UTC");
    expect([t.year, t.month, t.day, t.hour, t.minute, t.second, nsec(t)]).toEqual([
      2004, 9, 19, 1, 2, 3, 456789123,
    ]);

    d = new DateTime(2004, 9, 19, 1, 2, 3, 0).plus(
      new Rational(456789123456789123n, 86400000000000000000000n),
    );
    t = d.toTime().withTimeZone("UTC");
    expect([t.year, t.month, t.day, t.hour, t.minute, t.second, nsec(t)]).toEqual([
      2004, 9, 19, 1, 2, 3, 456789123,
    ]);
  });

  it("to date  from time", () => {
    let t = Time.mktime(2004, 9, 19, 1, 2, 3, 456789);
    let d = t.toDate();
    expect([d.year, d.month, d.day]).toEqual([2004, 9, 19]);

    t = Time.utc(2004, 9, 19, 1, 2, 3, 456789);
    d = t.toDate();
    expect([d.year, d.month, d.day]).toEqual([2004, 9, 19]);

    t = Time.utc(1582, 10, 13, 1, 2, 3, 456789);
    d = t.toDate();
    expect([d.year, d.month, d.day]).toEqual([1582, 10, 3]);
  });

  it("to date  from date", () => {
    const d = new Date(2004, 9, 19).plus(new Rational(1, 2));
    const d2 = d.toDate();
    expect([d2.year, d2.month, d2.day]).toEqual([2004, 9, 19]);
    expect((d.dayFraction as Rational).cmp(new Rational(1, 2))).toBe(0);
  });

  it("to date  from datetime", () => {
    let d = new DateTime(2004, 9, 19, 1, 2, 3, new Rational(9, 24)).plus(
      new Rational(456789, 86400000000),
    );
    let d2 = d.toDate();
    expect([d2.year, d2.month, d2.day]).toEqual([2004, 9, 19]);

    d = new DateTime(2004, 9, 19, 1, 2, 3, 0).plus(new Rational(456789, 86400000000));
    d2 = d.toDate();
    expect([d2.year, d2.month, d2.day]).toEqual([2004, 9, 19]);
  });

  it("to datetime  from time", () => {
    let t = Time.mktime(2004, 9, 19, 1, 2, 3, 456789);
    let d = t.toDatetime();
    expect([d.year, d.month, d.day, d.hour, d.minute, d.second, usec(d)]).toEqual([
      2004, 9, 19, 1, 2, 3, 456789,
    ]);
    expect(offsetSeconds(d)).toBe(t.utcOffset);

    t = Time.utc(2004, 9, 19, 1, 2, 3, 456789);
    d = t.toDatetime();
    expect([d.year, d.month, d.day, d.hour, d.minute, d.second, usec(d)]).toEqual([
      2004, 9, 19, 1, 2, 3, 456789,
    ]);
    expect(offsetSeconds(d)).toBe(0);

    t = Time.utc(1582, 10, 13, 1, 2, 3, 456789);
    d = t.toDatetime();
    expect([d.year, d.month, d.day, d.hour, d.minute, d.second, usec(d)]).toEqual([
      1582, 10, 3, 1, 2, 3, 456789,
    ]);
    expect(offsetSeconds(d)).toBe(0);
  });

  it("to datetime  from date", () => {
    const d = new Date(2004, 9, 19).plus(new Rational(1, 2));
    const d2 = d.toDatetime();
    expect([d2.year, d2.month, d2.day, d2.hour, d2.minute, d2.second, usec(d2)]).toEqual([
      2004, 9, 19, 0, 0, 0, 0,
    ]);
    expect(offsetSeconds(d2)).toBe(0);
  });

  it("to datetime  from datetime", () => {
    let d = new DateTime(2004, 9, 19, 1, 2, 3, new Rational(9, 24)).plus(
      new Rational(456789, 86400000000),
    );
    let d2 = d.toDatetime();
    expect([d2.year, d2.month, d2.day, d2.hour, d2.minute, d2.second, usec(d2)]).toEqual([
      2004, 9, 19, 1, 2, 3, 456789,
    ]);
    expect(offsetSeconds(d2)).toBe(9 * 60 * 60);

    d = new DateTime(2004, 9, 19, 1, 2, 3, 0).plus(new Rational(456789, 86400000000));
    d2 = d.toDatetime();
    expect([d2.year, d2.month, d2.day, d2.hour, d2.minute, d2.second, usec(d2)]).toEqual([
      2004, 9, 19, 1, 2, 3, 456789,
    ]);
    expect(offsetSeconds(d2)).toBe(0);
  });
});

/** Ruby `Time#usec` / `DateTime#sec_fraction`, off a Temporal value. */
function usec(t: Temporal.ZonedDateTime | Temporal.PlainDateTime): number {
  return t.millisecond * 1000 + t.microsecond;
}

/** Ruby `Time#nsec`, off a Temporal value. */
function nsec(t: Temporal.ZonedDateTime | Temporal.PlainDateTime): number {
  return t.millisecond * 1_000_000 + t.microsecond * 1_000 + t.nanosecond;
}

/** Ruby `DateTime#offset`, in seconds rather than as a fraction of a day. */
function offsetSeconds(d: Temporal.ZonedDateTime | Temporal.PlainDateTime): number {
  return d instanceof Temporal.ZonedDateTime ? d.offsetNanoseconds / 1_000_000_000 : 0;
}

/**
 * Ruby `Time#to_date`, as the gem-shaped `Date` rather than the `PlainDate`
 * {@link Time#toDate} answers — the roundtrip tests assert on `jd`, which only
 * the gem object carries. The receiver is the `Temporal.ZonedDateTime` that is
 * trails' `::Time` value, so it goes back through `Time` first.
 */
function timeToDate(t: Temporal.ZonedDateTime): Date {
  const time = new Time(t.year, t.month, t.day, t.hour, t.minute, t.second);
  return new Date(time.year, time.mon, time.day, Date.GREGORIAN).newStart();
}
