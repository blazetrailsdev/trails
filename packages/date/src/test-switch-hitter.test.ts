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
 * answer is ASCII-only. `test_enc` is the same conversion: its `euc-jp` and
 * `ascii-8bit` arms differ only in the tag `force_encoding` puts on an
 * identical string, so each pair ports to one assertion on the value.
 *
 * `test_base` is `def test_base ... end if defined?(Date.test_all)`, and
 * `Date.test_all` is registered only under `#ifndef NDEBUG`
 * (`date_core.c:10045-10057`) — so a released gem never defines the method and
 * never defines the test. trails has no debug build either, which is what the
 * ported body asserts.
 *
 * `test_canon24oc`'s three static spellings answer the `Temporal` seat, which
 * has no `#hour`/`#offset`, so each is asserted through the seat's own
 * `toString` — a `PlainDateTime` with no zone IS the `offset == 0` the Ruby
 * asserts. The `DateTime.new` arm is the one that reaches `canon24oc`
 * (`date_core.c:7885-7888`) on the gem-shaped object, so it keeps the Ruby's
 * full reader tuple.
 */

import { describe, it, expect } from "vitest";
import {
  Date as RubyDate,
  DateTime as RubyDateTime,
  ERANGE,
  Rational,
  dNewByFrags,
  dtNewByFrags,
} from "./date.js";

/* eslint-disable no-control-regex */

/** Ruby `String#encoding == Encoding::US_ASCII`; see the file comment. */
function isUsAscii(s: string): boolean {
  return /^[\x00-\x7f]*$/.test(s);
}

/**
 * `Date.jd` / `DateTime.jd` on the gem-shaped object. The statics answer the
 * `Temporal` seat, whose year range (±271821) cannot hold `test_period`'s
 * -5,000,000 or `test_period2`'s Bignum Julian days, and `#mon`/`#wday`/
 * `#gregorian` are gem-object members. These are the same `d_new_by_frags`
 * (`date_core.c:4110-4147`) the statics themselves run over, given the `:jd`
 * the C's `date_s_jd` sets. `gemDateTimeJd`'s `offset` is the `:offset` frag,
 * seconds east of UTC — what `DateTime.jd`'s own `'+12:00'` argument reaches
 * `d_new_by_frags` as (`val2off`, `date_core.c:5071-5077`).
 */
const gemJd = (jd: number | bigint, sg?: number) => dNewByFrags({ jd }, sg);
const gemDateTimeJd = (
  jd: number | bigint,
  hour: number,
  min: number,
  sec: number,
  offset: number,
  sg?: number,
) => dtNewByFrags({ jd, hour, min, sec, offset }, sg);

/** `TestSH#period2_iter2`, the private helper `test_period2` drives. */
function period2Iter2(from: bigint, to: bigint, sg: number): void {
  for (let j = from; j <= to; j++) {
    const d = gemJd(j, sg);
    const d2 = new RubyDate(d.year, d.mon, d.mday, sg);
    expect(BigInt(d2.jd)).toBe(j);
    expect(String(d2.ajd)).toBe(String(d.ajd));
    expect(String(d2.year)).toBe(String(d.year));

    const t = gemDateTimeJd(j, 12, 0, 0, 12 * 3600, sg);
    const t2 = new RubyDateTime(t.year, t.mon, t.mday, t.hour, t.min, t.sec, t.offset, sg);
    expect(BigInt(t2.jd)).toBe(j);
    expect(String(t2.ajd)).toBe(String(t.ajd));
    expect(String(t2.year)).toBe(String(t.year));
  }
}

