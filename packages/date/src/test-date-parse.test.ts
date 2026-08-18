/**
 * Port of ruby/date's `test/date/test_date_parse.rb`.
 *
 * RFC 0088 answers `Temporal` where MRI answers `Date`/`DateTime`
 * (`vendor/sources.ts`'s `date` entry), so `Date.parse` / `DateTime.parse`
 * assertions read the Temporal counterpart of the value Ruby asserts on.
 * `Date._parse` answers the frag hash itself in both, with the hash keys
 * camelCased by `docs/ruby-ts-conventions.md` (`:sec_fraction` is
 * `secFraction`).
 *
 * The heuristic family's remaining tests are not here: `test__parse`'s table,
 * `test__parse_too_long_year` (`limit:` kwarg),
 * `test_parse__comp` (`DateTime.now`) and `test_parse__d_to_s`
 * (`DateTime#to_s`) each need a reader this package has not ported. They are
 * filed against RFC 0088.
 *
 * `test_parse__ex`'s two trailing `begin ... rescue ArgumentError => e` blocks
 * assert that what `parse('')` raises is both an `ArgumentError` and a
 * `Date::Error`; they are the last two expectations of `parse  ex`.
 */
import { Temporal } from "@js-temporal/polyfill";
import { describe, it, expect } from "vitest";
import {
  ArgumentError,
  Date,
  DateTime,
  Rational,
  dNewByFrags,
  dtNewByFrags,
  type DateParts,
} from "./date.js";
import { Time } from "./time.js";

/** Ruby's `h.values_at(...)` over the frag hash, `nil` for an absent key. */
function valuesAt(h: DateParts, ...keys: (keyof DateParts)[]): unknown[] {
  return keys.map((k) => h[k] ?? null);
}

