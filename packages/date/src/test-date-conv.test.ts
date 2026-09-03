import { describe, it, expect } from "vitest";
import { Temporal, Date, DateTime, Time } from "./index.js";
import { Rational } from "@blazetrails/ruby-compat";

describe("TestDateConv", () => {
  it("to class", () => {
    const subjects: [Time | Date | DateTime, new (...args: never[]) => object][] = [
      [new Time(2004, 9, 19, 1, 2, 3, "+03:00"), Temporal.ZonedDateTime],
      [new Date(2004, 9, 19), Temporal.PlainDateTime],
      [new DateTime(2004, 9, 19, 1, 2, 3, new Rational(8, 24)), Temporal.ZonedDateTime],
    ];
    for (const [o, datetimeClass] of subjects) {
      expect(o.toTime()).toBeInstanceOf(Temporal.ZonedDateTime);
      expect(o.toDate()).toBeInstanceOf(Temporal.PlainDate);
      expect(o.toDatetime()).toBeInstanceOf(datetimeClass);
    }
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
    expect([
      t.year,
      t.month,
      t.day,
      t.hour,
      t.minute,
      t.second,
      usec(t),
      t.offsetNanoseconds / 1_000_000_000,
    ]).toEqual([2004, 9, 19, 1, 2, 3, 456789, 8 * 60 * 60]);

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
    expect([d2.year, d2.month, d2.day, d.dayFraction]).toEqual([2004, 9, 19, new Rational(1, 2)]);
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
    expect([d.year, d.month, d.day, d.hour, d.minute, d.second, usec(d), offsetSeconds(d)]).toEqual(
      [2004, 9, 19, 1, 2, 3, 456789, t.utcOffset],
    );

    t = Time.utc(2004, 9, 19, 1, 2, 3, 456789);
    d = t.toDatetime();
    expect([d.year, d.month, d.day, d.hour, d.minute, d.second, usec(d), offsetSeconds(d)]).toEqual(
      [2004, 9, 19, 1, 2, 3, 456789, 0],
    );

    t = Time.utc(1582, 10, 13, 1, 2, 3, 456789);
    d = t.toDatetime();
    expect([d.year, d.month, d.day, d.hour, d.minute, d.second, usec(d), offsetSeconds(d)]).toEqual(
      [1582, 10, 3, 1, 2, 3, 456789, 0],
    );

    t = Time.now();
    d = t.toDatetime();
    expect(t.iso8601(9)).toEqual(iso8601(d, 9));
  });

  it("to datetime  from date", () => {
    const d = new Date(2004, 9, 19).plus(new Rational(1, 2));
    const d2 = d.toDatetime();
    expect([
      d2.year,
      d2.month,
      d2.day,
      d2.hour,
      d2.minute,
      d2.second,
      usec(d2),
      offsetSeconds(d2),
    ]).toEqual([2004, 9, 19, 0, 0, 0, 0, 0]);
  });

  it("to datetime  from datetime", () => {
    let d = new DateTime(2004, 9, 19, 1, 2, 3, new Rational(9, 24)).plus(
      new Rational(456789, 86400000000),
    );
    let d2 = d.toDatetime();
    expect([
      d2.year,
      d2.month,
      d2.day,
      d2.hour,
      d2.minute,
      d2.second,
      usec(d2),
      offsetSeconds(d2),
    ]).toEqual([2004, 9, 19, 1, 2, 3, 456789, 9 * 60 * 60]);

    d = new DateTime(2004, 9, 19, 1, 2, 3, 0).plus(new Rational(456789, 86400000000));
    d2 = d.toDatetime();
    expect([
      d2.year,
      d2.month,
      d2.day,
      d2.hour,
      d2.minute,
      d2.second,
      usec(d2),
      offsetSeconds(d2),
    ]).toEqual([2004, 9, 19, 1, 2, 3, 456789, 0]);
  });
});

function usec(t: Temporal.ZonedDateTime | Temporal.PlainDateTime): number {
  return t.millisecond * 1000 + t.microsecond;
}

function nsec(t: Temporal.ZonedDateTime | Temporal.PlainDateTime): number {
  return t.millisecond * 1_000_000 + t.microsecond * 1_000 + t.nanosecond;
}

function iso8601(
  d: Temporal.ZonedDateTime | Temporal.PlainDateTime,
  fractionDigits: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
): string {
  return d instanceof Temporal.ZonedDateTime
    ? d.toString({ fractionalSecondDigits: fractionDigits, timeZoneName: "never" })
    : `${d.toString({ fractionalSecondDigits: fractionDigits })}+00:00`;
}

function offsetSeconds(d: Temporal.ZonedDateTime | Temporal.PlainDateTime): number {
  return d instanceof Temporal.ZonedDateTime ? d.offsetNanoseconds / 1_000_000_000 : 0;
}

function timeToDate(t: Temporal.ZonedDateTime): Date {
  const time = new Time(t.year, t.month, t.day, t.hour, t.minute, t.second);
  return new Date(time.year, time.mon, time.day, Date.GREGORIAN).newStart();
}
