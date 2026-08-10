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
 * The five tests that build their subject with `Date#+` — `test_to_date__from_date`,
 * `test_to_datetime__from_date`, `test_to_time__from_datetime`,
 * `test_to_date__from_datetime` and `test_to_datetime__from_datetime` — are not
 * here: `d_lite_plus` (`date_core.c:4967`) is unported, so there is no way to
 * write `Date.new(2004, 9, 19) + 1.to_r/2`. They are filed against RFC 0088.
 */
import { describe, it, expect } from "vitest";
import { Temporal, Date, DateTime, Time } from "./index.js";

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
});

/** Ruby `Time#usec` / `DateTime#sec_fraction`, off a Temporal value. */
function usec(t: Temporal.ZonedDateTime | Temporal.PlainDateTime): number {
  return t.millisecond * 1000 + t.microsecond;
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
