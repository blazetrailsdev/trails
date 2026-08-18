/**
 * Port of ruby/date's `test/date/test_date_strftime.rb`, the standard
 * directive set (`:70-215`, through `test_strftime__minus`), the GNU
 * coreutils extensions (`:216-356`, through `test_strftime__gnuext_complex`),
 * `test__different_format` (`:359-443`) and `test_overflow` (`:445-452`).
 *
 * The gem's statics answer `Temporal` under RFC 0088, so where Ruby writes
 * `DateTime.parse(s)` and then calls `#strftime` on the result, this file goes
 * through the exported `dtNewByFrags`/`dNewByFrags` builders those statics
 * themselves call — the gem-shaped object that carries `strftime`.
 *
 * `test__different_format`'s `limit:` arms go through the statics, which answer
 * `Temporal` under RFC 0088, so where Ruby compares the parsed `DateTime` to
 * `d2` directly this file compares the seat each side names.
 *
 * `test_strftime__offset`'s `assert_warning(/invalid offset/)` arm goes through
 * {@link assertWarning}, which sets `$VERBOSE` for the block the way Ruby's
 * does — `rb_warning("invalid offset is ignored")` (`date_core.c:8304`) is
 * emitted only under it.
 */

import { describe, it, expect, vi } from "vitest";
import {
  Date as RubyDate,
  DateTime as RubyDateTime,
  Rational,
  dNewByFrags,
  dtNewByFrags,
} from "./date.js";
import { Time as RubyTime } from "./time.js";
import { setRubyVerbose } from "./rb-warning.js";

/**
 * Ruby's `assert_warning` (`test/lib/core_assertions.rb`): runs the block with
 * `$VERBOSE` set, capturing what `rb_warning` writes, and matches it against
 * the pattern. `$VERBOSE` is restored in a `finally` so it cannot leak past the
 * block, let alone past this file.
 */
function assertWarning(pattern: RegExp, block: () => void): void {
  const stderr = vi.spyOn(console, "warn").mockImplementation(() => {});
  let output: string;
  setRubyVerbose(true);
  try {
    block();
  } finally {
    setRubyVerbose(false);
    output = stderr.mock.calls.map((call) => String(call[0])).join("\n");
    stderr.mockRestore();
  }
  expect(output).toMatch(pattern);
}

const gemDateParse = (str: string) => dNewByFrags(RubyDate._parse(str));
const gemDateTimeParse = (str: string) => dtNewByFrags(RubyDate._parse(str));
const gemDateTimeStrptime = (str: string, fmt: string) =>
  dtNewByFrags(RubyDateTime._strptime(str, fmt));

