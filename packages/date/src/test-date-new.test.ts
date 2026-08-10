import { describe, it, expect } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { Date, DateTime, Rational } from "./date.js";

/**
 * `vendor/date/test/date/test_date_new.rb:1-214`, the `Date.jd` / `Date.ordinal`
 * / `Date.civil` constructors and the shared invalid-type guards.
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

  it.skip("civil reform", () => {
    // Blocked, not omitted: the test's `d = Date.jd(...); d -= 1` has no
    // receiver here. `Date.jd` answers a `Temporal.PlainDate` (RFC 0088's
    // headline decision, vendor/sources.ts:212-221), which carries no `-`, and
    // `Date#-` (`d_lite_minus`, date_core.c:6344) is unported even on the
    // instance path — only `Date#+` exists. `Temporal.subtract` walks the
    // proleptic ISO calendar, so it lands on 1752-09-13 rather than the
    // reform's 1752-09-02. Filed as 0088 `port-test-date-new-civil-reform`.
  });

  it("civil ex", () => {
    expect(() => Date.civil(2001, 2, 29)).toThrow(Date.Error);
    expect(() => DateTime.civil(2001, 2, 28, 23, 59, 60, 0)).toThrow(Date.Error);
    expect(() => DateTime.civil(2001, 2, 28, 24, 59, 59, 0)).toThrow(Date.Error);
  });
});
