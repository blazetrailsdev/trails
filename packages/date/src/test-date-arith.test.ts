/**
 * Port of `vendor/date/test/date/test_date_arith.rb` — the gem's own suite,
 * which RFC 0088 makes the measure of the date port. Ruby's `+`, `-`, `<=>`,
 * `<<` and `>>` have no TS syntax that dispatches to a method, so they are the
 * named methods `docs/ruby-ts-conventions.md` ("Operators") calls for: `plus`,
 * `minus`, `cmp`, `lshift`, `rshift`.
 */
import { describe, it, expect } from "vitest";
import { ArgumentError, Date, DateTime, Rational, Time } from "./index.js";

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

  it("next", () => {
    let d = new Date(2000, 12, 31).next();
    expect([d.year, d.mon, d.mday]).toEqual([2001, 1, 1]);
    d = new Date(2000, 12, 31).succ();
    expect([d.year, d.mon, d.mday]).toEqual([2001, 1, 1]);

    // `Date.today` / `DateTime.now` answer the `Temporal` seat (RFC 0088), which
    // carries no `next`/`succ`, so Ruby's own receiver is fed back through the
    // `Temporal` constructor overload — `d_simple_new_internal`'s other entry
    // point (`date_core.c:3036`), the same idiom `test_date_new.rb`'s
    // "civil reform" uses. `d2 - 1` is `minus(1)` (`d_lite_minus`, `:6343-6360`)
    // and `assert_equal` is `Comparable#==` (`equals`).
    d = new Date(Date.today());
    let d2 = d.next();
    expect(d.equals(d2.minus(1))).toBe(true);
    d = new Date(Date.today());
    d2 = d.succ();
    expect(d.equals(d2.minus(1))).toBe(true);

    let dt = new DateTime(DateTime.now());
    let dt2 = dt.next();
    expect(dt.equals(dt2.minus(1))).toBe(true);
    dt = new DateTime(DateTime.now());
    dt2 = dt.succ();
    expect(dt.equals(dt2.minus(1))).toBe(true);
  });

  it("next day", () => {
    let d = new Date(2000, 12, 31).nextDay();
    expect([d.year, d.mon, d.mday]).toEqual([2001, 1, 1]);
    d = new Date(2000, 12, 31).nextDay(2);
    expect([d.year, d.mon, d.mday]).toEqual([2001, 1, 2]);
    d = new Date(2001, 1, 1).nextDay(-2);
    expect([d.year, d.mon, d.mday]).toEqual([2000, 12, 30]);

    const dt = new DateTime(2000, 2, 29).nextDay(new Rational(1, 2));
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec]).toEqual([2000, 2, 29, 12, 0, 0]);
  });

  it("next month", () => {
    let d = new Date(2000, 1, 31).rshift(-1);
    expect([d.year, d.mon, d.mday]).toEqual([1999, 12, 31]);
    d = new Date(2000, 1, 31).rshift(1);
    expect([d.year, d.mon, d.mday]).toEqual([2000, 2, 29]);
    d = new Date(2000, 1, 31).rshift(12);
    expect([d.year, d.mon, d.mday]).toEqual([2001, 1, 31]);
    d = new Date(2000, 1, 31).rshift(13);
    expect([d.year, d.mon, d.mday]).toEqual([2001, 2, 28]);
  });

  it("next month 2", () => {
    let d = new Date(2000, 1, 31).nextMonth(-1);
    expect([d.year, d.mon, d.mday]).toEqual([1999, 12, 31]);
    d = new Date(2000, 1, 31).nextMonth();
    expect([d.year, d.mon, d.mday]).toEqual([2000, 2, 29]);
    d = new Date(2000, 1, 31).nextMonth(12);
    expect([d.year, d.mon, d.mday]).toEqual([2001, 1, 31]);
    d = new Date(2000, 1, 31).nextMonth(13);
    expect([d.year, d.mon, d.mday]).toEqual([2001, 2, 28]);
  });

  it("next year", () => {
    let d = new Date(2000, 1, 31).nextYear(-1);
    expect([d.year, d.mon, d.mday]).toEqual([1999, 1, 31]);
    d = new Date(2000, 1, 31).nextYear();
    expect([d.year, d.mon, d.mday]).toEqual([2001, 1, 31]);
    d = new Date(2000, 1, 31).nextYear(10);
    expect([d.year, d.mon, d.mday]).toEqual([2010, 1, 31]);
    d = new Date(2000, 1, 31).nextYear(100);
    expect([d.year, d.mon, d.mday]).toEqual([2100, 1, 31]);
  });

  it("downto", () => {
    const p = new Date(2001, 1, 14);
    const q = new Date(2001, 1, 7);
    let i = 0;
    p.downto(q, () => {
      i += 1;
    });
    expect(i).toBe(8);
  });

  it("downto noblock", () => {
    const p = new Date(2001, 1, 14);
    const q = new Date(2001, 1, 7);
    const e = p.downto(q);
    expect([...e].length).toBe(8);
  });

  it("upto", () => {
    const p = new Date(2001, 1, 14);
    const q = new Date(2001, 1, 21);
    let i = 0;
    p.upto(q, () => {
      i += 1;
    });
    expect(i).toBe(8);
  });

  it("upto noblock", () => {
    const p = new Date(2001, 1, 14);
    const q = new Date(2001, 1, 21);
    const e = p.upto(q);
    expect([...e].length).toBe(8);
  });

  it("step", () => {
    const p = new Date(2001, 1, 14);
    const q = new Date(2001, 1, 21);
    let i = 0;
    p.step(q, 2, () => {
      i += 1;
    });
    expect(i).toBe(4);

    i = 0;
    p.step(q, undefined, () => {
      i += 1;
    });
    expect(i).toBe(8);
  });

  it("step noblock", () => {
    const p = new Date(2001, 1, 14);
    const q = new Date(2001, 1, 21);
    let e = p.step(q, 2);
    expect([...e].length).toBe(4);

    e = p.step(q);
    expect([...e].length).toBe(8);
  });

  it("step compare", () => {
    const p = new Date(2000, 1, 1);
    const q = new Date(1999, 12, 31);
    let o: object = { cmp: () => undefined };
    expect(() => [...p.step(q, o as never)]).toThrow(ArgumentError);

    o = { cmp: () => 2 };
    const a: Date[] = [];
    p.step(q, o as never, (d) => {
      a.push(d);
    });
    expect(a).toEqual([]);
  });
});
