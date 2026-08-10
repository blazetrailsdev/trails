/**
 * Port of ruby/date's `test/date/test_date_strftime.rb`, the standard
 * directive set (`:70-215`, through `test_strftime__minus`).
 *
 * The gem's statics answer `Temporal` under RFC 0088, so where Ruby writes
 * `DateTime.parse(s)` and then calls `#strftime` on the result, this file goes
 * through the exported `dtNewByFrags`/`dNewByFrags` builders those statics
 * themselves call — the gem-shaped object that carries `strftime`.
 *
 * `test_strftime__offset`'s `assert_warning(/invalid offset/)` arm asserts the
 * *effect* rather than the warning: `rb_warning("invalid offset is ignored")`
 * (`date_core.c:8304`) is `$VERBOSE`-only and has no port analogue — the same
 * position `date.ts` already records for `val2sg` and `val2off`. The offset
 * itself is still dropped to `0` (`date_core.c:8301-8305`), which is what the
 * assertion reads.
 */

import { Temporal } from "@js-temporal/polyfill";
import { describe, it, expect } from "vitest";
import { Date as RubyDate, DateTime as RubyDateTime, Rational, dtNewByFrags } from "./date.js";
import { Time as RubyTime } from "./time.js";

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

  it("strftime 3 1", { timeout: 120_000 }, () => {
    for (const d of dateRange(new RubyDate(1970, 1, 1), new RubyDate(2037, 12, 31))) {
      const t = RubyTime.utc(Number(d.year), d.mon, d.day);
      expect(d.strftime("%U")).toEqual(t.strftime("%U"));
      expect(d.strftime("%W")).toEqual(t.strftime("%W"));
    }
  });

  it("strftime 3 2", { timeout: 120_000 }, (ctx) => {
    const s = RubyTime.now().strftime("%G");
    // eslint-disable-next-line vitest/no-conditional-in-test -- Ruby's `omit if`
    if (s.length === 0 || s === "%G") return ctx.skip();
    for (const d of dateRange(new RubyDate(1970, 1, 1), new RubyDate(2037, 12, 31))) {
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
      expect(gemDateTimeParse(s + r).zone).toEqual("+00:00");
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
});

/** Ruby's `Object#inspect` over the message argument, whose Rationals hold BigInts. */
function inspect(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? String(v) : v));
}

/**
 * Ruby's `(Date.new(1970,1,1)..Date.new(2037,12,31)).each`, whose `Range#each`
 * walks by `Date#succ` (`date_core.c` `d_lite_next_day` over `d_lite_plus`).
 * Neither `#succ` nor `#+` is ported yet — they belong to
 * 0088-date-gem-port/port-test-date-arith-operators — so the walk goes through
 * `Temporal.PlainDate#add` and rebuilds the gem object per day.
 */
function* dateRange(from: RubyDate, to: RubyDate): Generator<RubyDate> {
  const last = to.toDate();
  for (
    let pd = from.toDate();
    Temporal.PlainDate.compare(pd, last) <= 0;
    pd = pd.add({ days: 1 })
  ) {
    yield new RubyDate(pd.year, pd.month, pd.day);
  }
}