const STRFTIME_2001_02_03: Record<string, [string, Record<string, unknown>]> = {
  "%A": ["Saturday", { wday: 6 }],
  "%a": ["Sat", { wday: 6 }],
  "%B": ["February", { mon: 2 }],
  "%b": ["Feb", { mon: 2 }],
  "%c": [
    "Sat Feb  3 00:00:00 2001",
    { wday: 6, mon: 2, mday: 3, hour: 0, min: 0, sec: 0, year: 2001 },
  ],
  "%d": ["03", { mday: 3 }],
  "%e": [" 3", { mday: 3 }],
  "%H": ["00", { hour: 0 }],
  "%I": ["12", { hour: 0 }],
  "%j": ["034", { yday: 34 }],
  "%M": ["00", { min: 0 }],
  "%m": ["02", { mon: 2 }],
  "%p": ["AM", {}],
  "%S": ["00", { sec: 0 }],
  "%U": ["04", { wnum0: 4 }],
  "%W": ["05", { wnum1: 5 }],
  "%X": ["00:00:00", { hour: 0, min: 0, sec: 0 }],
  "%x": ["02/03/01", { mon: 2, mday: 3, year: 2001 }],
  "%Y": ["2001", { year: 2001 }],
  "%y": ["01", { year: 2001 }],
  "%Z": ["+00:00", { zone: "+00:00", offset: 0 }],
  "%%": ["%", {}],
  "%C": ["20", {}],
  "%D": ["02/03/01", { mon: 2, mday: 3, year: 2001 }],
  "%F": ["2001-02-03", { year: 2001, mon: 2, mday: 3 }],
  "%G": ["2001", { cwyear: 2001 }],
  "%g": ["01", { cwyear: 2001 }],
  "%h": ["Feb", { mon: 2 }],
  "%k": [" 0", { hour: 0 }],
  "%L": ["000", { secFraction: 0 }],
  "%l": ["12", { hour: 0 }],
  "%N": ["000000000", { secFraction: 0 }],
  "%n": ["\n", {}],
  "%P": ["am", {}],
  "%Q": ["981158400000", { seconds: new Rational(981158400, 1) }],
  "%R": ["00:00", { hour: 0, min: 0 }],
  "%r": ["12:00:00 AM", { hour: 0, min: 0, sec: 0 }],
  "%s": ["981158400", { seconds: 981158400 }],
  "%T": ["00:00:00", { hour: 0, min: 0, sec: 0 }],
  "%t": ["\t", {}],
  "%u": ["6", { cwday: 6 }],
  "%V": ["05", { cweek: 5 }],
  "%v": [" 3-FEB-2001", { mday: 3, mon: 2, year: 2001 }],
  "%z": ["+0000", { zone: "+0000", offset: 0 }],
  "%+": [
    "Sat Feb  3 00:00:00 +00:00 2001",
    { wday: 6, mon: 2, mday: 3, hour: 0, min: 0, sec: 0, zone: "+00:00", offset: 0, year: 2001 },
  ],
};

const STRFTIME_2001_02_03_CVS19: Record<string, [string, Record<string, unknown>]> = {};

const STRFTIME_2001_02_03_GNUext: Record<string, [string, Record<string, unknown>]> = {
  "%:z": ["+00:00", { zone: "+00:00", offset: 0 }],
  "%::z": ["+00:00:00", { zone: "+00:00:00", offset: 0 }],
  "%:::z": ["+00", { zone: "+00", offset: 0 }],
};

Object.assign(STRFTIME_2001_02_03, STRFTIME_2001_02_03_CVS19);
Object.assign(STRFTIME_2001_02_03, STRFTIME_2001_02_03_GNUext);

