/**
 * Port of the ruby/date gem's `test/date/test_switch_hitter.rb` (`TestSH`).
 *
 * The gem's own `test/date/` suite is RFC 0088's fidelity measure —
 * `parity:api` cannot score a C extension, so `vendor/sources.ts` sets
 * `compareApi: false` for this package and `parity:test` carries the gate.
 *
 * The constructors are exercised on the GEM-SHAPED objects rather than on the
 * `Temporal` seat the statics answer, for the reason `test-date-attr.test.ts`
 * gives: `#mon`, `#mday`, `#cwyear`, `#yday` and `#offset` have no
 * `Temporal.PlainDate` counterpart, and `Date.new` / `DateTime.new` are the
 * gem-shaped spelling of the same C function `Date.civil` / `DateTime.civil`
 * are defined over (`date_core.c:9973-9974`). No `Temporal` return is
 * converged back to a Ruby-shaped one here.
 *
 * Ruby's `Encoding::US_ASCII` assertions in `test_zone` / `test_to_s` /
 * `test_inspect` have no JS analogue — a JS string carries no encoding tag —
 * so the ported assertion is the property the Ruby one is checking for: the
 * answer is ASCII-only.
 *
 * `test_canon24oc`'s three static spellings answer the `Temporal` seat, which
 * has no `#hour`/`#offset`, so each is asserted through the seat's own
 * `toString` — a `PlainDateTime` with no zone IS the `offset == 0` the Ruby
 * asserts. The `DateTime.new` arm is the one that reaches `canon24oc`
 * (`date_core.c:7885-7888`) on the gem-shaped object, so it keeps the Ruby's
 * full reader tuple.
 */

import { describe, it, expect } from "vitest";
import { Date as RubyDate, DateTime as RubyDateTime, ERANGE, Rational } from "./date.js";

/* eslint-disable no-control-regex */

/** Ruby `String#encoding == Encoding::US_ASCII`; see the file comment. */
function isUsAscii(s: string): boolean {
  return /^[\x00-\x7f]*$/.test(s);
}

