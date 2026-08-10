/**
 * Port of `vendor/date/test/date/test_date_arith.rb` lines 10-152 — the gem's
 * own suite, which RFC 0088 makes the measure of the date port. Ruby's `+`,
 * `-`, `<=>` and `<<` have no TS syntax that dispatches to a method, so they
 * are the named methods `docs/ruby-ts-conventions.md` ("Operators") calls for:
 * `plus`, `minus`, `cmp`, `lshift`.
 */
import { describe, it, expect } from "vitest";
import { Date, DateTime, Rational, Time } from "./index.js";

/** `test_date_arith.rb:6-8` — a `Numeric` whose `to_r` answers itself, so the C's
 *  `f_to_r` retry makes no progress and the arm raises. */
class Rat {}

describe("TestDateArith", () => {
  it("new offset", () => {
    const d = new DateTime(2002, 3, 14);
    expect(d.newOffset(new Rational(9, 24)).offset).toEqual(new Rational(9, 24));
    expect(d.newOffset("+0900").offset).toEqual(new Rational(9, 24));
    const n = new Rat();
    expect(() => d.newOffset(n as never)).toThrow(TypeError);
  });

  it("plus", () => {
    let d = new Date(2000, 2, 29).plus(-1);
    expect([d.year, d.mon, d.mday]).toEqual([2000, 2, 28]);
    d = new Date(2000, 2, 29).plus(0);
    expect([d.year, d.mon, d.mday]).toEqual([2000, 2, 29]);
    d = new Date(2000, 2, 29).plus(1);
    expect([d.year, d.mon, d.mday]).toEqual([2000, 3, 1]);

    const dt = new DateTime(2000, 2, 29).plus(new Rational(1, 2));
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec]).toEqual([2000, 2, 29, 12, 0, 0]);
  });

  it("plus ex", () => {
    const e = TypeError;
    expect(() => new Date(2000, 2, 29).plus("foo" as never)).toThrow(e);
    expect(() => new DateTime(2000, 2, 29).plus("foo" as never)).toThrow(e);
    // Ruby's `Time.mktime` is `Time.local` — a Time in the local zone.
    expect(() => new Date(2000, 2, 29).plus(new Time(2000, 2, 29) as never)).toThrow(e);
    expect(() => new DateTime(2000, 2, 29).plus(new Time(2000, 2, 29) as never)).toThrow(e);
    const n = new Rat();
    expect(() => new Date(2000, 2, 29).plus(n as never)).toThrow(e);
    expect(() => new DateTime(2000, 2, 29).plus(n as never)).toThrow(e);
  });

  it("minus", () => {
    let d = new Date(2000, 3, 1).minus(-1) as Date;
    expect([d.year, d.mon, d.mday]).toEqual([2000, 3, 2]);
    d = new Date(2000, 3, 1).minus(0) as Date;
    expect([d.year, d.mon, d.mday]).toEqual([2000, 3, 1]);
    d = new Date(2000, 3, 1).minus(1) as Date;
    expect([d.year, d.mon, d.mday]).toEqual([2000, 2, 29]);

    // Ruby's `Date#-` of a Date answers a Rational of days.
    expect(new Date(2000, 3, 1).minus(new Date(2000, 2, 29))).toEqual(new Rational(1, 1));
    expect(new Date(2000, 2, 29).minus(new Date(2000, 3, 1))).toEqual(new Rational(-1, 1));

    const dt = new DateTime(2000, 3, 1).minus(new Rational(1, 2)) as DateTime;
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec]).toEqual([2000, 2, 29, 12, 0, 0]);
  });

  it("minus ex", () => {
    const e = TypeError;
    expect(() => new Date(2000, 2, 29).minus("foo" as never)).toThrow(e);
    expect(() => new DateTime(2000, 2, 29).minus("foo" as never)).toThrow(e);
    expect(() => new Date(2000, 2, 29).minus(new Time(2000, 2, 29) as never)).toThrow(e);
    expect(() => new DateTime(2000, 2, 29).minus(new Time(2000, 2, 29) as never)).toThrow(e);
  });

  it("compare", () => {
    expect(new Date(2000, 1, 1).cmp(new Date(2000, 1, 1))).toBe(0);
    expect(new Date(2000, 1, 1).cmp(new Date(2000, 1, 2))).toBe(-1);
    expect(new Date(2000, 1, 2).cmp(new Date(2000, 1, 1))).toBe(1);
    expect(new Date(2001, 1, 4, Date.JULIAN).cmp(new Date(2001, 1, 17, Date.GREGORIAN))).toBe(0);
    expect(
      new DateTime(2001, 1, 4, 0, 0, 0, 0, Date.JULIAN).cmp(
        new DateTime(2001, 1, 17, 0, 0, 0, 0, Date.GREGORIAN),
      ),
    ).toBe(0);
  });

  it("prev", () => {
    const d = new Date(2000, 1, 1);
    // Ruby raises NoMethodError for the method `Date` does not define; calling
    // an absent member in JS is a TypeError.
    expect(() => (d as unknown as { prev(): void }).prev()).toThrow(TypeError);
  });

  it("prev day", () => {
    let d = new Date(2001, 1, 1).prevDay();
    expect([d.year, d.mon, d.mday]).toEqual([2000, 12, 31]);
    d = new Date(2001, 1, 1).prevDay(2);
    expect([d.year, d.mon, d.mday]).toEqual([2000, 12, 30]);
    d = new Date(2000, 12, 31).prevDay(-2);
    expect([d.year, d.mon, d.mday]).toEqual([2001, 1, 2]);

    const dt = new DateTime(2000, 3, 1).prevDay(new Rational(1, 2));
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec]).toEqual([2000, 2, 29, 12, 0, 0]);
  });

  it("prev month", () => {
    let d = new Date(2000, 1, 31).lshift(-1);
    expect([d.year, d.mon, d.mday]).toEqual([2000, 2, 29]);
    d = new Date(2000, 1, 31).lshift(1);
    expect([d.year, d.mon, d.mday]).toEqual([1999, 12, 31]);
    d = new Date(2000, 1, 31).lshift(12);
    expect([d.year, d.mon, d.mday]).toEqual([1999, 1, 31]);
    d = new Date(2000, 1, 31).lshift(14);
    expect([d.year, d.mon, d.mday]).toEqual([1998, 11, 30]);
  });

  it("prev month 2", () => {
    let d = new Date(2000, 1, 31).prevMonth(-1);
    expect([d.year, d.mon, d.mday]).toEqual([2000, 2, 29]);
    d = new Date(2000, 1, 31).prevMonth();
    expect([d.year, d.mon, d.mday]).toEqual([1999, 12, 31]);
    d = new Date(2000, 1, 31).prevMonth(12);
    expect([d.year, d.mon, d.mday]).toEqual([1999, 1, 31]);
    d = new Date(2000, 1, 31).prevMonth(14);
    expect([d.year, d.mon, d.mday]).toEqual([1998, 11, 30]);
  });

  it("prev year", () => {
    let d = new Date(2000, 1, 31).prevYear(-1);
    expect([d.year, d.mon, d.mday]).toEqual([2001, 1, 31]);
    d = new Date(2000, 1, 31).prevYear();
    expect([d.year, d.mon, d.mday]).toEqual([1999, 1, 31]);
    d = new Date(2000, 1, 31).prevYear(10);
    expect([d.year, d.mon, d.mday]).toEqual([1990, 1, 31]);
    d = new Date(2000, 1, 31).prevYear(100);
    expect([d.year, d.mon, d.mday]).toEqual([1900, 1, 31]);
  });
});