describe("TestDateParse", () => {
  it(" parse slash exp", () => {
    const cases: [[string, boolean], (number | null)[]][] = [
      // little
      [
        ["2/5/1999", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["02/05/1999", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["02/05/-1999", false],
        [-1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["05/02", false],
        [null, 5, 2, null, null, null, null, null, null],
      ],
      [
        [" 5/ 2", false],
        [null, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["2/5/'99", true],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["2/5/0099", false],
        [99, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["2/5/0099", true],
        [99, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["2/5 1999", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["2/5-1999", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["2/5--1999", false],
        [-1999, 5, 2, null, null, null, null, null, null],
      ],

      // big
      [
        ["99/5/2", false],
        [99, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["99/5/2", true],
        [1999, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["1999/5/2", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["1999/05/02", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["-1999/05/02", false],
        [-1999, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["0099/5/2", false],
        [99, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["0099/5/2", true],
        [99, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["'99/5/2", false],
        [99, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["'99/5/2", true],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
    ];
    for (const [x, y] of cases) {
      const h = Date._parse(...x);
      const a = valuesAt(h, "year", "mon", "mday", "hour", "min", "sec", "zone", "offset", "wday");
      if (y[1] === -1) {
        a[1] = -1;
        a[2] = h.yday ?? null;
      }
      expect(a, `<failed at ${x[0]}>`).toEqual(y);
    }
  });

  it(" parse  2", () => {
    let h = Date._parse("22:45:59.5");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(5, 10 ** 1)]);
    h = Date._parse("22:45:59.05");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(5, 10 ** 2)]);
    h = Date._parse("22:45:59.005");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(5, 10 ** 3)]);
    h = Date._parse("22:45:59.0123");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(123, 10 ** 4)]);

    h = Date._parse("224559.5");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(5, 10 ** 1)]);
    h = Date._parse("224559.05");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(5, 10 ** 2)]);
    h = Date._parse("224559.005");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(5, 10 ** 3)]);
    h = Date._parse("224559.0123");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(123, 10 ** 4)]);

    h = Date._parse("2006-w15-5");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([2006, 15, 5]);
    h = Date._parse("2006w155");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([2006, 15, 5]);
    h = Date._parse("06w155", false);
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([6, 15, 5]);
    h = Date._parse("06w155", true);
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([2006, 15, 5]);

    h = Date._parse("2006-w15");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([2006, 15, null]);
    h = Date._parse("2006w15");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([2006, 15, null]);

    h = Date._parse("-w15-5");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([null, 15, 5]);
    h = Date._parse("-w155");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([null, 15, 5]);

    h = Date._parse("-w15");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([null, 15, null]);
    h = Date._parse("-w15");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([null, 15, null]);

    h = Date._parse("-w-5");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([null, null, 5]);

    h = Date._parse("--11-29");
    expect(valuesAt(h, "year", "mon", "mday")).toEqual([null, 11, 29]);
    h = Date._parse("--1129");
    expect(valuesAt(h, "year", "mon", "mday")).toEqual([null, 11, 29]);
    h = Date._parse("--11");
    expect(valuesAt(h, "year", "mon", "mday")).toEqual([null, 11, null]);
    h = Date._parse("---29");
    expect(valuesAt(h, "year", "mon", "mday")).toEqual([null, null, 29]);
    h = Date._parse("-333");
    expect(valuesAt(h, "year", "yday")).toEqual([null, 333]);

    h = Date._parse("2006-333");
    expect(valuesAt(h, "year", "yday")).toEqual([2006, 333]);
    h = Date._parse("2006333");
    expect(valuesAt(h, "year", "yday")).toEqual([2006, 333]);
    h = Date._parse("06333", false);
    expect(valuesAt(h, "year", "yday")).toEqual([6, 333]);
    h = Date._parse("06333", true);
    expect(valuesAt(h, "year", "yday")).toEqual([2006, 333]);
    h = Date._parse("333");
    expect(valuesAt(h, "year", "yday")).toEqual([null, 333]);

    h = Date._parse("");
    expect(h).toEqual({});
  });

  it("parse", () => {
    expect(Date.parse().equals(new Date().toDate())).toBe(true);
    expect(Date.parse("2002-03-14").equals(new Date(2002, 3, 14).toDate())).toBe(true);

    expect(
      DateTime.parse("2002-03-14T11:22:33Z").equals(
        new DateTime(2002, 3, 14, 11, 22, 33, 0).toDatetime(),
      ),
    ).toBe(true);
    expect(
      DateTime.parse("2002-03-14T11:22:33+09:00").equals(
        new DateTime(2002, 3, 14, 11, 22, 33, new Rational(9, 24)).toDatetime(),
      ),
    ).toBe(true);
    expect(
      DateTime.parse("2002-03-14T11:22:33-09:00").equals(
        new DateTime(2002, 3, 14, 11, 22, 33, new Rational(-9, 24)).toDatetime(),
      ),
    ).toBe(true);
    expect(
      DateTime.parse("2002-03-14T11:22:33.123456789-09:00").equals(
        new DateTime(2002, 3, 14, 11, 22, 33, new Rational(-9, 24))
          .plus(new Rational(123456789, 1000000000 * 86400))
          .toDatetime(),
      ),
    ).toBe(true);
  });

  it("parse  2", () => {
    let d1 = dtParse("2004-03-13T22:45:59.5");
    let d2 = dtParse("2004-03-13T22:45:59");
    expect(d2.plus(new Rational(5, 10 ** 1 * 86400)).equals(d1)).toBe(true);
    d1 = dtParse("2004-03-13T22:45:59.05");
    d2 = dtParse("2004-03-13T22:45:59");
    expect(d2.plus(new Rational(5, 10 ** 2 * 86400)).equals(d1)).toBe(true);
    d1 = dtParse("2004-03-13T22:45:59.005");
    d2 = dtParse("2004-03-13T22:45:59");
    expect(d2.plus(new Rational(5, 10 ** 3 * 86400)).equals(d1)).toBe(true);
    d1 = dtParse("2004-03-13T22:45:59.0123");
    d2 = dtParse("2004-03-13T22:45:59");
    expect(d2.plus(new Rational(123, 10 ** 4 * 86400)).equals(d1)).toBe(true);
    d1 = dtParse("2004-03-13T22:45:59.5");
    d1 = d1.plus(new Rational(1, 2 * 86400));
    d2 = dtParse("2004-03-13T22:46:00");
    expect(d2.equals(d1)).toBe(true);
  });

  it(" parse odd offset", () => {
    let h = DateTime._parse("2001-02-03T04:05:06+1");
    expect(h.offset).toBe(3600);
    h = DateTime._parse("2001-02-03T04:05:06+123");
    expect(h.offset).toBe(4980);
    h = DateTime._parse("2001-02-03T04:05:06+12345");
    expect(h.offset).toBe(5025);
  });

  /**
   * Ruby's `EnvUtil.timeout(3)` guards against the quadratic sub-parser walk
   * the `limit:` here is what makes safe; there is no vitest analogue and the
   * ported walk is linear, so only the assertions carry over. Ruby's
   * `Math.log10(h[:year])` is read off the digit count: JS `Math.log10` takes a
   * number, which this 100_001-digit year is not.
   */
  it(" parse too long year", () => {
    let str = "Jan 1" + "0".repeat(100_000);
    let h = Date._parse(str, true, { limit: 100_010 });
    expect(String(h.year).length - 1).toBe(100_000);
    expect(h.mon).toBe(1);

    str = "Jan - 1" + "0".repeat(100_000);
    h = Date._parse(str, true, { limit: 100_010 });
    expect(h.mon).toBe(1);
    expect(h).not.toHaveProperty("year");
  });

  it("parse utf8", () => {
    const h = DateTime._parse("Sun\u{3000}Aug 16 01:02:03 \u{65e5}\u{672c} 2009");
    expect(h.year).toBe(2009);
    expect(h.mon).toBe(8);
    expect(h.mday).toBe(16);
    expect(h.wday).toBe(0);
    expect(h.hour).toBe(1);
    expect(h.min).toBe(2);
    expect(h.sec).toBe(3);
    expect(h.zone).toBe("\u{65e5}\u{672c}");
  });

  it("parse  time", () => {
    const methods = ["toS", "asctime", "iso8601", "rfc2822", "httpdate", "xmlschema"] as const;

    let t = Time.utc(2001, 2, 3, 4, 5, 6);
    for (const m of methods) {
      const d = dtParse(t[m]());
      expect([d.year, d.mon, d.mday, d.hour, d.min, d.sec]).toEqual([2001, 2, 3, 4, 5, 6]);
    }

    t = Time.mktime(2001, 2, 3, 4, 5, 6);
    for (const m of methods) {
      if (m === "httpdate") continue;
      const d = dtParse(t[m]());
      expect([d.year, d.mon, d.mday, d.hour, d.min, d.sec]).toEqual([2001, 2, 3, 4, 5, 6]);
    }
  });

  it("parse  ex", () => {
    expect(() => Date.parse("")).toThrow(Date.Error);
    expect(() => DateTime.parse("")).toThrow(Date.Error);
    expect(() => Date.parse("2001-02-29")).toThrow(Date.Error);
    expect(() => DateTime.parse("2001-02-29T23:59:60")).toThrow(Date.Error);
    assertNothingRaised(() => DateTime.parse("2001-03-01T23:59:60"));
    expect(() => DateTime.parse("2001-03-01T23:59:61")).toThrow(Date.Error);
    expect(() => Date.parse("23:55")).toThrow(Date.Error);

    expect(rescueArgumentError(() => Date.parse("")) instanceof Date.Error).toBeTruthy();
    expect(rescueArgumentError(() => DateTime.parse("")) instanceof Date.Error).toBeTruthy();
  });

  it(" iso8601", () => {
    let h = Date._iso8601("01-02-03T04:05:06Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("2001-02-03T04:05:06Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("--02-03T04:05:06Z");
    expect(ymdhms(h)).toEqual([null, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("---03T04:05:06Z");
    expect(ymdhms(h)).toEqual([null, null, 3, 4, 5, 6, 0]);

    h = Date._iso8601("2001-02-03T04:05");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, null, null]);
    h = Date._iso8601("2001-02-03T04:05:06");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._iso8601("2001-02-03T04:05:06,07");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._iso8601("2001-02-03T04:05:06Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("2001-02-03T04:05:06.07+01:00");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);
    h = Date._iso8601("2001-02");
    expect(valuesAt(h, "year", "mon")).toEqual([2001, 2]);

    h = Date._iso8601("010203T040506Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("20010203T040506Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("--0203T040506Z");
    expect(ymdhms(h)).toEqual([null, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("---03T040506Z");
    expect(ymdhms(h)).toEqual([null, null, 3, 4, 5, 6, 0]);

    h = Date._iso8601("010203T0405");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, null, null]);
    h = Date._iso8601("20010203T0405");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, null, null]);
    h = Date._iso8601("20010203T040506");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._iso8601("20010203T040506,07");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._iso8601("20010203T040506Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("20010203T040506.07+0100");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);

    h = Date._iso8601("200102030405");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, null, null]);
    h = Date._iso8601("20010203040506");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._iso8601("20010203040506,07");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._iso8601("20010203040506Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("20010203040506.07+0100");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);

    h = Date._iso8601("01-023T04:05:06Z");
    expect(ydhms(h)).toEqual([2001, 23, 4, 5, 6, 0]);
    h = Date._iso8601("2001-023T04:05:06Z");
    expect(ydhms(h)).toEqual([2001, 23, 4, 5, 6, 0]);
    h = Date._iso8601("-023T04:05:06Z");
    expect(ydhms(h)).toEqual([null, 23, 4, 5, 6, 0]);

    h = Date._iso8601("01023T040506Z");
    expect(ydhms(h)).toEqual([2001, 23, 4, 5, 6, 0]);
    h = Date._iso8601("2001023T040506Z");
    expect(ydhms(h)).toEqual([2001, 23, 4, 5, 6, 0]);
    h = Date._iso8601("-023T040506Z");
    expect(ydhms(h)).toEqual([null, 23, 4, 5, 6, 0]);

    h = Date._iso8601("01-w02-3T04:05:06Z");
    expect(cwhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("2001-w02-3T04:05:06Z");
    expect(cwhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("-w02-3T04:05:06Z");
    expect(cwhms(h)).toEqual([null, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("-w-3T04:05:06Z");
    expect(cwhms(h)).toEqual([null, null, 3, 4, 5, 6, 0]);

    h = Date._iso8601("01w023T040506Z");
    expect(cwhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("2001w023T040506Z");
    expect(cwhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("-w023T040506Z");
    expect(cwhms(h)).toEqual([null, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("-w-3T040506Z");
    expect(cwhms(h)).toEqual([null, null, 3, 4, 5, 6, 0]);

    h = Date._iso8601("04:05");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, null, null]);
    h = Date._iso8601("04:05:06");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, null]);
    h = Date._iso8601("04:05:06,07");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, null]);
    h = Date._iso8601("04:05:06Z");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, 0]);
    h = Date._iso8601("04:05:06.07+01:00");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, 3600]);

    h = Date._iso8601("040506,07");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, null]);
    h = Date._iso8601("040506.07+0100");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, 3600]);

    h = Date._iso8601("");
    expect(h).toEqual({});

    h = Date._iso8601(null as unknown as string);
    expect(h).toEqual({});

    // See ` rfc2822` below for why the Ruby Symbol is spelled as a non-string.
    expect(() => Date._iso8601(1 as unknown as string)).toThrow(TypeError);
  });

  it(" rfc3339", () => {
    let h = Date._rfc3339("2001-02-03T04:05:06Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._rfc3339("2001-02-03 04:05:06Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._rfc3339("2001-02-03T04:05:06.07+01:00");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);

    h = Date._rfc3339("");
    expect(h).toEqual({});

    h = Date._rfc3339(null as unknown as string);
    expect(h).toEqual({});

    // See ` rfc2822` below for why the Ruby Symbol is spelled as a non-string.
    expect(() => Date._rfc3339(1 as unknown as string)).toThrow(TypeError);
  });

  it(" xmlschema", () => {
    let h = Date._xmlschema("2001-02-03");
    expect(ymdhms(h)).toEqual([2001, 2, 3, null, null, null, null]);
    h = Date._xmlschema("2001-02-03Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, null, null, null, 0]);
    h = Date._xmlschema("2001-02-03+01:00");
    expect(ymdhms(h)).toEqual([2001, 2, 3, null, null, null, 3600]);

    h = Date._xmlschema("2001-02-03T04:05:06");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._xmlschema("2001-02-03T04:05:06.07");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._xmlschema("2001-02-03T04:05:06.07Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._xmlschema("2001-02-03T04:05:06.07+01:00");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);

    h = Date._xmlschema("04:05:06");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, null]);
    h = Date._xmlschema("04:05:06Z");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, 0]);
    h = Date._xmlschema("04:05:06+01:00");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, 3600]);

    h = Date._xmlschema("2001-02");
    expect(ymdhms(h)).toEqual([2001, 2, null, null, null, null, null]);
    h = Date._xmlschema("2001-02Z");
    expect(ymdhms(h)).toEqual([2001, 2, null, null, null, null, 0]);
    h = Date._xmlschema("2001-02+01:00");
    expect(ymdhms(h)).toEqual([2001, 2, null, null, null, null, 3600]);
    h = Date._xmlschema("2001-02-01:00");
    expect(ymdhms(h)).toEqual([2001, 2, null, null, null, null, -3600]);

    h = Date._xmlschema("2001");
    expect(ymdhms(h)).toEqual([2001, null, null, null, null, null, null]);
    h = Date._xmlschema("2001Z");
    expect(ymdhms(h)).toEqual([2001, null, null, null, null, null, 0]);
    h = Date._xmlschema("2001+01:00");
    expect(ymdhms(h)).toEqual([2001, null, null, null, null, null, 3600]);
    h = Date._xmlschema("2001-01:00");
    expect(ymdhms(h)).toEqual([2001, null, null, null, null, null, -3600]);

    h = Date._xmlschema("--02");
    expect(ymdhms(h)).toEqual([null, 2, null, null, null, null, null]);
    h = Date._xmlschema("--02Z");
    expect(ymdhms(h)).toEqual([null, 2, null, null, null, null, 0]);
    h = Date._xmlschema("--02+01:00");
    expect(ymdhms(h)).toEqual([null, 2, null, null, null, null, 3600]);

    h = Date._xmlschema("92001-02-03T04:05:06.07+01:00");
    expect(ymdhms(h)).toEqual([92001, 2, 3, 4, 5, 6, 3600]);

    h = Date._xmlschema("-92001-02-03T04:05:06.07+01:00");
    expect(ymdhms(h)).toEqual([-92001, 2, 3, 4, 5, 6, 3600]);

    h = Date._xmlschema("");
    expect(h).toEqual({});

    h = Date._xmlschema(null as unknown as string);
    expect(h).toEqual({});

    // See ` rfc2822` below for why the Ruby Symbol is spelled as a non-string.
    expect(() => Date._xmlschema(1 as unknown as string)).toThrow(TypeError);
  });

  it(" rfc2822", () => {
    let h = Date._rfc2822("Sat, 3 Feb 2001 04:05:06 UT");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._rfc2822("Sat, 3 Feb 2001 04:05:06 EST");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, -5 * 3600]);
    h = Date._rfc2822("Sat, 3 Feb 2001 04:05:06 +0000");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._rfc2822("Sat, 3 Feb 2001 04:05:06 +0100");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);

    h = Date._rfc2822("Sat, 03 Feb 50 04:05:06 +0100");
    expect(ymdhms(h)).toEqual([1950, 2, 3, 4, 5, 6, 3600]);
    h = Date._rfc2822("Sat, 03 Feb 49 04:05:06 +0100");
    expect(ymdhms(h)).toEqual([2049, 2, 3, 4, 5, 6, 3600]);
    h = Date._rfc2822("Sat, 03 Feb 100 04:05:06 +0100");
    expect(ymdhms(h)).toEqual([2000, 2, 3, 4, 5, 6, 3600]);

    const h1 = Date._rfc2822("Sat, 3 Feb 2001 04:05:06 UT");
    const h2 = Date._rfc822("Sat, 3 Feb 2001 04:05:06 UT");
    expect(h1).toEqual(h2);

    h = Date._rfc2822("");
    expect(h).toEqual({});

    h = Date._rfc2822(null as unknown as string);
    expect(h).toEqual({});

    // Ruby hands `_rfc2822` the `Symbol` form of the string, which `StringValue`
    // in `check_limit` (date_core.c:4468-4479) rejects. A Ruby Symbol is a JS
    // string here (CLAUDE.md), so the argument that is not a `String` is spelled
    // as the nearest JS value that is not one.
    expect(() => Date._rfc2822(1 as unknown as string)).toThrow(TypeError);
  });

  it(" httpdate", () => {
    let h = Date._httpdate("Sat, 03 Feb 2001 04:05:06 GMT");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);

    h = Date._httpdate("Saturday, 03-Feb-01 04:05:06 GMT");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);

    h = Date._httpdate("Sat Feb  3 04:05:06 2001");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._httpdate("Sat Feb 03 04:05:06 2001");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);

    h = Date._httpdate("");
    expect(h).toEqual({});

    h = Date._httpdate(null as unknown as string);
    expect(h).toEqual({});

    // See ` rfc2822` above for why the Ruby Symbol is spelled as a non-string.
    expect(() => Date._httpdate(1 as unknown as string)).toThrow(TypeError);
  });

  it(" jisx0301", () => {
    let h = Date._jisx0301("13.02.03");
    expect(ymdhms(h)).toEqual([2001, 2, 3, null, null, null, null]);
    h = Date._jisx0301("H13.02.03");
    expect(ymdhms(h)).toEqual([2001, 2, 3, null, null, null, null]);
    h = Date._jisx0301("S63.02.03");
    expect(ymdhms(h)).toEqual([1988, 2, 3, null, null, null, null]);
    h = Date._jisx0301("H31.04.30");
    expect(ymdhms(h)).toEqual([2019, 4, 30, null, null, null, null]);
    h = Date._jisx0301("H31.05.01");
    expect(ymdhms(h)).toEqual([2019, 5, 1, null, null, null, null]);
    h = Date._jisx0301("R01.05.01");
    expect(ymdhms(h)).toEqual([2019, 5, 1, null, null, null, null]);

    h = Date._jisx0301("H13.02.03T04:05:06");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._jisx0301("H13.02.03T04:05:06,07");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._jisx0301("H13.02.03T04:05:06Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._jisx0301("H13.02.03T04:05:06.07+0100");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);

    h = Date._jisx0301("H31.04.30T04:05:06");
    expect(ymdhms(h)).toEqual([2019, 4, 30, 4, 5, 6, null]);
    h = Date._jisx0301("H31.04.30T04:05:06,07");
    expect(ymdhms(h)).toEqual([2019, 4, 30, 4, 5, 6, null]);
    h = Date._jisx0301("H31.04.30T04:05:06Z");
    expect(ymdhms(h)).toEqual([2019, 4, 30, 4, 5, 6, 0]);
    h = Date._jisx0301("H31.04.30T04:05:06.07+0100");
    expect(ymdhms(h)).toEqual([2019, 4, 30, 4, 5, 6, 3600]);

    h = Date._jisx0301("H31.05.01T04:05:06");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, null]);
    h = Date._jisx0301("H31.05.01T04:05:06,07");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, null]);
    h = Date._jisx0301("H31.05.01T04:05:06Z");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, 0]);
    h = Date._jisx0301("H31.05.01T04:05:06.07+0100");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, 3600]);

    h = Date._jisx0301("R01.05.01T04:05:06");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, null]);
    h = Date._jisx0301("R01.05.01T04:05:06,07");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, null]);
    h = Date._jisx0301("R01.05.01T04:05:06Z");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, 0]);
    h = Date._jisx0301("R01.05.01T04:05:06.07+0100");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, 3600]);

    h = Date._jisx0301("");
    expect(h).toEqual({});

    h = Date._jisx0301(null as unknown as string);
    expect(h).toEqual({});

    // See ` rfc2822` above for why the Ruby Symbol is spelled as a non-string.
    expect(() => Date._jisx0301(1 as unknown as string)).toThrow(TypeError);
  });

  it("iso8601", () => {
    expect(Date.iso8601()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.iso8601()).toBeInstanceOf(Temporal.PlainDateTime);

    const d = Date.iso8601("2001-02-03", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._iso8601("2001-02-03"))).toBe(Date.ITALY + 10);

    const dt = DateTime.iso8601("2001-02-03T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._iso8601("2001-02-03T04:05:06+07:00"))).toBe(Date.ITALY + 10);
  });

  it("rfc3339", () => {
    expect(Date.rfc3339()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.rfc3339()).toBeInstanceOf(Temporal.PlainDateTime);

    const d = Date.rfc3339("2001-02-03T04:05:06+07:00", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._rfc3339("2001-02-03T04:05:06+07:00"))).toBe(Date.ITALY + 10);

    const dt = DateTime.rfc3339("2001-02-03T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._rfc3339("2001-02-03T04:05:06+07:00"))).toBe(Date.ITALY + 10);
  });

  it("xmlschema", () => {
    expect(Date.xmlschema()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.xmlschema()).toBeInstanceOf(Temporal.PlainDateTime);

    const d = Date.xmlschema("2001-02-03", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._xmlschema("2001-02-03"))).toBe(Date.ITALY + 10);

    const dt = DateTime.xmlschema("2001-02-03T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._xmlschema("2001-02-03T04:05:06+07:00"))).toBe(Date.ITALY + 10);
  });

  it("rfc2822", () => {
    expect(Date.rfc2822()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.rfc2822()).toBeInstanceOf(Temporal.PlainDateTime);
    expect(Date.rfc822()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.rfc822()).toBeInstanceOf(Temporal.PlainDateTime);

    let d = Date.rfc2822("Sat, 3 Feb 2001 04:05:06 +0700", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._rfc2822("Sat, 3 Feb 2001 04:05:06 +0700"))).toBe(Date.ITALY + 10);
    d = Date.rfc2822("3 Feb 2001 04:05:06 +0700", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._rfc2822("3 Feb 2001 04:05:06 +0700"))).toBe(Date.ITALY + 10);

    let dt = DateTime.rfc2822("Sat, 3 Feb 2001 04:05:06 +0700", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._rfc2822("Sat, 3 Feb 2001 04:05:06 +0700"))).toBe(Date.ITALY + 10);
    dt = DateTime.rfc2822("3 Feb 2001 04:05:06 +0700", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._rfc2822("3 Feb 2001 04:05:06 +0700"))).toBe(Date.ITALY + 10);
  });

  it("httpdate", () => {
    expect(Date.httpdate()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.httpdate()).toBeInstanceOf(Temporal.PlainDateTime);

    const d = Date.httpdate("Sat, 03 Feb 2001 04:05:06 GMT", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._httpdate("Sat, 03 Feb 2001 04:05:06 GMT"))).toBe(Date.ITALY + 10);

    const dt = DateTime.httpdate("Sat, 03 Feb 2001 04:05:06 GMT", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+00:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._httpdate("Sat, 03 Feb 2001 04:05:06 GMT"))).toBe(Date.ITALY + 10);
  });

  it("jisx0301", () => {
    expect(Date.jisx0301()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.jisx0301()).toBeInstanceOf(Temporal.PlainDateTime);

    let d = Date.jisx0301("H13.02.03", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._jisx0301("H13.02.03"))).toBe(Date.ITALY + 10);

    d = Date.jisx0301("H31.04.30", Date.ITALY + 10);
    expect(d.equals(Date.civil(2019, 4, 30))).toBe(true);
    expect(startOf(Date._jisx0301("H31.04.30"))).toBe(Date.ITALY + 10);

    d = Date.jisx0301("H31.05.01", Date.ITALY + 10);
    expect(d.equals(Date.civil(2019, 5, 1))).toBe(true);
    expect(startOf(Date._jisx0301("H31.05.01"))).toBe(Date.ITALY + 10);

    d = Date.jisx0301("R01.05.01", Date.ITALY + 10);
    expect(d.equals(Date.civil(2019, 5, 1))).toBe(true);
    expect(startOf(Date._jisx0301("R01.05.01"))).toBe(Date.ITALY + 10);

    let dt = DateTime.jisx0301("H13.02.03T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._jisx0301("H13.02.03T04:05:06+07:00"))).toBe(Date.ITALY + 10);

    dt = DateTime.jisx0301("H31.04.30T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2019, 4, 30, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._jisx0301("H31.04.30T04:05:06+07:00"))).toBe(Date.ITALY + 10);

    dt = DateTime.jisx0301("H31.05.01T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2019, 5, 1, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._jisx0301("H31.05.01T04:05:06+07:00"))).toBe(Date.ITALY + 10);

    dt = DateTime.jisx0301("R01.05.01T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2019, 5, 1, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._jisx0301("R01.05.01T04:05:06+07:00"))).toBe(Date.ITALY + 10);
  });

  /**
   * Ruby also asserts the argument came back unmutated (`assert_equal(s0, s)`)
   * after each parse; a JS string is immutable, so those arms read the same
   * assertion against the untouched local.
   */
  it("given string", () => {
    let s = "2001-02-03T04:05:06Z";
    let s0 = s;

    expect(Date._parse(s)).not.toEqual({});
    expect(s).toEqual(s0);

    expect(Date._iso8601(s)).not.toEqual({});
    expect(s).toEqual(s0);

    expect(Date._rfc3339(s)).not.toEqual({});
    expect(s).toEqual(s0);

    expect(Date._xmlschema(s)).not.toEqual({});
    expect(s).toEqual(s0);

    s = "Sat, 3 Feb 2001 04:05:06 UT";
    s0 = s;
    expect(Date._rfc2822(s)).not.toEqual({});
    expect(s).toEqual(s0);
    expect(Date._rfc822(s)).not.toEqual({});
    expect(s).toEqual(s0);

    s = "Sat, 03 Feb 2001 04:05:06 GMT";
    s0 = s;
    expect(Date._httpdate(s)).not.toEqual({});
    expect(s).toEqual(s0);

    s = "H13.02.03T04:05:06,07Z";
    s0 = s;
    expect(Date._jisx0301(s)).not.toEqual({});
    expect(s).toEqual(s0);

    s = "H31.04.30T04:05:06,07Z";
    s0 = s;
    expect(Date._jisx0301(s)).not.toEqual({});
    expect(s).toEqual(s0);

    s = "H31.05.01T04:05:06,07Z";
    s0 = s;
    expect(Date._jisx0301(s)).not.toEqual({});
    expect(s).toEqual(s0);
  });

  /**
   * Ruby's list has no `httpdate` arm at all; the four this port carried were
   * an over-port, and go here.
   */
  it("length limit", () => {
    expect(() => Date._parse("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date._iso8601("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date._rfc3339("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date._xmlschema("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date._rfc2822("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date._rfc822("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date._jisx0301("1".repeat(1000))).toThrow(ArgumentError);

    expect(() => Date.parse("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date.iso8601("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date.rfc3339("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date.xmlschema("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date.rfc2822("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date.rfc822("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date.jisx0301("1".repeat(1000))).toThrow(ArgumentError);

    expect(() => DateTime.parse("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => DateTime.iso8601("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => DateTime.rfc3339("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => DateTime.xmlschema("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => DateTime.rfc2822("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => DateTime.rfc822("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => DateTime.jisx0301("1".repeat(1000))).toThrow(ArgumentError);

    expect(() => Date._parse("Jan " + "9".repeat(1000000))).toThrow(ArgumentError);
  });
});

/**
 * Ruby's `DateTime.parse` before `to_datetime`: `test_parse__2` adds a day
 * fraction to the parsed value with `Date#+`, which only the gem-shaped object
 * carries (RFC 0088's seat answers `Temporal`).
 */
function dtParse(str: string): DateTime {
  return dtNewByFrags(Date._parse(str));
}

/** Ruby `begin ... rescue ArgumentError => e`, answering the rescued `e`. */
function rescueArgumentError(block: () => unknown): unknown {
  try {
    block();
  } catch (e) {
    if (e instanceof ArgumentError) return e;
    throw e;
  }
  return null;
}

/** minitest `assert_nothing_raised`, which vitest has no matcher for. */
function assertNothingRaised<T>(block: () => T): T {
  return block();
}

/** Ruby `h.values_at(:year, :mon, :mday, :hour, :min, :sec, :offset)`. */
function ymdhms(h: DateParts): unknown[] {
  return valuesAt(h, "year", "mon", "mday", "hour", "min", "sec", "offset");
}

/**
 * Ruby asserts `Date::ITALY + 10` came back as the built date's `start`, which
 * only the gem-shaped receiver carries — RFC 0088's statics answer `Temporal`.
 */
function startOf(h: DateParts): number {
  return dNewByFrags(h, Date.ITALY + 10).start;
}

/** {@link startOf}, for the `DateTime` arms. */
function dtStartOf(h: DateParts): number {
  return dtNewByFrags(h, Date.ITALY + 10).start;
}

/** Ruby `h.values_at(:year, :yday, :hour, :min, :sec, :offset)`. */
function ydhms(h: DateParts): unknown[] {
  return valuesAt(h, "year", "yday", "hour", "min", "sec", "offset");
}

/** Ruby `h.values_at(:cwyear, :cweek, :cwday, :hour, :min, :sec, :offset)`. */
function cwhms(h: DateParts): unknown[] {
  return valuesAt(h, "cwyear", "cweek", "cwday", "hour", "min", "sec", "offset");
}

/** Ruby `h.values_at(:hour, :min, :sec, :sec_fraction)`. */
function secFrag(h: DateParts): unknown[] {
  return valuesAt(h, "hour", "min", "sec", "secFraction");
}