describe("TestSH", () => {
  it("new", () => {
    [new RubyDate(), new RubyDateTime()].forEach((d) => {
      expect([d.year, d.mon, d.mday]).toEqual([-4712, 1, 1]);
    });

    [new RubyDate(2001), new RubyDateTime(2001)].forEach((d) => {
      expect([d.year, d.mon, d.mday]).toEqual([2001, 1, 1]);
    });

    let d = new RubyDate(2001, 2, 3);
    expect([d.year, d.mon, d.mday]).toEqual([2001, 2, 3]);
    d = new RubyDate(2001, 2, new Rational(7, 2));
    expect([d.year, d.mon, d.mday]).toEqual([2001, 2, 3]);
    d = new RubyDate(2001, 2, 3, RubyDate.JULIAN);
    expect([d.year, d.mon, d.mday]).toEqual([2001, 2, 3]);
    d = new RubyDate(2001, 2, 3, RubyDate.GREGORIAN);
    expect([d.year, d.mon, d.mday]).toEqual([2001, 2, 3]);

    d = new RubyDate(2001, -12, -31);
    expect([d.year, d.mon, d.mday]).toEqual([2001, 1, 1]);
    d = new RubyDate(2001, -12, -31, RubyDate.JULIAN);
    expect([d.year, d.mon, d.mday]).toEqual([2001, 1, 1]);
    d = new RubyDate(2001, -12, -31, RubyDate.GREGORIAN);
    expect([d.year, d.mon, d.mday]).toEqual([2001, 1, 1]);

    let dt = new RubyDateTime(2001, 2, 3, 4, 5, 6);
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec, dt.offset]).toEqual([
      2001,
      2,
      3,
      4,
      5,
      6,
      new Rational(0, 1),
    ]);
    dt = new RubyDateTime(2001, 2, 3, 4, 5, 6, 0);
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec, dt.offset]).toEqual([
      2001,
      2,
      3,
      4,
      5,
      6,
      new Rational(0, 1),
    ]);
    dt = new RubyDateTime(2001, 2, 3, 4, 5, 6, new Rational(9, 24));
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec, dt.offset]).toEqual([
      2001,
      2,
      3,
      4,
      5,
      6,
      new Rational(9, 24),
    ]);
    dt = new RubyDateTime(2001, 2, 3, 4, 5, 6, 0.375);
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec, dt.offset]).toEqual([
      2001,
      2,
      3,
      4,
      5,
      6,
      new Rational(9, 24),
    ]);
    dt = new RubyDateTime(2001, 2, 3, 4, 5, 6, "+09:00");
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec, dt.offset]).toEqual([
      2001,
      2,
      3,
      4,
      5,
      6,
      new Rational(9, 24),
    ]);
    dt = new RubyDateTime(2001, 2, 3, 4, 5, 6, "-09:00");
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec, dt.offset]).toEqual([
      2001,
      2,
      3,
      4,
      5,
      6,
      new Rational(-9, 24),
    ]);
    dt = new RubyDateTime(2001, -12, -31, -4, -5, -6, "-09:00");
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec, dt.offset]).toEqual([
      2001,
      1,
      1,
      20,
      55,
      54,
      new Rational(-9, 24),
    ]);
    dt = new RubyDateTime(2001, -12, -31, -4, -5, -6, "-09:00", RubyDate.JULIAN);
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec, dt.offset]).toEqual([
      2001,
      1,
      1,
      20,
      55,
      54,
      new Rational(-9, 24),
    ]);
    dt = new RubyDateTime(2001, -12, -31, -4, -5, -6, "-09:00", RubyDate.GREGORIAN);
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec, dt.offset]).toEqual([
      2001,
      1,
      1,
      20,
      55,
      54,
      new Rational(-9, 24),
    ]);
  });

  it("jd", () => {
    let d = RubyDate.jd();
    expect([d.year, d.month, d.day]).toEqual([-4712, 1, 1]);
    d = RubyDate.jd(0);
    expect([d.year, d.month, d.day]).toEqual([-4712, 1, 1]);
    d = RubyDate.jd(2451944);
    expect([d.year, d.month, d.day]).toEqual([2001, 2, 3]);

    expect(RubyDateTime.jd().toString()).toBe("-004712-01-01T00:00:00");
    expect(RubyDateTime.jd(0).toString()).toBe("-004712-01-01T00:00:00");
    expect(RubyDateTime.jd(2451944).toString()).toBe("2001-02-03T00:00:00");
    expect(RubyDateTime.jd(2451944, 4, 5, 6).toString()).toBe("2001-02-03T04:05:06");
    expect(RubyDateTime.jd(2451944, 4, 5, 6, 0).toString()).toBe("2001-02-03T04:05:06");
    expect(RubyDateTime.jd(2451944, 4, 5, 6, "+9:00").toString()).toBe(
      "2001-02-03T04:05:06+09:00[+09:00]",
    );
    expect(RubyDateTime.jd(2451944, -4, -5, -6, "-9:00").toString()).toBe(
      "2001-02-03T20:55:54-09:00[-09:00]",
    );
  });

  it("ordinal", () => {
    let d = RubyDate.ordinal();
    expect([d.year, d.dayOfYear]).toEqual([-4712, 1]);
    d = RubyDate.ordinal(-4712, 1);
    expect([d.year, d.dayOfYear]).toEqual([-4712, 1]);

    d = RubyDate.ordinal(2001, 2);
    expect([d.year, d.dayOfYear]).toEqual([2001, 2]);
    d = RubyDate.ordinal(2001, 2, RubyDate.JULIAN);
    expect([d.year, d.dayOfYear]).toEqual([2001, 2]);
    d = RubyDate.ordinal(2001, 2, RubyDate.GREGORIAN);
    expect([d.year, d.dayOfYear]).toEqual([2001, 2]);

    d = RubyDate.ordinal(2001, -2, RubyDate.JULIAN);
    expect([d.year, d.dayOfYear]).toEqual([2001, 364]);
    d = RubyDate.ordinal(2001, -2, RubyDate.GREGORIAN);
    expect([d.year, d.dayOfYear]).toEqual([2001, 364]);

    expect(RubyDateTime.ordinal().toString()).toBe("-004712-01-01T00:00:00");
    expect(RubyDateTime.ordinal(-4712, 1).toString()).toBe("-004712-01-01T00:00:00");
    expect(RubyDateTime.ordinal(2001, 34).toString()).toBe("2001-02-03T00:00:00");
    expect(RubyDateTime.ordinal(2001, 34, 4, 5, 6).toString()).toBe("2001-02-03T04:05:06");
    expect(RubyDateTime.ordinal(2001, 34, 4, 5, 6, 0).toString()).toBe("2001-02-03T04:05:06");
    expect(RubyDateTime.ordinal(2001, 34, 4, 5, 6, "+9:00").toString()).toBe(
      "2001-02-03T04:05:06+09:00[+09:00]",
    );
    expect(RubyDateTime.ordinal(2001, 34, -4, -5, -6, "-9:00").toString()).toBe(
      "2001-02-03T20:55:54-09:00[-09:00]",
    );
  });

  it("commercial", () => {
    expect(RubyDate.commercial().toString()).toBe("-004712-01-01");
    expect(RubyDate.commercial(-4712, 1, 1).toString()).toBe("-004712-01-01");

    expect(RubyDate.commercial(2001, 2, 3).toString()).toBe("2001-01-10");
    expect(RubyDate.commercial(2001, 2, 3, RubyDate.JULIAN).toString()).toBe("2001-01-11");
    expect(RubyDate.commercial(2001, 2, 3, RubyDate.GREGORIAN).toString()).toBe("2001-01-10");

    expect(RubyDate.commercial(2001, -2, -3).toString()).toBe("2001-12-21");
    expect(RubyDate.commercial(2001, -2, -3, RubyDate.JULIAN).toString()).toBe("2001-12-22");
    expect(RubyDate.commercial(2001, -2, -3, RubyDate.GREGORIAN).toString()).toBe("2001-12-21");

    expect(RubyDateTime.commercial().toString()).toBe("-004712-01-01T00:00:00");
    expect(RubyDateTime.commercial(-4712, 1, 1).toString()).toBe("-004712-01-01T00:00:00");
    expect(RubyDateTime.commercial(2001, 5, 6).toString()).toBe("2001-02-03T00:00:00");
    expect(RubyDateTime.commercial(2001, 5, 6, 4, 5, 6).toString()).toBe("2001-02-03T04:05:06");
    expect(RubyDateTime.commercial(2001, 5, 6, 4, 5, 6, 0).toString()).toBe("2001-02-03T04:05:06");
    expect(RubyDateTime.commercial(2001, 5, 6, 4, 5, 6, "+9:00").toString()).toBe(
      "2001-02-03T04:05:06+09:00[+09:00]",
    );
    expect(RubyDateTime.commercial(2001, 5, 6, -4, -5, -6, "-9:00").toString()).toBe(
      "2001-02-03T20:55:54-09:00[-09:00]",
    );
  });

  it("fractional", () => {
    expect(RubyDate.jd(2451944.0).toString()).toBe("2001-02-03");
    expect(RubyDate.jd(new Rational(2451944, 1)).toString()).toBe("2001-02-03");
    expect(RubyDate.jd(2451944.5).toString()).toBe("2001-02-03");
    expect(RubyDate.jd(new Rational(4903889, 2)).toString()).toBe("2001-02-03");

    let p = RubyDate.civil(2001, 2, 3.0);
    expect([p.year, p.month, p.day]).toEqual([2001, 2, 3]);
    p = RubyDate.civil(2001, 2, new Rational(3, 1));
    expect([p.year, p.month, p.day]).toEqual([2001, 2, 3]);
    p = RubyDate.civil(2001, 2, 3.5);
    expect([p.year, p.month, p.day]).toEqual([2001, 2, 3]);
    p = RubyDate.civil(2001, 2, new Rational(7, 2));
    expect([p.year, p.month, p.day]).toEqual([2001, 2, 3]);

    p = RubyDate.ordinal(2001, 2.0);
    expect([p.year, p.dayOfYear]).toEqual([2001, 2]);
    p = RubyDate.ordinal(2001, new Rational(2, 1));
    expect([p.year, p.dayOfYear]).toEqual([2001, 2]);

    expect(RubyDate.commercial(2001, 2, 3.0).toString()).toBe("2001-01-10");
    expect(RubyDate.commercial(2001, 2, new Rational(3, 1)).toString()).toBe("2001-01-10");

    expect(RubyDateTime.jd(2451944.0).toString()).toBe("2001-02-03T00:00:00");
    expect(RubyDateTime.jd(new Rational(2451944, 1)).toString()).toBe("2001-02-03T00:00:00");
    expect(RubyDateTime.jd(2451944.5).toString()).toBe("2001-02-03T12:00:00");
    expect(RubyDateTime.jd(new Rational(4903889, 2)).toString()).toBe("2001-02-03T12:00:00");

    expect(RubyDateTime.civil(2001, 2, 3.0).toString()).toBe("2001-02-03T00:00:00");
    expect(RubyDateTime.civil(2001, 2, new Rational(3, 1)).toString()).toBe("2001-02-03T00:00:00");
    expect(RubyDateTime.civil(2001, 2, 3.5).toString()).toBe("2001-02-03T12:00:00");
    expect(RubyDateTime.civil(2001, 2, new Rational(7, 2)).toString()).toBe("2001-02-03T12:00:00");
    expect(RubyDateTime.civil(2001, 2, 3, 4.5).toString()).toBe("2001-02-03T04:30:00");
    expect(RubyDateTime.civil(2001, 2, 3, new Rational(9, 2)).toString()).toBe(
      "2001-02-03T04:30:00",
    );
    expect(RubyDateTime.civil(2001, 2, 3, 4, 5.5).toString()).toBe("2001-02-03T04:05:30");
    expect(RubyDateTime.civil(2001, 2, 3, 4, new Rational(11, 2)).toString()).toBe(
      "2001-02-03T04:05:30",
    );

    expect(RubyDateTime.ordinal(2001, 2.0).toString()).toBe("2001-01-02T00:00:00");
    expect(RubyDateTime.ordinal(2001, new Rational(2, 1)).toString()).toBe("2001-01-02T00:00:00");

    expect(RubyDateTime.commercial(2001, 2, 3.0).toString()).toBe("2001-01-10T00:00:00");
    expect(RubyDateTime.commercial(2001, 2, new Rational(3, 1)).toString()).toBe(
      "2001-01-10T00:00:00",
    );
  });

  it("canon24oc", () => {
    let d = RubyDateTime.jd(2451943, 24);
    expect(d.toString()).toBe("2001-02-03T00:00:00");
    d = RubyDateTime.ordinal(2001, 33, 24);
    expect(d.toString()).toBe("2001-02-03T00:00:00");
    const dt = new RubyDateTime(2001, 2, 2, 24);
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec, dt.offset]).toEqual([
      2001,
      2,
      3,
      0,
      0,
      0,
      new Rational(0, 1),
    ]);
    d = RubyDateTime.commercial(2001, 5, 5, 24);
    expect(d.toString()).toBe("2001-02-03T00:00:00");
  });

  it("strftime", () => {
    const today = RubyDate.today();
    expect(() => new RubyDate(today.year, today.month, today.day).strftime("%100000z")).toThrow(
      ERANGE,
    );
    expect(() => new RubyDate(2n ** 10000n).strftime("%Y")).toThrow(ERANGE);
    expect(new RubyDate(1850).strftime("%s")).toBe("-3786825600");
    expect(new RubyDate(1850).strftime("%Q")).toBe("-3786825600000");
  });

  it("zone", () => {
    const d = new RubyDateTime(2001, 2, 3);
    expect(isUsAscii(d.zone)).toBe(true);
  });

  it("to s", () => {
    let d: RubyDate = new RubyDate(2001, 2, 3);
    expect(isUsAscii(d.toS())).toBe(true);
    expect(isUsAscii(d.strftime())).toBe(true);
    d = new RubyDateTime(2001, 2, 3);
    expect(isUsAscii(d.toS())).toBe(true);
    expect(isUsAscii(d.strftime())).toBe(true);
  });

  it("inspect", () => {
    let d: RubyDate = new RubyDate(2001, 2, 3);
    expect(isUsAscii(d.inspect())).toBe(true);
    d = new RubyDateTime(2001, 2, 3);
    expect(isUsAscii(d.inspect())).toBe(true);
  });
});