describe("TestDateStrftime", () => {
  /* eslint-disable vitest/no-conditional-expect -- Ruby's `case f[-1,1] ... when` arms decide the expected value */
  it("strftime", () => {
    const d = new RubyDate(2001, 2, 3);
    for (const [f, s] of Object.entries(STRFTIME_2001_02_03)) {
      expect(d.strftime(f), inspect([f, s])).toEqual(s[0]);
      let f2 = f.replace(/^%/, "%E");
      switch (f.slice(-1)) {
        case "c":
        case "C":
        case "x":
        case "X":
        case "y":
        case "Y":
          expect(d.strftime(f2), inspect([f2, s])).toEqual(s[0]);
          break;
        default:
          expect(d.strftime(f2), inspect([f2, s])).toEqual(f2);
      }
      f2 = f.replace(/^%/, "%O");
      switch (f.slice(-1)) {
        case "d":
        case "e":
        case "H":
        case "k":
        case "I":
        case "l":
        case "m":
        case "M":
        case "S":
        case "u":
        case "U":
        case "V":
        case "w":
        case "W":
        case "y":
          expect(d.strftime(f2), inspect([f2, s])).toEqual(s[0]);
          break;
        default:
          expect(d.strftime(f2), inspect([f2, s])).toEqual(f2);
      }
    }
  });

  /* eslint-enable vitest/no-conditional-expect */

  it("strftime 2", () => {
    let d: RubyDate = new RubyDate(2001, 2, 3);
    expect(d.strftime()).toEqual("2001-02-03");

    d = new RubyDateTime(2001, 2, 3);
    expect(d.strftime()).toEqual("2001-02-03T00:00:00+00:00");

    expect(d.strftime("")).toEqual("");
    expect(d.strftime(" ".repeat(3))).toEqual(" ".repeat(3));
    expect(d.strftime("\tfoo\n\0\r")).toEqual("\tfoo\n\0\r");
    expect(d.strftime("%\n")).toEqual("%\n"); // gnu
    expect(d.strftime("%A".repeat(1024) + ",")).toEqual("Saturday".repeat(1024) + ",");
    expect(d.strftime("%%%")).toEqual("%%");
    expect(d.strftime("Anton von Webern")).toEqual("Anton von Webern");

    d = new RubyDateTime(2001, 2, 3, 1, 2, 3);
    expect(d.strftime()).toEqual("2001-02-03T01:02:03+00:00");
    expect(d.strftime("%p")).toEqual("AM");
    expect(d.strftime("%P")).toEqual("am");
    d = new RubyDateTime(2001, 2, 3, 13, 14, 15);
    expect(d.strftime()).toEqual("2001-02-03T13:14:15+00:00");
    expect(d.strftime("%p")).toEqual("PM");
    expect(d.strftime("%P")).toEqual("pm");
  });

  it("strftime 3 1", { timeout: 30_000 }, () => {
    for (const d of new RubyDate(1970, 1, 1).upto(new RubyDate(2037, 12, 31))) {
      const t = RubyTime.utc(Number(d.year), d.mon, d.day);
      expect(d.strftime("%U")).toEqual(t.strftime("%U"));
      expect(d.strftime("%W")).toEqual(t.strftime("%W"));
    }
  });

  it("strftime 3 2", { timeout: 30_000 }, (ctx) => {
    const s = RubyTime.now().strftime("%G");
    // eslint-disable-next-line vitest/no-conditional-in-test -- Ruby's `omit if`
    if (s.length === 0 || s === "%G") return ctx.skip();
    for (const d of new RubyDate(1970, 1, 1).upto(new RubyDate(2037, 12, 31))) {
      const t = RubyTime.utc(Number(d.year), d.mon, d.day);
      expect(d.strftime("%G")).toEqual(t.strftime("%G"));
      expect(d.strftime("%g")).toEqual(t.strftime("%g"));
      expect(d.strftime("%V")).toEqual(t.strftime("%V"));
      expect(d.strftime("%u")).toEqual(t.strftime("%u"));
    }
  });

  it("strftime 4", () => {
    let s = "2006-08-08T23:15:33.123456789";
    let f = "%FT%T.%N";
    let d = gemDateTimeParse(s);
    expect(d.strftime(f)).toEqual(s);
    d = gemDateTimeStrptime(s, f);
    expect(d.strftime(f)).toEqual(s);

    s = "2006-08-08T23:15:33.123456789";
    f = "%FT%T.%N";
    d = gemDateTimeParse(s + "123456789");
    expect(d.strftime(f)).toEqual(s);
    d = gemDateTimeStrptime(s + "123456789", f);
    expect(d.strftime(f)).toEqual(s);

    let si = "2006-08-08T23:15:33.9";
    let so = "2006-08-08T23:15:33.900000000";
    f = "%FT%T.%N";
    d = gemDateTimeParse(si);
    expect(d.strftime(f)).toEqual(so);
    d = gemDateTimeStrptime(si, f);
    expect(d.strftime(f)).toEqual(so);

    s = "2006-08-08T23:15:33.123";
    f = "%FT%T.%L";
    d = gemDateTimeParse(s);
    expect(d.strftime(f)).toEqual(s);
    d = gemDateTimeStrptime(s, f);
    expect(d.strftime(f)).toEqual(s);

    s = "2006-08-08T23:15:33.123";
    f = "%FT%T.%L";
    d = gemDateTimeParse(s + "123");
    expect(d.strftime(f)).toEqual(s);
    d = gemDateTimeStrptime(s + "123", f);
    expect(d.strftime(f)).toEqual(s);

    si = "2006-08-08T23:15:33.9";
    so = "2006-08-08T23:15:33.900";
    f = "%FT%T.%L";
    d = gemDateTimeParse(si);
    expect(d.strftime(f)).toEqual(so);
    d = gemDateTimeStrptime(si, f);
    expect(d.strftime(f)).toEqual(so);
  });

  it("strftime offset", () => {
    const s = "2006-08-08T23:15:33";
    for (let x = -24; x <= 24; x++) {
      const hh = (x < 0 ? "-" : "+") + String(Math.abs(x)).padStart(2, "0");
      for (const mm of ["00", "30"]) {
        const r = hh + mm;
        if (r.endsWith("2430")) continue;
        const d = gemDateTimeParse(s + hh + mm);
        expect(d.strftime("%z")).toEqual(r);
      }
    }
    for (const r of ["+2430", "-2430"]) {
      assertWarning(/invalid offset/, () => {
        gemDateTimeParse(s + r);
      });
    }
  });

  it("strftime milli", () => {
    let s = "1970-01-01T00:00:00.123456789";
    let d = gemDateTimeParse(s);
    expect(d.strftime("%Q")).toEqual("123");
    s = "1970-01-02T02:03:04.123456789";
    d = gemDateTimeParse(s);
    expect(d.strftime("%Q")).toEqual("93784123");
  });

  it("strftime minus", () => {
    const d = new RubyDateTime(1969, 12, 31, 23, 59, 59);
    expect(d.strftime("%s")).toEqual("-1");
    expect(d.strftime("%Q")).toEqual("-1000");
  });

  it("strftime gnuext", () => {
    // coreutils
    let d = new RubyDateTime(2006, 8, 8, 23, 15, 33, new Rational(9, 24));

    expect(d.strftime("%-Y")).toEqual("2006");
    expect(d.strftime("%-5Y")).toEqual("2006");
    expect(d.strftime("%5Y")).toEqual("02006");
    expect(d.strftime("%_Y")).toEqual("2006");
    expect(d.strftime("%_5Y")).toEqual(" 2006");
    expect(d.strftime("%05Y")).toEqual("02006");

    expect(d.strftime("%-d")).toEqual("8");
    expect(d.strftime("%-3d")).toEqual("8");
    expect(d.strftime("%3d")).toEqual("008");
    expect(d.strftime("%_d")).toEqual(" 8");
    expect(d.strftime("%_3d")).toEqual("  8");
    expect(d.strftime("%03d")).toEqual("008");

    expect(d.strftime("%-e")).toEqual("8");
    expect(d.strftime("%-3e")).toEqual("8");
    expect(d.strftime("%3e")).toEqual("  8");
    expect(d.strftime("%_e")).toEqual(" 8");
    expect(d.strftime("%_3e")).toEqual("  8");
    expect(d.strftime("%03e")).toEqual("008");

    expect(d.strftime("%-10A")).toEqual("Tuesday");
    expect(d.strftime("%10A")).toEqual("   Tuesday");
    expect(d.strftime("%_10A")).toEqual("   Tuesday");
    expect(d.strftime("%010A")).toEqual("000Tuesday");
    expect(d.strftime("%^A")).toEqual("TUESDAY");
    expect(d.strftime("%#A")).toEqual("TUESDAY");

    expect(d.strftime("%-6a")).toEqual("Tue");
    expect(d.strftime("%6a")).toEqual("   Tue");
    expect(d.strftime("%_6a")).toEqual("   Tue");
    expect(d.strftime("%06a")).toEqual("000Tue");
    expect(d.strftime("%^a")).toEqual("TUE");
    expect(d.strftime("%#a")).toEqual("TUE");
    expect(d.strftime("%#6a")).toEqual("   TUE");

    expect(d.strftime("%-10B")).toEqual("August");
    expect(d.strftime("%10B")).toEqual("    August");
    expect(d.strftime("%_10B")).toEqual("    August");
    expect(d.strftime("%010B")).toEqual("0000August");
    expect(d.strftime("%^B")).toEqual("AUGUST");
    expect(d.strftime("%#B")).toEqual("AUGUST");

    expect(d.strftime("%-6b")).toEqual("Aug");
    expect(d.strftime("%6b")).toEqual("   Aug");
    expect(d.strftime("%_6b")).toEqual("   Aug");
    expect(d.strftime("%06b")).toEqual("000Aug");
    expect(d.strftime("%^b")).toEqual("AUG");
    expect(d.strftime("%#b")).toEqual("AUG");
    expect(d.strftime("%#6b")).toEqual("   AUG");

    expect(d.strftime("%-6h")).toEqual("Aug");
    expect(d.strftime("%6h")).toEqual("   Aug");
    expect(d.strftime("%_6h")).toEqual("   Aug");
    expect(d.strftime("%06h")).toEqual("000Aug");
    expect(d.strftime("%^h")).toEqual("AUG");
    expect(d.strftime("%#h")).toEqual("AUG");
    expect(d.strftime("%#6h")).toEqual("   AUG");

    expect(d.strftime("%^p")).toEqual("PM");
    expect(d.strftime("%#p")).toEqual("pm");
    expect(d.strftime("%^P")).toEqual("PM");
    expect(d.strftime("%#P")).toEqual("PM");

    expect(d.strftime("%7z")).toEqual("+000900");
    expect(d.strftime("%_7z")).toEqual("   +900");
    expect(d.strftime("%:z")).toEqual("+09:00");
    expect(d.strftime("%8:z")).toEqual("+0009:00");
    expect(d.strftime("%_8:z")).toEqual("   +9:00");
    expect(d.strftime("%::z")).toEqual("+09:00:00");
    expect(d.strftime("%11::z")).toEqual("+0009:00:00");
    expect(d.strftime("%_11::z")).toEqual("   +9:00:00");
    expect(d.strftime("%:::z")).toEqual("+09");
    expect(d.strftime("%5:::z")).toEqual("+0009");
    expect(d.strftime("%_5:::z")).toEqual("   +9");
    expect(d.strftime("%-:::z")).toEqual("+9");

    d = new RubyDateTime(-200, 8, 8, 23, 15, 33, new Rational(9, 24));

    expect(d.strftime("%Y")).toEqual("-0200");
    expect(d.strftime("%-Y")).toEqual("-200");
    expect(d.strftime("%-5Y")).toEqual("-200");
    expect(d.strftime("%5Y")).toEqual("-0200");
    expect(d.strftime("%_Y")).toEqual(" -200");
    expect(d.strftime("%_5Y")).toEqual(" -200");
    expect(d.strftime("%05Y")).toEqual("-0200");

    d = new RubyDateTime(-2000, 8, 8, 23, 15, 33, new Rational(9, 24));

    expect(d.strftime("%Y")).toEqual("-2000");
    expect(d.strftime("%-Y")).toEqual("-2000");
    expect(d.strftime("%-5Y")).toEqual("-2000");
    expect(d.strftime("%5Y")).toEqual("-2000");
    expect(d.strftime("%_Y")).toEqual("-2000");
    expect(d.strftime("%_5Y")).toEqual("-2000");
    expect(d.strftime("%05Y")).toEqual("-2000");
  });

  it("strftime gnuext LN", () => {
    // coreutils
    const d = gemDateTimeParse("2008-11-25T00:11:22.0123456789");
    expect(d.strftime("%L")).toEqual("012");
    expect(d.strftime("%0L")).toEqual("012");
    expect(d.strftime("%1L")).toEqual("0");
    expect(d.strftime("%2L")).toEqual("01");
    expect(d.strftime("%11L")).toEqual("01234567890");
    expect(d.strftime("%011L")).toEqual("01234567890");
    expect(d.strftime("%_11L")).toEqual("01234567890");
    expect(d.strftime("%N")).toEqual("012345678");
    expect(d.strftime("%0N")).toEqual("012345678");
    expect(d.strftime("%1N")).toEqual("0");
    expect(d.strftime("%2N")).toEqual("01");
    expect(d.strftime("%11N")).toEqual("01234567890");
    expect(d.strftime("%011N")).toEqual("01234567890");
    expect(d.strftime("%_11N")).toEqual("01234567890");
  });

  it("strftime gnuext z", () => {
    // coreutils
    const d = gemDateTimeParse("2006-08-08T23:15:33+09:08:07");
    expect(d.strftime("%z")).toEqual("+0908");
    expect(d.strftime("%:z")).toEqual("+09:08");
    expect(d.strftime("%::z")).toEqual("+09:08:07");
    expect(d.strftime("%:::z")).toEqual("+09:08:07");
  });

  it("strftime gnuext complex", () => {
    const d = gemDateTimeParse("2001-02-03T04:05:06+09:00");
    expect(d.strftime("%-100c")).toEqual("Sat Feb  3 04:05:06 2001");
    expect(d.strftime("%100c")).toEqual("Sat Feb  3 04:05:06 2001".padStart(100));
    expect(d.strftime("%_100c")).toEqual("Sat Feb  3 04:05:06 2001".padStart(100));
    expect(d.strftime("%0100c")).toEqual("Sat Feb  3 04:05:06 2001".padStart(100, "0"));
    expect(d.strftime("%^c")).toEqual("SAT FEB  3 04:05:06 2001");

    expect(d.strftime("%-100+")).toEqual("Sat Feb  3 04:05:06 +09:00 2001");
    expect(d.strftime("%100+")).toEqual("Sat Feb  3 04:05:06 +09:00 2001".padStart(100));
    expect(d.strftime("%_100+")).toEqual("Sat Feb  3 04:05:06 +09:00 2001".padStart(100));
    expect(d.strftime("%0100+")).toEqual("Sat Feb  3 04:05:06 +09:00 2001".padStart(100, "0"));
    expect(d.strftime("%^+")).toEqual("SAT FEB  3 04:05:06 +09:00 2001");
  });

  it("different format", () => {
    let d: RubyDate = new RubyDate(2001, 2, 3);

    expect(d.ctime()).toEqual("Sat Feb  3 00:00:00 2001");
    expect(d.asctime()).toEqual(d.ctime());

    expect(d.iso8601()).toEqual("2001-02-03");
    expect(d.iso8601()).toEqual(d.xmlschema());
    expect(d.rfc3339()).toEqual("2001-02-03T00:00:00+00:00");
    expect(d.rfc2822()).toEqual("Sat, 3 Feb 2001 00:00:00 +0000");
    expect(d.rfc2822()).toEqual(d.rfc822());
    expect(d.httpdate()).toEqual("Sat, 03 Feb 2001 00:00:00 GMT");
    expect(d.jisx0301()).toEqual("H13.02.03");

    d = new RubyDateTime(2001, 2, 3);

    expect(d.ctime()).toEqual("Sat Feb  3 00:00:00 2001");
    expect(d.asctime()).toEqual(d.ctime());

    expect(d.iso8601()).toEqual("2001-02-03T00:00:00+00:00");
    expect(d.iso8601()).toEqual(d.rfc3339());
    expect(d.iso8601()).toEqual(d.xmlschema());
    expect(d.rfc2822()).toEqual("Sat, 3 Feb 2001 00:00:00 +0000");
    expect(d.rfc2822()).toEqual(d.rfc822());
    expect(d.httpdate()).toEqual("Sat, 03 Feb 2001 00:00:00 GMT");
    expect(d.jisx0301()).toEqual("H13.02.03T00:00:00+00:00");

    const d2 = gemDateTimeParse("2001-02-03T04:05:06.123456");
    expect(d2.iso8601(3)).toEqual("2001-02-03T04:05:06.123+00:00");
    expect(d2.rfc3339(3)).toEqual("2001-02-03T04:05:06.123+00:00");
    expect(d2.jisx0301(3)).toEqual("H13.02.03T04:05:06.123+00:00");
    expect(d2.iso8601(3.5)).toEqual("2001-02-03T04:05:06.123+00:00");
    expect(d2.rfc3339(3.5)).toEqual("2001-02-03T04:05:06.123+00:00");
    expect(d2.jisx0301(3.5)).toEqual("H13.02.03T04:05:06.123+00:00");
    expect(d2.iso8601(9)).toEqual("2001-02-03T04:05:06.123456000+00:00");
    expect(d2.rfc3339(9)).toEqual("2001-02-03T04:05:06.123456000+00:00");
    expect(d2.jisx0301(9)).toEqual("H13.02.03T04:05:06.123456000+00:00");
    expect(d2.iso8601(9.9)).toEqual("2001-02-03T04:05:06.123456000+00:00");
    expect(d2.rfc3339(9.9)).toEqual("2001-02-03T04:05:06.123456000+00:00");
    expect(d2.jisx0301(9.9)).toEqual("H13.02.03T04:05:06.123456000+00:00");

    expect(new RubyDateTime(1800).jisx0301()).toEqual("1800-01-01T00:00:00+00:00");

    expect(gemDateParse("1868-01-25").jisx0301()).toEqual("1868-01-25");
    expect(gemDateParse("1872-12-31").jisx0301()).toEqual("1872-12-31");

    expect(gemDateParse("1873-01-01").jisx0301()).toEqual("M06.01.01");
    expect(gemDateParse("1912-07-29").jisx0301()).toEqual("M45.07.29");
    expect(gemDateParse("1912-07-30").jisx0301()).toEqual("T01.07.30");
    expect(gemDateParse("1926-12-24").jisx0301()).toEqual("T15.12.24");
    expect(gemDateParse("1926-12-25").jisx0301()).toEqual("S01.12.25");
    expect(gemDateParse("1989-01-07").jisx0301()).toEqual("S64.01.07");
    expect(gemDateParse("1989-01-08").jisx0301()).toEqual("H01.01.08");
    expect(gemDateParse("2006-09-01").jisx0301()).toEqual("H18.09.01");
    expect(gemDateParse("2019-04-30").jisx0301()).toEqual("H31.04.30");
    expect(gemDateParse("2019-05-01").jisx0301()).toEqual("R01.05.01");

    expect(
      RubyDateTime.iso8601("2001-02-03T04:05:06.123456+00:00", RubyDate.ITALY, { limit: 64 }),
    ).toEqual(d2.toDatetime());
    expect(
      RubyDateTime.rfc3339("2001-02-03T04:05:06.123456+00:00", RubyDate.ITALY, { limit: 64 }),
    ).toEqual(d2.toDatetime());
    expect(
      RubyDateTime.jisx0301("H13.02.03T04:05:06.123456+00:00", RubyDate.ITALY, { limit: 64 }),
    ).toEqual(d2.toDatetime());

    const exceeds = /string length \(\d+\) exceeds/;
    expect(() =>
      RubyDateTime.iso8601("2001-02-03T04:05:06.123456+00:00", RubyDate.ITALY, { limit: 1 }),
    ).toThrow(exceeds);
    expect(() =>
      RubyDateTime.rfc3339("2001-02-03T04:05:06.123456+00:00", RubyDate.ITALY, { limit: 1 }),
    ).toThrow(exceeds);
    expect(() =>
      RubyDateTime.jisx0301("H13.02.03T04:05:06.123456+00:00", RubyDate.ITALY, { limit: 1 }),
    ).toThrow(exceeds);

    for (const s of [
      "M06.01.01",
      "M45.07.29",
      "T01.07.30",
      "T15.12.24",
      "S01.12.25",
      "S64.01.07",
      "H01.01.08",
      "H18.09.01",
      "H31.04.30",
      "R01.05.01",
    ]) {
      expect(gemDateParse(s).jisx0301()).toEqual(s);
    }
  });

  it("overflow", () => {
    // `assert_raise(ArgumentError, Errno::ERANGE)` names two acceptable
    // classes, and `date_strftime_alloc` raises the second
    // (`date_core.c:1780` → `rb_syserr_fail`); vitest's `toThrow` takes one
    // class, so the raise is asserted without naming either.
    expect(() => new RubyDate(2000, 1, 1).strftime("%2147483647c")).toThrow();
    expect(() => new RubyDateTime(2000, 1, 1).strftime("%2147483647c")).toThrow();
  });
});

/** Ruby's `Object#inspect` over the message argument, whose Rationals hold BigInts. */
function inspect(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? String(v) : v));
}
