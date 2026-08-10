/**
 * Port of ruby/date's `test/date/test_date_strptime.rb`, lines 70-305 — the
 * low-level `Date._strptime` frags API: the directive table, the width
 * prefixes, and the arms that fail.
 *
 * `test__strptime__3` — the iso8601 / ctime / date(1) / rfc822 table at
 * `:120-215` — is the one test of that range not here: it is ~145 lines on its
 * own and the four below already put this PR at the LOC ceiling. It is filed
 * against RFC 0088 as its own story.
 *
 * `_strptime` answers the frag Hash itself rather than a date, so RFC 0088's
 * `Temporal`-by-default mapping does not reach these tests — the values below
 * are the ones `date__strptime` (`date_strptime.c:159-663`) writes, under the
 * camelCased key names `DateParts` gives them (`:sec_fraction` is
 * `secFraction`, `:cwyear` is `cwyear`). Two values are trails' own spelling of
 * a Ruby Integer/Rational: `%s` answers a `bigint`, because MRI's is a Bignum
 * of arbitrary precision (`date_strptime.c:415-426`), and `%Q` a `Rational`
 * over 1000 (`date_strptime.c:428-442`).
 *
 * Ruby's `assert_equal(s[1], Date._strptime(...))` compares a Hash whose absent
 * keys are absent; `toEqual` treats an absent key and an `undefined` one alike,
 * which is the same question.
 *
 * `test__strptime` asserts inside two `case f[-1,1]` branches — the `%E` and
 * `%O` prefixes are accepted for some directives and rejected for the rest, and
 * which arm a directive takes is what the test is about — so the assertions sit
 * inside a `switch` in the Ruby too, hence the `no-conditional-expect` disable
 * below. Splitting the walk into two tests would rename them.
 */

/* eslint-disable vitest/no-conditional-expect */

import { describe, it, expect } from "vitest";
import { Date, DateTime, Rational } from "./date.js";
import type { DateParts } from "./date.js";

const STRFTIME_2001_02_03: Record<string, [string, DateParts]> = {
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
  "%L": ["000", { secFraction: new Rational(0n, 1000n) }],
  "%l": ["12", { hour: 0 }],
  "%N": ["000000000", { secFraction: new Rational(0n, 1000000000n) }],
  "%n": ["\n", {}],
  "%P": ["am", {}],
  "%Q": ["981158400000", { seconds: new Rational(981158400000n, 1000n) }],
  "%R": ["00:00", { hour: 0, min: 0 }],
  "%r": ["12:00:00 AM", { hour: 0, min: 0, sec: 0 }],
  "%s": ["981158400", { seconds: 981158400n }],
  "%T": ["00:00:00", { hour: 0, min: 0, sec: 0 }],
  "%t": ["\t", {}],
  "%u": ["6", { cwday: 6 }],
  "%V": ["05", { cweek: 5 }],
  "%v": [" 3-Feb-2001", { mday: 3, mon: 2, year: 2001 }],
  "%z": ["+0000", { zone: "+0000", offset: 0 }],
  "%+": [
    "Sat Feb  3 00:00:00 +00:00 2001",
    { wday: 6, mon: 2, mday: 3, hour: 0, min: 0, sec: 0, zone: "+00:00", offset: 0, year: 2001 },
  ],
};

const STRFTIME_2001_02_03_CVS19: Record<string, [string, DateParts]> = {};

const STRFTIME_2001_02_03_GNUext: Record<string, [string, DateParts]> = {
  "%:z": ["+00:00", { zone: "+00:00", offset: 0 }],
  "%::z": ["+00:00:00", { zone: "+00:00:00", offset: 0 }],
  "%:::z": ["+00", { zone: "+00", offset: 0 }],
};

Object.assign(STRFTIME_2001_02_03, STRFTIME_2001_02_03_CVS19);
Object.assign(STRFTIME_2001_02_03, STRFTIME_2001_02_03_GNUext);

/** Ruby's `h.values_at(:year, :mon, …)`, whose answer is `nil` for a key the
 *  Hash does not carry. */
function valuesAt(h: DateParts | null, ...keys: (keyof DateParts)[]): unknown[] {
  return keys.map((key) => (h?.[key] === undefined ? null : h[key]));
}

