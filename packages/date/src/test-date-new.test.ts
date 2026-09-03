import { describe, it, expect } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { Date, DateTime } from "./date.js";
import { Time } from "./time.js";
import { Rational } from "@blazetrails/ruby-compat";

describe("TestDateNew", () => {
  const ymd = (d: { year: number; month: number; day: number }): number[] => [
    d.year,
    d.month,
    d.day,
  ];

  const offset = (d: Temporal.PlainDateTime | Temporal.ZonedDateTime): string | number =>
    d instanceof Temporal.ZonedDateTime ? d.offset : 0;

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
    expect([...ymd(d4), d4.hour, d4.minute, d4.second, offset(d4)]).toEqual([
      -4712, 1, 1, 0, 0, 0, 0,
    ]);
    const d5 = DateTime.jd(0, 0, 0, 0, "+0900") as Temporal.ZonedDateTime;
    expect([...ymd(d5), d5.hour, d5.minute, d5.second, offset(d5)]).toEqual([
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
    expect([...ymd(d5), d5.hour, d5.minute, d5.second, offset(d5)]).toEqual([
      -4712, 1, 1, 0, 0, 0, 0,
    ]);
    const d6 = DateTime.ordinal(-4712, 1, 0, 0, 0, "+0900") as Temporal.ZonedDateTime;
    expect([...ymd(d6), d6.hour, d6.minute, d6.second, offset(d6)]).toEqual([
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
    expect([...ymd(d5), d5.hour, d5.minute, d5.second, offset(d5)]).toEqual([
      -4712, 1, 1, 0, 0, 0, 0,
    ]);
    const d6 = DateTime.civil(-4712, 1, 1, 0, 0, 0, "+0900") as Temporal.ZonedDateTime;
    expect([...ymd(d6), d6.hour, d6.minute, d6.second, offset(d6)]).toEqual([
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
    expect([...ymd(d4), d4.hour, d4.minute, d4.second, offset(d4)]).toEqual([
      1582, 10, 15, 0, 0, 0, 0,
    ]);
    const d5 = DateTime.commercial(1582, 40, 5, 0, 0, 0, "+0900") as Temporal.ZonedDateTime;
    expect([...ymd(d5), d5.hour, d5.minute, d5.second, offset(d5)]).toEqual([
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
    const d = Date.today();
    const t = Time.now();
    const t2 = Time.utc(t.year, t.mon, t.day);
    const t3 = Time.utc(d.year, d.month, d.day);
    expect(epochSeconds(t2)).toBeCloseTo(epochSeconds(t3), -1);

    // @ts-expect-error see above
    void DateTime.today;
    expect(Object.hasOwn(DateTime, "today")).toEqual(false);
  });

  it("now", () => {
    // @ts-expect-error see above
    void Date.now;
    expect(Object.hasOwn(Date, "now")).toEqual(false);

    const d = DateTime.now() as Temporal.ZonedDateTime;
    const t = Time.now();
    const t2 = Time.mktime(d.year, d.month, d.day, d.hour, d.minute, d.second);
    expect(epochSeconds(t)).toBeCloseTo(epochSeconds(t2), -1);
  });
});
