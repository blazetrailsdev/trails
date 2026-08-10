/**
 * Port of ruby/date's `test/date/test_date.rb`.
 *
 * `test_range_infinite_float`, `test_sub`, `test_eql_p`, `test_hash` and
 * `test_submillisecond_comparison` are not here yet: each needs gem surface
 * RFC 0088 has not ported (`Date::Infinity`, `#+`/`#-`/`#>>`/`#<<`/`#succ`,
 * `Marshal`, `#<=>`/`#eql?`/`#hash`), so they are filed against 0088 rather
 * than stubbed here.
 */

import { describe, it, expect } from "vitest";
import { Date as RubyDate, DateTime as RubyDateTime, Rational, dtNewByFrags } from "./date.js";

describe("TestDate", () => {
  it("const", () => {
    expect(RubyDate.MONTHNAMES[0]).toBeNull();
    expect(RubyDate.MONTHNAMES[1]).toEqual("January");
    expect(RubyDate.MONTHNAMES.length).toEqual(13);
    expect(RubyDate.DAYNAMES[0]).toEqual("Sunday");
    expect(RubyDate.DAYNAMES.length).toEqual(7);

    expect(RubyDate.ABBR_MONTHNAMES[0]).toBeNull();
    expect(RubyDate.ABBR_MONTHNAMES[1]).toEqual("Jan");
    expect(RubyDate.ABBR_MONTHNAMES.length).toEqual(13);
    expect(RubyDate.ABBR_DAYNAMES[0]).toEqual("Sun");
    expect(RubyDate.ABBR_DAYNAMES.length).toEqual(7);

    expect(Object.isFrozen(RubyDate.MONTHNAMES)).toEqual(true);
    expect(Object.isFrozen(RubyDate.DAYNAMES)).toEqual(true);

    expect(Object.isFrozen(RubyDate.ABBR_MONTHNAMES)).toEqual(true);
    expect(Object.isFrozen(RubyDate.ABBR_DAYNAMES)).toEqual(true);
  });

  it("freeze", () => {
    const d = new RubyDate();
    Object.freeze(d);
    expect(Object.isFrozen(d)).toEqual(true);
    expect(Number.isInteger(d.yday)).toEqual(true);
    expect(typeof d.toS()).toEqual("string");
  });

  it("deconstruct keys", () => {
    const d = new RubyDate(1999, 5, 23);
    expect(d.deconstructKeys(null)).toEqual({ year: 1999, month: 5, day: 23, wday: 0, yday: 143 });
    expect(d.deconstructKeys(["year", "century"])).toEqual({ year: 1999 });
    expect(d.deconstructKeys(["year", "month", "day", "wday", "yday"])).toEqual({
      year: 1999,
      month: 5,
      day: 23,
      wday: 0,
      yday: 143,
    });

    const dt = new RubyDateTime(1999, 5, 23, 4, 20, new Rational(1, 10000));

    expect(dt.deconstructKeys(null)).toEqual({
      year: 1999,
      month: 5,
      day: 23,
      wday: 0,
      yday: 143,
      hour: 4,
      min: 20,
      sec: 0,
      sec_fraction: new Rational(1, 10000),
      zone: "+00:00",
    });

    expect(dt.deconstructKeys(["year", "century"])).toEqual({ year: 1999 });

    expect(
      dt.deconstructKeys([
        "year",
        "month",
        "day",
        "wday",
        "yday",
        "hour",
        "min",
        "sec",
        "sec_fraction",
        "zone",
      ]),
    ).toEqual({
      year: 1999,
      month: 5,
      day: 23,
      wday: 0,
      yday: 143,
      hour: 4,
      min: 20,
      sec: 0,
      sec_fraction: new Rational(1, 10000),
      zone: "+00:00",
    });

    const dtz = dtNewByFrags(RubyDate._parse("3rd Feb 2001 04:05:06+03:30"));
    expect(dtz.deconstructKeys(["zone"])).toEqual({ zone: "+03:30" });
  });
});
