/**
 * trails-only coverage for `./time.ts`, the `::Time` duck type. The gem has no
 * test of its own for Ruby core `::Time`, so these assert the two constructors
 * against MRI's documented behaviour: `Time.utc` is UTC, `Time.new` is local,
 * and `%z`/`%Z` answer the receiver's zone rather than a constant.
 */

import { Temporal } from "@js-temporal/polyfill";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArgumentError, Rational } from "./date.js";
import { Time } from "./time.js";

describe("Time", () => {
  it("Time.utc builds a UTC time", () => {
    const time = Time.utc(2008, 3, 1, 6, 0, 0);
    expect(time.zone).toBe("UTC");
    expect(time.strftime("%Y-%m-%d %H:%M:%S %z %Z")).toBe("2008-03-01 06:00:00 +0000 UTC");
  });

  it("Time.at builds a local time from the seconds since the Epoch", () => {
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("UTC");
    expect(Time.at(946684800).strftime("%Y-%m-%d %H:%M:%S %z")).toBe("2000-01-01 00:00:00 +0000");
    expect(Time.at(Number("946684800.123456789")).nsec).toBe(123456835);
    expect(Time.at(946684800, 123456.789).nsec).toBe(123456789);
    expect(Time.at(new Rational(1, 3)).nsec).toBe(333333333);
    expect(Time.at(-0.5).nsec).toBe(500000000);
    expect(Time.at(-0.5).strftime("%Y-%m-%d %H:%M:%S")).toBe("1969-12-31 23:59:59");
  });

  it("Time.new builds a time at the given offset", () => {
    const time = new Time(2008, 3, 1, 6, 0, 0, "-05:00");
    expect(time.hour).toBe(6);
    expect(time.utcOffset).toBe(-5 * 3600);
    // MRI answers no abbreviation for an offset-built time, so `%Z` is empty.
    expect(time.zone).toBeNull();
    expect(time.strftime("%Y-%m-%d %H:%M:%S %z %Z")).toBe("2008-03-01 06:00:00 -0500 ");
  });

  it("Time.new takes an offset in seconds, as Rails passes", () => {
    expect(new Time(2008, 3, 1, 6, 0, 0, 3600).utcOffset).toBe(3600);
    expect(new Time(2008, 3, 1, 6, 0, 0, 0).strftime("%z %Z")).toBe("+0000 ");
    expect(new Time(2008, 3, 1, 6, 0, 0, -19800).strftime("%z")).toBe("-0530");
  });

  it("Time.new takes the compact and hour-only offset spellings", () => {
    expect(new Time(2008, 3, 1, 6, 0, 0, "+0930").strftime("%z")).toBe("+0930");
    expect(new Time(2008, 3, 1, 6, 0, 0, "+09").strftime("%z")).toBe("+0900");
  });

  it("spells the offset four ways, one per leading colon", () => {
    const at = (offset: number) =>
      new Time(2008, 3, 1, 6, 0, 0, offset).strftime("%z|%:z|%::z|%:::z");
    expect(at(32400)).toBe("+0900|+09:00|+09:00:00|+09");
    expect(at(19800)).toBe("+0530|+05:30|+05:30:00|+05:30");
    expect(at(30)).toBe("+0000|+00:00|+00:00:30|+00:00:30");
    expect(at(-1800)).toBe("-0030|-00:30|-00:30:00|-00:30");
    expect(at(0)).toBe("+0000|+00:00|+00:00:00|+00");
  });

  it("Time.new takes a military zone letter", () => {
    expect(new Time(2008, 3, 1, 6, 0, 0, "K").utcOffset).toBe(10 * 3600);
    expect(new Time(2008, 3, 1, 6, 0, 0, "Y").utcOffset).toBe(-12 * 3600);
    expect(new Time(2008, 3, 1, 6, 0, 0, "K").strftime("%z %Z")).toBe("+1000 ");
    // MRI treats `"Z"` as UTC itself, so it keeps a zone where an offset does not.
    expect(new Time(2008, 3, 1, 6, 0, 0, "Z").strftime("%z %Z")).toBe("+0000 UTC");
  });

  it("Time.new takes a sub-minute offset, as MRI does", () => {
    expect(new Time(2008, 3, 1, 6, 0, 0, "+09:00:30").utcOffset).toBe(32430);
    expect(new Time(2008, 3, 1, 6, 0, 0, "+090030").utcOffset).toBe(32430);
    expect(new Time(2008, 3, 1, 6, 0, 0, 32430).utcOffset).toBe(32430);
    expect(new Time(2008, 3, 1, 6, 0, 0, -32430).utcOffset).toBe(-32430);
    expect(new Time(2008, 3, 1, 6, 0, 0, "+09:00:30").strftime("%z")).toBe("+0900");
    expect(new Time(2008, 3, 1, 6, 0, 0, -32430).strftime("%z")).toBe("-0900");
    expect(new Time(2008, 3, 1, 6, 0, 0, 32430.5).utcOffset).toBe(32430.5);
  });

  it("Time.new rejects an out-of-range offset", () => {
    expect(() => new Time(2008, 3, 1, 6, 0, 0, 86400)).toThrow(ArgumentError);
    expect(() => new Time(2008, 3, 1, 6, 0, 0, -86400)).toThrow(ArgumentError);
    expect(new Time(2008, 3, 1, 6, 0, 0, 86399).utcOffset).toBe(86399);
    expect(() => new Time(2008, 3, 1, 6, 0, 0, "+24:00:00")).toThrow(ArgumentError);
  });

  it("Time.new rejects a minute past 59 as a malformed offset", () => {
    expect(() => new Time(2008, 3, 1, 6, 0, 0, "+00:60:00")).toThrow(/expected for utc_offset/);
    expect(() => new Time(2008, 3, 1, 6, 0, 0, "+006000")).toThrow(/expected for utc_offset/);
    expect(new Time(2008, 3, 1, 6, 0, 0, "+00:00:99").utcOffset).toBe(99);
  });

  it("Time.new rejects a zone name", () => {
    expect(() => new Time(2008, 3, 1, 6, 0, 0, "America/New_York")).toThrow(ArgumentError);
  });

  it("Time.new defaults to the local zone", () => {
    const time = new Time(2008, 3, 1, 6, 0, 0);
    const local = new Temporal.PlainDateTime(2008, 3, 1, 6, 0, 0).toZonedDateTime(
      Temporal.Now.timeZoneId(),
    );
    expect(time.utcOffset).toBe(Number(local.offsetNanoseconds) / 1_000_000_000);
    expect(time.strftime("%z")).toBe(local.offset.replace(":", ""));
  });

  // Every expectation below was read off a live `ruby -e`, e.g.
  // `Time.utc(2008, 3, 1, 6, 0, 0.3).nsec # => 299999999`.
  it("Time.utc keeps a fractional second", () => {
    const time = Time.utc(2008, 3, 1, 6, 0, 0.5);
    expect(time.sec).toBe(0);
    expect(time.nsec).toBe(500000000);
    expect(time.usec).toBe(500000);
    expect(time.subsec).toBe(0.5);
    expect(time.strftime("%S")).toBe("00");
    expect(time.strftime("%N")).toBe("500000000");
    expect(time.strftime("%L")).toBe("500");
  });

  it("Time.new keeps a fractional second", () => {
    const time = new Time(2008, 3, 1, 6, 0, 1.123456789, "UTC");
    expect(time.sec).toBe(1);
    expect(time.nsec).toBe(123456789);
    expect(time.usec).toBe(123456);
  });

  it("a fractional second truncates at nanoseconds, from the exact double", () => {
    expect(Time.utc(2008, 3, 1, 6, 0, 0.3).nsec).toBe(299999999);
    expect(Time.utc(2008, 3, 1, 6, 0, 0.1).nsec).toBe(100000000);
    expect(Time.utc(2008, 3, 1, 6, 0, 59.9999999999).nsec).toBe(999999999);
    expect(Time.utc(2008, 3, 1, 6, 0, 2.000000001).nsec).toBe(1);
    expect(Time.utc(2008, 3, 1, 6, 0, 30.987654321).nsec).toBe(987654321);
    expect(Time.utc(2008, 3, 1, 6, 0, 7.456789).nsec).toBe(456788999);
  });

  it("the usec positional is exact, matching the Rational spelling", () => {
    // ruby 3.3.11:
    //   Time.utc(2005, 2, 27, 23, 50, 19, 275038).nsec  #=> 275038000
    expect(Time.utc(2005, 2, 27, 23, 50, 19, 275038).toTime().epochNanoseconds).toBe(
      Time.utc(2005, 2, 27, 23, 50, new Rational(19275038, 1000000)).toTime().epochNanoseconds,
    );
    expect(Time.utc(2005, 2, 27, 23, 50, 19, 275038).nsec).toBe(275038000);
    expect(Time.mktime(2005, 2, 27, 23, 50, 19, 275038).toTime().epochNanoseconds).toBe(
      Time.mktime(2005, 2, 27, 23, 50, new Rational(19275038, 1000000)).toTime().epochNanoseconds,
    );
  });

  it("a usec positional truncates sec to a whole second, as MRI's does", () => {
    // ruby 3.3.11:
    //   Time.utc(2008, 3, 1, 6, 0, 0.3, 5).nsec                #=> 5000
    //   Time.utc(2008, 3, 1, 6, 0, 0.3, 0.5).nsec              #=> 500
    //   Time.utc(2008, 3, 1, 6, 0, Rational(1, 3), 0).nsec     #=> 0
    //   Time.utc(2008, 3, 1, 6, 0, 0.3).nsec                   #=> 299999999
    expect(Time.utc(2008, 3, 1, 6, 0, 0.3, 5).nsec).toBe(5000);
    expect(Time.utc(2008, 3, 1, 6, 0, 0.3, 0.5).nsec).toBe(500);
    expect(Time.utc(2008, 3, 1, 6, 0, new Rational(1, 3), 0).nsec).toBe(0);
    expect(Time.utc(2008, 3, 1, 6, 0, 0.3).nsec).toBe(299999999);
  });

  it("Time.new takes a Rational second, as MRI's does", () => {
    // ruby 3.3.11:
    //   Time.new(2008, 3, 1, 6, 0, Rational(1, 3)).nsec           #=> 333333333
    //   Time.new(2008, 3, 1, 6, 0, Rational(1, 3)).strftime("%9N") #=> "333333333"
    //   Time.new(2008, 3, 1, 6, 0, Rational(7, 2)).sec            #=> 3
    // MRI's `::Time` holds the second as a Rational, which is the form
    // `datetime_to_time` (`date_core.c:9053-9055`) passes as
    // `f_add(INT2FIX(m_sec(dat)), m_sf_in_sec(dat))`.
    const time = new Time(2008, 3, 1, 6, 0, new Rational(1, 3), "UTC");
    expect(time.sec).toBe(0);
    expect(time.nsec).toBe(333333333);
    expect(time.strftime("%9N")).toBe("333333333");

    const half = Time.utc(2008, 3, 1, 6, 0, new Rational(7, 2));
    expect(half.sec).toBe(3);
    expect(half.nsec).toBe(500000000);
  });

  it("a whole second carries no fraction", () => {
    const time = Time.utc(2008, 3, 1, 6, 0, 0);
    expect(time.nsec).toBe(0);
    expect(time.usec).toBe(0);
    expect(time.subsec).toBe(0);
    expect(time.strftime("%N")).toBe("000000000");
    expect(time.strftime("%L")).toBe("000");
  });

  it("raises MRI's ArgumentError, naming the field, for an out-of-range positional", () => {
    expect(() => Time.utc(2015, 6, 30, 23, 60, 0)).toThrow(new ArgumentError("min out of range"));
    expect(() => Time.utc(2015, 13, 1)).toThrow(new ArgumentError("mon out of range"));
    expect(() => Time.utc(2015, 6, 0)).toThrow(new ArgumentError("mday out of range"));
    expect(() => Time.utc(2015, 6, 1, 25)).toThrow(new ArgumentError("hour out of range"));
    expect(() => Time.utc(2015, 6, 1, 0, 0, 61)).toThrow(new ArgumentError("sec out of range"));
  });

  it("raises MRI's unnamed ArgumentError for a positional wider than its bit field", () => {
    expect(() => Time.utc(2015, 6, 32)).toThrow(new ArgumentError("argument out of range"));
    expect(() => Time.utc(2015, 16, 1)).toThrow(new ArgumentError("argument out of range"));
    expect(() => Time.utc(2015, 6, 1, 32)).toThrow(new ArgumentError("argument out of range"));
    expect(() => Time.utc(2015, 6, 1, 0, 64)).toThrow(new ArgumentError("argument out of range"));
    expect(() => Time.utc(2015, 6, 1, 0, 0, 64)).toThrow(
      new ArgumentError("argument out of range"),
    );
    expect(() => Time.utc(2015, 6, -1)).toThrow(new ArgumentError("argument out of range"));
  });

  it("normalizes a day past the month's length, as MRI's timegmw does", () => {
    expect(Time.utc(2015, 2, 29).strftime("%Y-%m-%d %H:%M:%S")).toBe("2015-03-01 00:00:00");
    expect(Time.utc(2015, 2, 31).strftime("%Y-%m-%d")).toBe("2015-03-03");
    expect(Time.utc(2015, 6, 31).strftime("%Y-%m-%d")).toBe("2015-07-01");
    expect(Time.utc(2016, 2, 29).strftime("%Y-%m-%d")).toBe("2016-02-29");
  });

  it("admits a 24th hour and rolls it into the next day, as MRI does", () => {
    expect(Time.utc(2015, 6, 30, 24).strftime("%Y-%m-%d %H:%M:%S")).toBe("2015-07-01 00:00:00");
    expect(() => Time.utc(2015, 6, 30, 24, 1)).toThrow(new ArgumentError("min out of range"));
    expect(() => Time.utc(2015, 6, 30, 24, 0, 1)).toThrow(new ArgumentError("sec out of range"));
  });

  describe("in a local zone `Intl` has no abbreviation for", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    function inZone(timeZoneId: string): void {
      vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue(timeZoneId);
    }

    it("Time#zone answers the tzdata abbreviation, not Intl's short name", () => {
      inZone("Asia/Kolkata");
      expect(new Time(2008, 3, 1, 6, 0, 0).zone).toBe("IST");
      expect(new Time(2008, 3, 1, 6, 0, 0).strftime("%z %Z")).toBe("+0530 IST");
    });

    it("Time#zone answers the standard or the summer abbreviation by offset", () => {
      inZone("Australia/Adelaide");
      expect(new Time(2008, 1, 1, 6, 0, 0).zone).toBe("ACDT");
      expect(new Time(2008, 7, 1, 6, 0, 0).zone).toBe("ACST");
      inZone("Europe/Dublin");
      expect(new Time(2008, 1, 1, 6, 0, 0).zone).toBe("GMT");
      expect(new Time(2008, 7, 1, 6, 0, 0).zone).toBe("IST");
    });

    it("Time#zone answers the abbreviation through a tzdata link name", () => {
      inZone("Asia/Calcutta");
      expect(new Time(2008, 3, 1, 6, 0, 0).zone).toBe("IST");
      inZone("Australia/Canberra");
      expect(new Time(2008, 1, 1, 6, 0, 0).zone).toBe("AEDT");
      expect(new Time(2008, 7, 1, 6, 0, 0).zone).toBe("AEST");
    });

    it("Time#zone spells an untabulated zone's abbreviation as tzdata does", () => {
      inZone("Asia/Dubai");
      expect(new Time(2008, 3, 1, 6, 0, 0).zone).toBe("+04");
      inZone("Asia/Kathmandu");
      expect(new Time(2008, 3, 1, 6, 0, 0).zone).toBe("+0545");
    });
  });
});
