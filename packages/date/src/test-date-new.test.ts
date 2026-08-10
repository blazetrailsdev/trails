import { describe, it, expect } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { Date, DateTime, Rational } from "./date.js";
import { Time } from "./time.js";

/**
 * `vendor/date/test/date/test_date_new.rb`, the `Date.jd` / `Date.ordinal` /
 * `Date.civil` / `Date.commercial` constructors, the `weeknum` / `nth_kday`
 * private ones, the clock readers `Date.today` / `DateTime.now`, and the
 * shared invalid-type guards.
 *
 * The builders answer `Temporal` where Ruby answers a `Date` / `DateTime`
 * (RFC 0088, `vendor/sources.ts:212-221`), so `[d.year, d.mon, d.mday]` is read
 * here as `[d.year, d.month, d.day]` and Ruby's `d.offset` — a day fraction —
 * as the offset the `Temporal` carries: none at all for the UTC arm, which is a
 * `PlainDateTime`, and `"+09:00"` for `'+0900'`, which is a `ZonedDateTime`.
 */
describe("TestDateNew", () => {
  const ymd = (d: { year: number; month: number; day: number }): number[] => [
    d.year,
    d.month,
    d.day,
  ];

  /** Ruby subtracts two `Time`s to a number of seconds; this is that number. */
  const epochSeconds = (t: Time): number => t.toTime().epochMilliseconds / 1000;

  it("jd", () => {
    const d = Date.jd();
    const dt = DateTime.jd() as Temporal.PlainDateTime;
    expect(ymd(d)).toEqual([-4712, 1, 1]);
    expect(ymd(dt)).toEqual([-4712, 1, 1]);
    expect([dt.hour, dt.minute, dt.second]).toEqual([0, 0, 0]);

    const d2 = Date.jd();
    const dt2 = DateTime.jd() as Temporal.PlainDateTime;
    expect(d.equals(d2)).toBe(true);
    expect(dt.equals(dt2)).toBe(true);

    const d3 = Date.jd(0);
    expect(ymd(d3)).toEqual([-4712, 1, 1]);
    const d4 = DateTime.jd(0, 0, 0, 0, 0) as Temporal.PlainDateTime;
    expect([...ymd(d4), d4.hour, d4.minute, d4.second]).toEqual([-4712, 1, 1, 0, 0, 0]);
    expect(d4).toBeInstanceOf(Temporal.PlainDateTime);
    const d5 = DateTime.jd(0, 0, 0, 0, "+0900") as Temporal.ZonedDateTime;
    expect([...ymd(d5), d5.hour, d5.minute, d5.second, d5.offset]).toEqual([
      -4712,
      1,
      1,
      0,
      0,
      0,
      "+09:00",
    ]);
  });

  it("jd ex", () => {
    expect(() => DateTime.jd(0, 23, 59, 60, 0)).toThrow(Date.Error);
  });

  it("valid with invalid types", () => {
    const o = {};
    expect(Date.isValidJd(o)).toBe(false);
    expect(Date.isValidCivil(o, 1, 1)).toBe(false);
    expect(Date.isValidCivil(1, o, 1)).toBe(false);
    expect(Date.isValidCivil(1, 1, o)).toBe(false);
    expect(Date.isValidOrdinal(o, 1)).toBe(false);
    expect(Date.isValidOrdinal(1, o)).toBe(false);
    expect(Date.isValidCommercial(o, 1, 1)).toBe(false);
    expect(Date.isValidCommercial(1, o, 1)).toBe(false);
    expect(Date.isValidCommercial(1, 1, o)).toBe(false);
  });

  it("invalid types", () => {
    // The arguments are typed `number` — Ruby's TypeError is the runtime half of
    // what TypeScript says statically — so each call is cast at the seam.
    const o = {} as unknown as number;
    expect(() => Date.isJulianLeap(o)).toThrow(TypeError);
    expect(() => Date.isGregorianLeap(o)).toThrow(TypeError);
    expect(() => Date.jd(o)).toThrow(TypeError);
    expect(() => new Date(o)).toThrow(TypeError);
    expect(() => new Date(1, o)).toThrow(TypeError);
    expect(() => new Date(1, 1, o)).toThrow(TypeError);
    expect(() => Date.ordinal(o)).toThrow(TypeError);
    expect(() => Date.ordinal(1, o)).toThrow(TypeError);
    expect(() => Date.commercial(o)).toThrow(TypeError);
    expect(() => Date.commercial(1, o)).toThrow(TypeError);
    expect(() => Date.commercial(1, 1, o)).toThrow(TypeError);

    expect(() => DateTime.jd(o)).toThrow(TypeError);
    expect(() => DateTime.jd(1, o)).toThrow(TypeError);
    expect(() => DateTime.jd(1, 1, o)).toThrow(TypeError);
    expect(() => DateTime.jd(1, 1, 1, o)).toThrow(TypeError);
    expect(() => new DateTime(o)).toThrow(TypeError);
    expect(() => new DateTime(1, o)).toThrow(TypeError);
    expect(() => new DateTime(1, 1, o)).toThrow(TypeError);
    expect(() => new DateTime(1, 1, 1, o)).toThrow(TypeError);
    expect(() => new DateTime(1, 1, 1, 1, o)).toThrow(TypeError);
    expect(() => new DateTime(1, 1, 1, 1, 1, o)).toThrow(TypeError);
    expect(() => DateTime.ordinal(o)).toThrow(TypeError);
    expect(() => DateTime.ordinal(1, o)).toThrow(TypeError);
    expect(() => DateTime.ordinal(1, 1, o)).toThrow(TypeError);
    expect(() => DateTime.ordinal(1, 1, 1, o)).toThrow(TypeError);
    expect(() => DateTime.ordinal(1, 1, 1, 1, o)).toThrow(TypeError);
    expect(() => DateTime.commercial(o)).toThrow(TypeError);
    expect(() => DateTime.commercial(1, o)).toThrow(TypeError);
    expect(() => DateTime.commercial(1, 1, o)).toThrow(TypeError);
    expect(() => DateTime.commercial(1, 1, 1, o)).toThrow(TypeError);
    expect(() => DateTime.commercial(1, 1, 1, 1, o)).toThrow(TypeError);
    expect(() => DateTime.commercial(1, 1, 1, 1, 1, o)).toThrow(TypeError);
  });

  it("ordinal", () => {
    const d = Date.ordinal();
    const dt = DateTime.ordinal() as Temporal.PlainDateTime;
    expect(ymd(d)).toEqual([-4712, 1, 1]);
    expect(ymd(dt)).toEqual([-4712, 1, 1]);
    expect([dt.hour, dt.minute, dt.second]).toEqual([0, 0, 0]);

    const d2 = Date.ordinal();
    const dt2 = DateTime.ordinal() as Temporal.PlainDateTime;
    expect(d.equals(d2)).toBe(true);
    expect(dt.equals(dt2)).toBe(true);

    const d3 = Date.ordinal(-4712, 1);
    expect(ymd(d3)).toEqual([-4712, 1, 1]);

    const d4 = Date.ordinal(-4712, 1.0);
    expect(ymd(d4)).toEqual([-4712, 1, 1]);

    const d5 = DateTime.ordinal(-4712, 1, 0, 0, 0, 0) as Temporal.PlainDateTime;
    expect([...ymd(d5), d5.hour, d5.minute, d5.second]).toEqual([-4712, 1, 1, 0, 0, 0]);
    expect(d5).toBeInstanceOf(Temporal.PlainDateTime);
    const d6 = DateTime.ordinal(-4712, 1, 0, 0, 0, "+0900") as Temporal.ZonedDateTime;
    expect([...ymd(d6), d6.hour, d6.minute, d6.second, d6.offset]).toEqual([
      -4712,
      1,
      1,
      0,
      0,
      0,
      "+09:00",
    ]);
  });

  it("ordinal neg", () => {
    const d = Date.ordinal(-1, -1);
    expect([d.year, d.dayOfYear]).toEqual([-1, 365]);

    const dt = DateTime.ordinal(-1, -1, -1, -1, -1, 0) as Temporal.PlainDateTime;
    expect([dt.year, dt.dayOfYear, dt.hour, dt.minute, dt.second]).toEqual([-1, 365, 23, 59, 59]);
  });

  it("ordinal ex", () => {
    expect(() => Date.ordinal(2001, 366)).toThrow(Date.Error);
    expect(() => DateTime.ordinal(2001, 365, 23, 59, 60, 0)).toThrow(Date.Error);
  });

  it("civil", () => {
    const d = Date.civil();
    const dt = DateTime.civil() as Temporal.PlainDateTime;
    expect(ymd(d)).toEqual([-4712, 1, 1]);
    expect(ymd(dt)).toEqual([-4712, 1, 1]);
    expect([dt.hour, dt.minute, dt.second]).toEqual([0, 0, 0]);

    const d2 = Date.civil();
    const dt2 = DateTime.civil() as Temporal.PlainDateTime;
    expect(d.equals(d2)).toBe(true);
    expect(dt.equals(dt2)).toBe(true);

    const d3 = Date.civil(-4712, 1, 1);
    expect(ymd(d3)).toEqual([-4712, 1, 1]);

    const d4 = Date.civil(-4712, 1, 1.0);
    expect(ymd(d4)).toEqual([-4712, 1, 1]);

    const d5 = DateTime.civil(-4712, 1, 1, 0, 0, 0, 0) as Temporal.PlainDateTime;
    expect([...ymd(d5), d5.hour, d5.minute, d5.second]).toEqual([-4712, 1, 1, 0, 0, 0]);
    expect(d5).toBeInstanceOf(Temporal.PlainDateTime);
    const d6 = DateTime.civil(-4712, 1, 1, 0, 0, 0, "+0900") as Temporal.ZonedDateTime;
    expect([...ymd(d6), d6.hour, d6.minute, d6.second, d6.offset]).toEqual([
      -4712,
      1,
      1,
      0,
      0,
      0,
      "+09:00",
    ]);

    const d7 = DateTime.civil(2001, 2, new Rational(7, 2)) as Temporal.PlainDateTime;
    expect([...ymd(d7), d7.hour, d7.minute, d7.second]).toEqual([2001, 2, 3, 12, 0, 0]);
    const d8 = DateTime.civil(2001, 2, 3, new Rational(9, 2)) as Temporal.PlainDateTime;
    expect([...ymd(d8), d8.hour, d8.minute, d8.second]).toEqual([2001, 2, 3, 4, 30, 0]);
    const d9 = DateTime.civil(2001, 2, 3, 4, new Rational(11, 2)) as Temporal.PlainDateTime;
    expect([...ymd(d9), d9.hour, d9.minute, d9.second]).toEqual([2001, 2, 3, 4, 5, 30]);
    const d10 = DateTime.civil(2001, 2, 3, 4, 5, new Rational(13, 2)) as Temporal.PlainDateTime;
    expect([...ymd(d10), d10.hour, d10.minute, d10.second]).toEqual([2001, 2, 3, 4, 5, 6]);
    // Ruby's `sec_fraction` is 1/2; the `Temporal` carries it as milliseconds.
    expect(d10.millisecond).toBe(500);

    const d11 = DateTime.civil(2001, 2) as Temporal.PlainDateTime;
    expect([...ymd(d11), d11.hour, d11.minute, d11.second]).toEqual([2001, 2, 1, 0, 0, 0]);
  });

  it("civil neg", () => {
    const d = Date.civil(-1, -1, -1);
    expect(ymd(d)).toEqual([-1, 12, 31]);

    const dt = DateTime.civil(-1, -1, -1, -1, -1, -1, 0) as Temporal.PlainDateTime;
    expect([...ymd(dt), dt.hour, dt.minute, dt.second]).toEqual([-1, 12, 31, 23, 59, 59]);
  });

  it("civil reform", () => {
    // Ruby's receivers are `Date.jd(...)` / `DateTime.jd(...)`, which answer the
    // `Temporal` seat here (RFC 0088) and so carry no arithmetic. Ruby's own
    // call is kept and the seat is fed back through the `Temporal` constructor
    // overload, `d_simple_new_internal`'s (date_core.c:3036) other entry point,
    // which is the documented inverse of `to_date` / `to_datetime`.
    //
    // `d -= 1` is `minus(1)` (`d_lite_minus`, date_core.c:6343-6360).
    let d = new Date(Date.jd(Date.ENGLAND, Date.ENGLAND), Date.ENGLAND);
    let dt = new DateTime(
      DateTime.jd(Date.ENGLAND, 0, 0, 0, 0, Date.ENGLAND) as Temporal.PlainDateTime,
      Date.ENGLAND,
    );
    expect([d.year, d.mon, d.day]).toEqual([1752, 9, 14]);
    expect([dt.year, dt.mon, dt.day]).toEqual([1752, 9, 14]);
    d = d.minus(1) as Date;
    dt = dt.minus(1) as DateTime;
    expect([d.year, d.mon, d.day]).toEqual([1752, 9, 2]);
    expect([dt.year, dt.mon, dt.day]).toEqual([1752, 9, 2]);

    d = new Date(Date.jd(Date.ITALY, Date.ITALY), Date.ITALY);
    dt = new DateTime(
      DateTime.jd(Date.ITALY, 0, 0, 0, 0, Date.ITALY) as Temporal.PlainDateTime,
      Date.ITALY,
    );
    expect([d.year, d.mon, d.day]).toEqual([1582, 10, 15]);
    expect([dt.year, dt.mon, dt.day]).toEqual([1582, 10, 15]);
    d = d.minus(1) as Date;
    dt = dt.minus(1) as DateTime;
    expect([d.year, d.mon, d.day]).toEqual([1582, 10, 4]);
    expect([dt.year, dt.mon, dt.day]).toEqual([1582, 10, 4]);
  });

  it("civil ex", () => {
    expect(() => Date.civil(2001, 2, 29)).toThrow(Date.Error);
    expect(() => DateTime.civil(2001, 2, 28, 23, 59, 60, 0)).toThrow(Date.Error);
    expect(() => DateTime.civil(2001, 2, 28, 24, 59, 59, 0)).toThrow(Date.Error);
  });

  it("commercial", () => {
    const d = Date.commercial();
    const dt = DateTime.commercial() as Temporal.PlainDateTime;
    expect(ymd(d)).toEqual([-4712, 1, 1]);
    expect(ymd(dt)).toEqual([-4712, 1, 1]);
    expect([dt.hour, dt.minute, dt.second]).toEqual([0, 0, 0]);

    const d2 = Date.commercial();
    const dt2 = DateTime.commercial() as Temporal.PlainDateTime;
    expect(d.equals(d2)).toBe(true);
    expect(dt.equals(dt2)).toBe(true);

    let d3 = Date.commercial(1582, 40, 5);
    expect(ymd(d3)).toEqual([1582, 10, 15]);

    d3 = Date.commercial(1582, 40, 5.0);
    expect(ymd(d3)).toEqual([1582, 10, 15]);

    const d4 = DateTime.commercial(1582, 40, 5, 0, 0, 0, 0) as Temporal.PlainDateTime;
    expect([...ymd(d4), d4.hour, d4.minute, d4.second]).toEqual([1582, 10, 15, 0, 0, 0]);
    expect(d4).toBeInstanceOf(Temporal.PlainDateTime);
    const d5 = DateTime.commercial(1582, 40, 5, 0, 0, 0, "+0900") as Temporal.ZonedDateTime;
    expect([...ymd(d5), d5.hour, d5.minute, d5.second, d5.offset]).toEqual([
      1582,
      10,
      15,
      0,
      0,
      0,
      "+09:00",
    ]);
  });

  it("commercial neg", () => {
    const d = Date.commercial(1998, -1, -1);
    expect(ymd(d)).toEqual([1999, 1, 3]);

    const dt = DateTime.commercial(1998, -1, -1, -1, -1, -1, 0) as Temporal.PlainDateTime;
    expect([...ymd(dt), dt.hour, dt.minute, dt.second]).toEqual([1999, 1, 3, 23, 59, 59]);
  });

  it("commercial ex", () => {
    expect(() => Date.commercial(1997, 53, 1)).toThrow(Date.Error);
    expect(() => DateTime.commercial(1997, 52, 1, 23, 59, 60, 0)).toThrow(Date.Error);
  });

  it("weeknum", () => {
    const d = Date.weeknum();
    const dt = DateTime.weeknum() as Temporal.PlainDateTime;
    expect(ymd(d)).toEqual([-4712, 1, 1]);
    expect(ymd(dt)).toEqual([-4712, 1, 1]);
    expect([dt.hour, dt.minute, dt.second]).toEqual([0, 0, 0]);

    const d2 = Date.weeknum(2002, 11, 4, 0);
    expect(d2.equals(Date.jd(2452355))).toBe(true);

    const d3 = DateTime.weeknum(2002, 11, 4, 0, 11, 22, 33) as Temporal.PlainDateTime;
    expect(d3.toPlainDate().equals(Date.jd(2452355))).toBe(true);
    expect([d3.hour, d3.minute, d3.second]).toEqual([11, 22, 33]);

    expect(() => Date.weeknum(1999, 53, 0, 0)).toThrow(Date.Error);
    expect(() => Date.weeknum(1999, -53, -1, 0)).toThrow(Date.Error);
  });

  it("nth kday", () => {
    const d = Date.nthKday();
    const dt = DateTime.nthKday() as Temporal.PlainDateTime;
    expect(ymd(d)).toEqual([-4712, 1, 1]);
    expect(ymd(dt)).toEqual([-4712, 1, 1]);
    expect([dt.hour, dt.minute, dt.second]).toEqual([0, 0, 0]);

    const d2 = Date.nthKday(1992, 2, 5, 6);
    expect(d2.equals(Date.jd(2448682))).toBe(true);

    const d3 = DateTime.nthKday(1992, 2, 5, 6, 11, 22, 33) as Temporal.PlainDateTime;
    expect(d3.toPlainDate().equals(Date.jd(2448682))).toBe(true);
    expect([d3.hour, d3.minute, d3.second]).toEqual([11, 22, 33]);

    expect(() => Date.nthKday(2006, 5, 5, 0)).toThrow(Date.Error);
    expect(() => Date.nthKday(2006, 5, -5, 0)).toThrow(Date.Error);
  });

  it("today", () => {
    const z = Time.now();
    const d = Date.today();
    const t = Time.now();
    const t2 = Time.utc(t.year, t.mon, t.day);
    const t3 = Time.utc(d.year, d.month, d.day);
    expect(Math.abs(epochSeconds(t2) - epochSeconds(t3))).toBeLessThanOrEqual(
      epochSeconds(t) - epochSeconds(z) + 2,
    );

    // @ts-expect-error `rb_undef_method(CLASS_OF(cDateTime), "today")` (date_core.c:9985)
    void DateTime.today;
  });

  it("now", () => {
    // @ts-expect-error `now` is a `DateTime` singleton method alone (date_core.c:9987)
    void Date.now;

    const z = Time.now();
    const d = DateTime.now() as Temporal.ZonedDateTime;
    const t = Time.now();
    const t2 = Time.mktime(d.year, d.month, d.day, d.hour, d.minute, d.second);
    expect(Math.abs(epochSeconds(t) - epochSeconds(t2))).toBeLessThanOrEqual(
      epochSeconds(t) - epochSeconds(z) + 2,
    );
  });
});