/** `TestSH#period2_iter`, the private helper `test_period2` drives. */
function period2Iter(from: bigint, to: bigint): void {
  period2Iter2(from, to, RubyDate.GREGORIAN);
  period2Iter2(from, to, RubyDate.ITALY);
  period2Iter2(from, to, RubyDate.ENGLAND);
  period2Iter2(from, to, RubyDate.JULIAN);
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

  it("cmp", () => {
    expect(new RubyDate(2001, 2, 3).cmp(new RubyDate(2001, 2, 4))).toBe(-1);
    expect(new RubyDate(2001, 2, 3).cmp(new RubyDate(2001, 2, 3))).toBe(0);
    expect(new RubyDate(2001, 2, 3).cmp(new RubyDate(2001, 2, 2))).toBe(1);

    expect(new RubyDate(2001, 2, 3).cmp(2451944.0)).toBe(-1);
    expect(new RubyDate(2001, 2, 3).cmp(2451944)).toBe(-1);
    expect(new RubyDate(2001, 2, 3).cmp(2451943.5)).toBe(0);
    expect(new RubyDate(2001, 2, 3).cmp(2451943.0)).toBe(1);
    expect(new RubyDate(2001, 2, 3).cmp(2451943)).toBe(1);

    expect(new RubyDate(2001, 2, 3).cmp(new Rational(4903888, 2))).toBe(-1);
    expect(new RubyDate(2001, 2, 3).cmp(new Rational(4903887, 2))).toBe(0);
    expect(new RubyDate(2001, 2, 3).cmp(new Rational(4903886, 2))).toBe(1);

    expect(
      new RubyDate(-4713, 11, 1, RubyDate.GREGORIAN).cmp(
        new RubyDate(-4713, 12, 1, RubyDate.GREGORIAN),
      ),
    ).toBe(-1);
  });

  it("eqeqeq", () => {
    expect(new RubyDate(2001, 2, 3).caseEquals(new RubyDate(2001, 2, 4))).toBe(false);
    expect(new RubyDate(2001, 2, 3).caseEquals(new RubyDate(2001, 2, 3))).toBe(true);
    expect(new RubyDate(2001, 2, 3).caseEquals(new RubyDate(2001, 2, 2))).toBe(false);

    expect(new RubyDate(2001, 2, 3).caseEquals(2451944.0)).toBe(true);
    expect(new RubyDate(2001, 2, 3).caseEquals(2451944)).toBe(true);
    expect(new RubyDate(2001, 2, 3).caseEquals(2451943.5)).toBe(false);
    expect(new RubyDate(2001, 2, 3).caseEquals(2451943.0)).toBe(false);
    expect(new RubyDate(2001, 2, 3).caseEquals(2451943)).toBe(false);

    expect(new RubyDate(2001, 2, 3).caseEquals(new Rational(4903888, 2))).toBe(true);
    expect(new RubyDate(2001, 2, 3).caseEquals(new Rational(4903887, 2))).toBe(false);
    expect(new RubyDate(2001, 2, 3).caseEquals(new Rational(4903886, 2))).toBe(false);
  });

  it("period", () => {
    // -5000
    let d = new RubyDate(-5000, 1, 1);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([-5000, 1, 1, 5]);
    let d2 = d.gregorian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([-5001, 11, 22, 5]);

    d = new RubyDate(-5000, 1, 1, RubyDate.JULIAN);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([-5000, 1, 1, 5]);
    d2 = d.gregorian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([-5001, 11, 22, 5]);

    d = new RubyDate(-5000, 1, 1, RubyDate.GREGORIAN);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([-5000, 1, 1, 3]);
    d2 = d.julian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([-5000, 2, 10, 3]);

    d = gemJd(-105192);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([-5000, 1, 1, 5]);
    d2 = d.gregorian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([-5001, 11, 22, 5]);

    d = gemJd(-105192, RubyDate.JULIAN);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([-5000, 1, 1, 5]);
    d2 = d.gregorian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([-5001, 11, 22, 5]);

    d = gemJd(-105152, RubyDate.GREGORIAN);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([-5000, 1, 1, 3]);
    d2 = d.julian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([-5000, 2, 10, 3]);

    // -5000000
    d = new RubyDate(-5_000_000, 1, 1);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([-5_000_000, 1, 1, 3]);
    d2 = d.gregorian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([-5_000_103, 4, 28, 3]);

    d = new RubyDate(-5_000_000, 1, 1, RubyDate.JULIAN);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([-5_000_000, 1, 1, 3]);
    d2 = d.gregorian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([-5_000_103, 4, 28, 3]);

    d = new RubyDate(-5_000_000, 1, 1, RubyDate.GREGORIAN);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([-5_000_000, 1, 1, 6]);
    d2 = d.julian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([-4_999_898, 9, 4, 6]);

    d = gemJd(-1824528942);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([-5_000_000, 1, 1, 3]);
    d2 = d.gregorian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([-5_000_103, 4, 28, 3]);

    d = gemJd(-1824528942, RubyDate.JULIAN);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([-5_000_000, 1, 1, 3]);
    d2 = d.gregorian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([-5_000_103, 4, 28, 3]);

    d = gemJd(-1824491440, RubyDate.GREGORIAN);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([-5_000_000, 1, 1, 6]);
    d2 = d.julian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([-4_999_898, 9, 4, 6]);

    // 5000000
    d = new RubyDate(5_000_000, 1, 1);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([5_000_000, 1, 1, 6]);
    d2 = d.julian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([4_999_897, 5, 3, 6]);

    d = new RubyDate(5_000_000, 1, 1, RubyDate.JULIAN);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([5_000_000, 1, 1, 5]);
    d2 = d.gregorian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([5_000_102, 9, 1, 5]);

    d = new RubyDate(5_000_000, 1, 1, RubyDate.GREGORIAN);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([5_000_000, 1, 1, 6]);
    d2 = d.julian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([4_999_897, 5, 3, 6]);

    d = gemJd(1827933560);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([5_000_000, 1, 1, 6]);
    d2 = d.julian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([4_999_897, 5, 3, 6]);

    d = gemJd(1827971058, RubyDate.JULIAN);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([5_000_000, 1, 1, 5]);
    d2 = d.gregorian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([5_000_102, 9, 1, 5]);

    d = gemJd(1827933560, RubyDate.GREGORIAN);
    expect([d.year, d.mon, d.mday, d.wday]).toEqual([5_000_000, 1, 1, 6]);
    d2 = d.julian();
    expect([d2.year, d2.mon, d2.mday, d.wday]).toEqual([4_999_897, 5, 3, 6]);

    // dt
    let dt = new RubyDateTime(-123456789, 2, 3, 4, 5, 6, 0);
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec, dt.wday]).toEqual([
      -123456789, 2, 3, 4, 5, 6, 1,
    ]);
    let dt2 = dt.gregorian();
    expect([dt2.year, dt2.mon, dt2.mday, dt2.hour, dt2.min, dt2.sec, dt.wday]).toEqual([
      -123459325, 12, 27, 4, 5, 6, 1,
    ]);

    dt = new RubyDateTime(123456789, 2, 3, 4, 5, 6, 0);
    expect([dt.year, dt.mon, dt.mday, dt.hour, dt.min, dt.sec, dt.wday]).toEqual([
      123456789, 2, 3, 4, 5, 6, 5,
    ]);
    dt2 = dt.julian();
    expect([dt2.year, dt2.mon, dt2.mday, dt2.hour, dt2.min, dt2.sec, dt.wday]).toEqual([
      123454254, 1, 19, 4, 5, 6, 5,
    ]);
  });

  it("period2", () => {
    const cmPeriod0 = 71149239n;
    const cmPeriod = (0xfffffffn / cmPeriod0) * cmPeriod0;
    period2Iter(-cmPeriod * (1n << 64n) - 3n, -cmPeriod * (1n << 64n) + 3n);
    period2Iter(-cmPeriod - 3n, -cmPeriod + 3n);
    period2Iter(0n - 3n, 0n + 3n);
    period2Iter(cmPeriod - 3n, cmPeriod + 3n);
    period2Iter(cmPeriod * (1n << 64n) - 3n, cmPeriod * (1n << 64n) + 3n);
  });

  it("different alignments", () => {
    expect(gemJd(0).cmp(new RubyDate(-4713, 11, 24, RubyDate.GREGORIAN))).toBe(0);
    expect(gemJd(213447717).cmp(new RubyDate(579687, 11, 24))).toBe(0);
    expect(gemJd(-213447717).cmp(new RubyDate(-589113, 11, 24, RubyDate.GREGORIAN))).toBe(0);

    expect(gemJd(0).cmp(new RubyDateTime(-4713, 11, 24, 0, 0, 0, 0, RubyDate.GREGORIAN))).toBe(0);
    expect(gemJd(213447717).cmp(new RubyDateTime(579687, 11, 24))).toBe(0);
    expect(
      gemJd(-213447717).cmp(new RubyDateTime(-589113, 11, 24, 0, 0, 0, 0, RubyDate.GREGORIAN)),
    ).toBe(0);

    expect(gemJd(0).equals(new RubyDate(-4713, 11, 24, RubyDate.GREGORIAN))).toBe(true);
    expect(gemJd(213447717).equals(new RubyDate(579687, 11, 24))).toBe(true);
    expect(gemJd(-213447717).equals(new RubyDate(-589113, 11, 24, RubyDate.GREGORIAN))).toBe(true);

    expect(gemJd(0).equals(new RubyDateTime(-4713, 11, 24, 0, 0, 0, 0, RubyDate.GREGORIAN))).toBe(
      true,
    );
    expect(gemJd(213447717).equals(new RubyDateTime(579687, 11, 24))).toBe(true);
    expect(
      gemJd(-213447717).equals(new RubyDateTime(-589113, 11, 24, 0, 0, 0, 0, RubyDate.GREGORIAN)),
    ).toBe(true);

    expect(gemJd(0).caseEquals(new RubyDate(-4713, 11, 24, RubyDate.GREGORIAN))).toBe(true);
    expect(gemJd(213447717).caseEquals(new RubyDate(579687, 11, 24))).toBe(true);
    expect(gemJd(-213447717).caseEquals(new RubyDate(-589113, 11, 24, RubyDate.GREGORIAN))).toBe(
      true,
    );

    expect(
      gemJd(0).caseEquals(new RubyDateTime(-4713, 11, 24, 12, 0, 0, 0, RubyDate.GREGORIAN)),
    ).toBe(true);
    expect(gemJd(213447717).caseEquals(new RubyDateTime(579687, 11, 24, 12))).toBe(true);
    expect(
      gemJd(-213447717).caseEquals(
        new RubyDateTime(-589113, 11, 24, 12, 0, 0, 0, RubyDate.GREGORIAN),
      ),
    ).toBe(true);

    let a = gemJd(0);
    let b = new RubyDate(-4713, 11, 24, RubyDate.GREGORIAN);
    expect(a.cmp(b)).toBe(0);

    a = new RubyDate(-4712, 1, 1, RubyDate.JULIAN);
    b = new RubyDate(-4713, 11, 24, RubyDate.GREGORIAN);
    void a.jd;
    void b.jd;
    expect(a.cmp(b)).toBe(0);

    a = gemJd(0);
    b = new RubyDate(-4713, 11, 24, RubyDate.GREGORIAN);
    expect(a.equals(b)).toBe(true);

    a = new RubyDate(-4712, 1, 1, RubyDate.JULIAN);
    b = new RubyDate(-4713, 11, 24, RubyDate.GREGORIAN);
    void a.jd;
    void b.jd;
    expect(a.equals(b)).toBe(true);

    a = gemJd(0);
    b = new RubyDate(-4713, 11, 24, RubyDate.GREGORIAN);
    expect(a.caseEquals(b)).toBe(true);

    a = new RubyDate(-4712, 1, 1, RubyDate.JULIAN);
    b = new RubyDate(-4713, 11, 24, RubyDate.GREGORIAN);
    void a.jd;
    void b.jd;
    expect(a.caseEquals(b)).toBe(true);
  });

  it("enc", () => {
    RubyDate.MONTHNAMES.filter((s) => s !== null).forEach((s) => {
      expect(isUsAscii(s)).toBe(true);
    });
    RubyDate.DAYNAMES.filter((s) => s !== null).forEach((s) => {
      expect(isUsAscii(s)).toBe(true);
    });
    RubyDate.ABBR_MONTHNAMES.filter((s) => s !== null).forEach((s) => {
      expect(isUsAscii(s)).toBe(true);
    });
    RubyDate.ABBR_DAYNAMES.filter((s) => s !== null).forEach((s) => {
      expect(isUsAscii(s)).toBe(true);
    });

    let h = RubyDate._strptime("15:43+09:00", "%R%z");
    expect(h?.zone).toBe("+09:00");
    h = RubyDate._strptime("1;1/0", "%d");
    expect(h?.leftover).toBe(";1/0");

    const p = RubyDate._parse("15:43+09:00");
    expect(p.zone).toBe("+09:00");

    const today = RubyDate.today();
    expect(new RubyDate(today.year, today.month, today.day).strftime("new 105")).toBe("new 105");
    const now = RubyDateTime.now();
    expect(
      new RubyDateTime(now.year, now.month, now.day, now.hour, now.minute, now.second).strftime(
        "super $record",
      ),
    ).toBe("super $record");
  });

  it("dup", () => {
    let d: RubyDate = new RubyDate(2001, 2, 3);
    let d2 = d.dup();
    expect(d2).not.toBe(d);
    expect(d2).toBeInstanceOf(RubyDate);
    expect(d.equals(d2)).toBe(true);

    d = new RubyDateTime(2001, 2, 3);
    d2 = d.dup();
    expect(d2).not.toBe(d);
    expect(d2).toBeInstanceOf(RubyDateTime);
    expect(d.equals(d2)).toBe(true);
  });

  it("base", () => {
    expect("testAll" in RubyDate).toBe(false);
  });
});