describe("TestDateStrptime", () => {
  it(" strptime", () => {
    for (const [f, s] of Object.entries(STRFTIME_2001_02_03)) {
      if ((f === "%I" && s[0] === "12") || (f === "%l" && s[0] === "12")) {
        // hour w/o merid
        s[1].hour = 12;
      }
      expect(Date._strptime(s[0], f)).toEqual(s[1]);
      let f2 = f.replace(/^%/, "%E");
      switch (f.slice(-1)) {
        case "c":
        case "C":
        case "x":
        case "X":
        case "y":
        case "Y":
          expect(Date._strptime(s[0], f2)).toEqual(s[1]);
          break;
        default:
          expect(Date._strptime(s[0], f2)).toEqual(null);
          expect(Date._strptime(f2, f2)).toEqual({});
      }
      f2 = f.replace(/^%/, "%O");
      switch (f.slice(-1)) {
        case "d":
        case "e":
        case "H":
        case "I":
        case "m":
        case "M":
        case "S":
        case "u":
        case "U":
        case "V":
        case "w":
        case "W":
        case "y":
          expect(Date._strptime(s[0], f2)).toEqual(s[1]);
          break;
        default:
          expect(Date._strptime(s[0], f2)).toEqual(null);
          expect(Date._strptime(f2, f2)).toEqual({});
      }
    }
  });

  it(" strptime  2", () => {
    let h = Date._strptime("2001-02-03");
    expect(valuesAt(h, "year", "mon", "mday")).toEqual([2001, 2, 3]);

    h = DateTime._strptime("2001-02-03T12:13:14Z");
    expect(valuesAt(h, "year", "mon", "mday", "hour", "min", "sec")).toEqual([
      2001, 2, 3, 12, 13, 14,
    ]);

    expect(Date._strptime("", "")).toEqual({});
    expect(Date._strptime(" ".repeat(3), "")).toEqual({ leftover: " ".repeat(3) });
    expect(Date._strptime("\nx", "\n")).toEqual({ leftover: "x" });
    expect(Date._strptime("", " ".repeat(3))).toEqual({});
    expect(Date._strptime(" ".repeat(3), " ".repeat(3))).toEqual({});
    expect(Date._strptime("\tfoo\n\0\r", "\tfoo\n\0\r")).toEqual({});
    expect(Date._strptime("foo\n\nbar", "foo bar")).toEqual({});
    expect(Date._strptime("%\n", "%\n")).toEqual({}); // gnu
    expect(Date._strptime("%%", "%%%")).toEqual({});
    expect(Date._strptime("Saturday".repeat(1024) + ",", "%A".repeat(1024) + ",")).toEqual({
      wday: 6,
    });
    expect(Date._strptime("Saturday".repeat(1024) + ",", "%a".repeat(1024) + ",")).toEqual({
      wday: 6,
    });
    expect(Date._strptime("Anton von Webern", "Anton von Webern")).toEqual({});
  });

  it(" strptime  width", () => {
    const table: [[string, string], unknown[]][] = [
      [
        ["99", "%y"],
        [1999, null, null, null, null, null, null, null, null],
      ],
      [
        ["01", "%y"],
        [2001, null, null, null, null, null, null, null, null],
      ],
      [
        ["19 99", "%C %y"],
        [1999, null, null, null, null, null, null, null, null],
      ],
      [
        ["20 01", "%C %y"],
        [2001, null, null, null, null, null, null, null, null],
      ],
      [
        ["30 99", "%C %y"],
        [3099, null, null, null, null, null, null, null, null],
      ],
      [
        ["30 01", "%C %y"],
        [3001, null, null, null, null, null, null, null, null],
      ],
      [
        ["1999", "%C%y"],
        [1999, null, null, null, null, null, null, null, null],
      ],
      [
        ["2001", "%C%y"],
        [2001, null, null, null, null, null, null, null, null],
      ],
      [
        ["3099", "%C%y"],
        [3099, null, null, null, null, null, null, null, null],
      ],
      [
        ["3001", "%C%y"],
        [3001, null, null, null, null, null, null, null, null],
      ],

      [
        ["20060806", "%Y"],
        [20060806, null, null, null, null, null, null, null, null],
      ],
      [
        ["20060806", "%Y "],
        [20060806, null, null, null, null, null, null, null, null],
      ],
      [
        ["20060806", "%Y%m%d"],
        [2006, 8, 6, null, null, null, null, null, null],
      ],
      [
        ["2006908906", "%Y9%m9%d"],
        [2006, 8, 6, null, null, null, null, null, null],
      ],
      [
        ["12006 08 06", "%Y %m %d"],
        [12006, 8, 6, null, null, null, null, null, null],
      ],
      [
        ["12006-08-06", "%Y-%m-%d"],
        [12006, 8, 6, null, null, null, null, null, null],
      ],
      [
        ["200608 6", "%Y%m%e"],
        [2006, 8, 6, null, null, null, null, null, null],
      ],

      [
        ["2006333", "%Y%j"],
        [2006, -1, 333, null, null, null, null, null, null],
      ],
      [
        ["20069333", "%Y9%j"],
        [2006, -1, 333, null, null, null, null, null, null],
      ],
      [
        ["12006 333", "%Y %j"],
        [12006, -1, 333, null, null, null, null, null, null],
      ],
      [
        ["12006-333", "%Y-%j"],
        [12006, -1, 333, null, null, null, null, null, null],
      ],

      [
        ["232425", "%H%M%S"],
        [null, null, null, 23, 24, 25, null, null, null],
      ],
      [
        ["23924925", "%H9%M9%S"],
        [null, null, null, 23, 24, 25, null, null, null],
      ],
      [
        ["23 24 25", "%H %M %S"],
        [null, null, null, 23, 24, 25, null, null, null],
      ],
      [
        ["23:24:25", "%H:%M:%S"],
        [null, null, null, 23, 24, 25, null, null, null],
      ],
      [
        [" 32425", "%k%M%S"],
        [null, null, null, 3, 24, 25, null, null, null],
      ],
      [
        [" 32425", "%l%M%S"],
        [null, null, null, 3, 24, 25, null, null, null],
      ],

      [
        ["FriAug", "%a%b"],
        [null, 8, null, null, null, null, null, null, 5],
      ],
      [
        ["FriAug", "%A%B"],
        [null, 8, null, null, null, null, null, null, 5],
      ],
      [
        ["FridayAugust", "%A%B"],
        [null, 8, null, null, null, null, null, null, 5],
      ],
      [
        ["FridayAugust", "%a%b"],
        [null, 8, null, null, null, null, null, null, 5],
      ],
    ];
    for (const [x, y] of table) {
      const h = Date._strptime(...x);
      const a = valuesAt(h, "year", "mon", "mday", "hour", "min", "sec", "zone", "offset", "wday");
      if (y[1] === -1) {
        a[1] = -1;
        a[2] = h?.yday;
      }
      expect(a).toEqual(y);
    }
  });

  it(" strptime  fail", () => {
    expect(Date._strptime("2001.", "%Y.")).not.toBeNull();
    expect(Date._strptime("2001. ", "%Y.")).not.toBeNull();
    expect(Date._strptime("2001.", "%Y. ")).not.toBeNull();
    expect(Date._strptime("2001. ", "%Y. ")).not.toBeNull();

    expect(Date._strptime("2001", "%Y.")).toBeNull();
    expect(Date._strptime("2001 ", "%Y.")).toBeNull();
    expect(Date._strptime("2001", "%Y. ")).toBeNull();
    expect(Date._strptime("2001 ", "%Y. ")).toBeNull();

    expect(Date._strptime("2001-13-31", "%Y-%m-%d")).toBeNull();
    expect(Date._strptime("2001-12-00", "%Y-%m-%d")).toBeNull();
    expect(Date._strptime("2001-12-32", "%Y-%m-%d")).toBeNull();
    expect(Date._strptime("2001-12-00", "%Y-%m-%e")).toBeNull();
    expect(Date._strptime("2001-12-32", "%Y-%m-%e")).toBeNull();
    expect(Date._strptime("2001-12-31", "%y-%m-%d")).toBeNull();

    expect(Date._strptime("2004-000", "%Y-%j")).toBeNull();
    expect(Date._strptime("2004-367", "%Y-%j")).toBeNull();
    expect(Date._strptime("2004-366", "%y-%j")).toBeNull();

    expect(Date._strptime("24:59:59", "%H:%M:%S")).not.toBeNull();
    expect(Date._strptime("24:59:59", "%k:%M:%S")).not.toBeNull();
    expect(Date._strptime("24:59:60", "%H:%M:%S")).not.toBeNull();
    expect(Date._strptime("24:59:60", "%k:%M:%S")).not.toBeNull();

    expect(Date._strptime("24:60:59", "%H:%M:%S")).toBeNull();
    expect(Date._strptime("24:60:59", "%k:%M:%S")).toBeNull();
    expect(Date._strptime("24:59:61", "%H:%M:%S")).toBeNull();
    expect(Date._strptime("24:59:61", "%k:%M:%S")).toBeNull();
    expect(Date._strptime("00:59:59", "%I:%M:%S")).toBeNull();
    expect(Date._strptime("13:59:59", "%I:%M:%S")).toBeNull();
    expect(Date._strptime("00:59:59", "%l:%M:%S")).toBeNull();
    expect(Date._strptime("13:59:59", "%l:%M:%S")).toBeNull();

    expect(Date._strptime("0", "%U")).not.toBeNull();
    expect(Date._strptime("54", "%U")).toBeNull();
    expect(Date._strptime("0", "%W")).not.toBeNull();
    expect(Date._strptime("54", "%W")).toBeNull();
    expect(Date._strptime("0", "%V")).toBeNull();
    expect(Date._strptime("54", "%V")).toBeNull();
    expect(Date._strptime("0", "%u")).toBeNull();
    expect(Date._strptime("7", "%u")).not.toBeNull();
    expect(Date._strptime("0", "%w")).not.toBeNull();
    expect(Date._strptime("7", "%w")).toBeNull();

    expect(Date._strptime("Sanday", "%A")).toBeNull();
    expect(Date._strptime("Jenuary", "%B")).toBeNull();
    expect(Date._strptime("Sundai", "%A")).not.toBeNull();
    expect(Date._strptime("Januari", "%B")).not.toBeNull();
    expect(Date._strptime("Sundai,", "%A,")).toBeNull();
    expect(Date._strptime("Januari,", "%B,")).toBeNull();

    expect(Date._strptime("+24:00", "%Z")?.offset).toBeNull();
    expect(Date._strptime("+23:60", "%Z")?.offset).toBeNull();
    expect(Date._strptime("+23:00:60", "%Z")?.offset).toBeNull();
    expect(Date._strptime("+23:00:60", "%Z")?.offset).toBeNull();
  });
});
