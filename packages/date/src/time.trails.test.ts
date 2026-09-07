import { Temporal } from "@js-temporal/polyfill";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArgumentError } from "./date.js";
import { Time, resetLocalTimeZoneId } from "./time.js";
import { Rational } from "@blazetrails/ruby-compat";

describe("Time", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetLocalTimeZoneId();
  });

  it("Time.utc builds a UTC time", () => {
    const time = Time.utc(2008, 3, 1, 6, 0, 0);
    expect(time.zone).toBe("UTC");
    expect(time.strftime("%Y-%m-%d %H:%M:%S %z %Z")).toBe("2008-03-01 06:00:00 +0000 UTC");
  });

  it("Time.at builds a local time from the seconds since the Epoch", () => {
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("UTC");
    resetLocalTimeZoneId();
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
    expect(time.zone).toBeNull();
    expect(time.strftime("%Y-%m-%d %H:%M:%S %z %Z")).toBe("2008-03-01 06:00:00 -0500 ");
  });

  it("Time.new takes the zone as MRI's `in:` keyword", () => {
    expect(Time.new(2020, 1, 1, { in: "+05:00" }).toS()).toBe("2020-01-01 00:00:00 +0500");
    expect(Time.new(2020, 1, 1, { in: "+05:00" }).utcOffset).toBe(18000);
    expect(Time.new(2020, 1, 1, 0, 0, 0, { in: "+05:00" }).utcOffset).toBe(18000);
    expect(Time.now({ in: "+05:00" }).utcOffset).toBe(18000);
    expect(Time.new(2020, 1, { in: "+05:00" }).toS()).toBe("2020-01-01 00:00:00 +0500");
    expect(Time.new(2020, 1, 1, 5, { in: "+05:00" }).toS()).toBe("2020-01-01 05:00:00 +0500");
  });

  it("Time.new takes the zone as MRI's seventh positional", () => {
    expect(Time.new(2020, 1, 1, 0, 0, 0, "+05:00").utcOffset).toBe(18000);
    expect(Time.new(2020, 1, 1, 0, 0, 0, 3600).utcOffset).toBe(3600);
    expect(() => Time.new(2020, 1, 1, 0, 0, 0, "+05:00", { in: "+06:00" })).toThrow(
      "timezone argument given as positional and keyword arguments",
    );
  });

  it("Time.new takes MRI's `precision:` keyword, which trims only a string argument", () => {
    expect(Time.new(2020, 1, 1, 0, 0, 0.56789, { precision: 3 }).nsec).toBe(567890000);
    expect(Time.new({ precision: 3 })).toBeInstanceOf(Time);
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

  it("toTime keeps the instant a sub-minute offset names, as MRI's to_i does", () => {
    const time = Time.new("2013-09-04 03:00:00 -00:44:30");
    expect(time.utcOffset).toBe(-2670);
    expect(time.toI()).toBe(1378266270);
    expect(time.toTime().epochNanoseconds).toBe(1378266270000000000n);
  });

  it("toTime keeps the wall clock a sub-minute offset names, as MRI's hour/min/sec do", () => {
    const time = Time.new("2013-09-04 03:00:00 -00:44:30");
    expect(time.toTime().toPlainDateTime().toString()).toBe("2013-09-04T03:00:00");
    expect(time.toTime().hour).toBe(3);
    expect(time.toTime().minute).toBe(0);
    expect(time.toTime().second).toBe(0);
    expect(time.toTime().toInstant().epochNanoseconds).toBe(1378266270000000000n);
    expect(time.toTime().epochMilliseconds).toBe(1378266270000);
    expect(time.utcOffset).toBe(-2670);
  });

  it("toTime keeps the wall clock for a positive sub-minute offset", () => {
    const time = new Time(2008, 3, 1, 6, 0, 0, 32430);
    expect(time.toTime().toPlainDateTime().toString()).toBe("2008-03-01T06:00:00");
    expect(time.toTime().epochNanoseconds).toBe(BigInt(time.toI()) * 1000000000n);
  });

  it("toTime moves a sub-minute-offset receiver to another zone by its exact instant", () => {
    const time = Time.new("2013-09-04 03:00:00 -00:44:30");
    expect(time.toTime().withTimeZone("UTC").toPlainDateTime().toString()).toBe(
      "2013-09-04T03:44:30",
    );
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
    expect(Time.utc(2005, 2, 27, 23, 50, 19, 275038).toTime().epochNanoseconds).toBe(
      Time.utc(2005, 2, 27, 23, 50, new Rational(19275038, 1000000)).toTime().epochNanoseconds,
    );
    expect(Time.utc(2005, 2, 27, 23, 50, 19, 275038).nsec).toBe(275038000);
    expect(Time.mktime(2005, 2, 27, 23, 50, 19, 275038).toTime().epochNanoseconds).toBe(
      Time.mktime(2005, 2, 27, 23, 50, new Rational(19275038, 1000000)).toTime().epochNanoseconds,
    );
  });

  it("a usec positional truncates sec to a whole second, as MRI's does", () => {
    expect(Time.utc(2008, 3, 1, 6, 0, 0.3, 5).nsec).toBe(5000);
    expect(Time.utc(2008, 3, 1, 6, 0, 0.3, 0.5).nsec).toBe(500);
    expect(Time.utc(2008, 3, 1, 6, 0, new Rational(1, 3), 0).nsec).toBe(0);
    expect(Time.utc(2008, 3, 1, 6, 0, 0.3).nsec).toBe(299999999);
  });

  it("Time.new takes a Rational second, as MRI's does", () => {
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
      resetLocalTimeZoneId();
    });

    function inZone(timeZoneId: string): void {
      vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue(timeZoneId);
      resetLocalTimeZoneId();
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

    it("Time.at answers the exact instant inside a DST fall-back's repeated hour", () => {
      inZone("America/New_York");
      const edt = Time.at(1225603800);
      expect(edt.strftime("%Y-%m-%d %H:%M:%S %z %Z")).toBe("2008-11-02 01:30:00 -0400 EDT");
      expect(edt.utcOffset).toBe(-14400);
      expect(Number(edt.toTime().epochMilliseconds) / 1_000).toBe(1225603800);
      expect(edt.getutc().strftime("%Y-%m-%d %H:%M:%S")).toBe("2008-11-02 05:30:00");

      const est = Time.at(1225607400);
      expect(est.strftime("%Y-%m-%d %H:%M:%S %z %Z")).toBe("2008-11-02 01:30:00 -0500 EST");
      expect(est.utcOffset).toBe(-18000);
      expect(Number(est.toTime().epochMilliseconds) / 1_000).toBe(1225607400);
      expect(est.getutc().strftime("%Y-%m-%d %H:%M:%S")).toBe("2008-11-02 06:30:00");
    });
  });
  describe("Time.at given a Time", () => {
    it("keeps the argument's own zone rather than converting to the local one", () => {
      const t = new Time(2020, 1, 1, 0, 0, 0, "+05:00");

      expect(Time.at(t).utcOffset).toBe(18000);
      expect(Time.at(t).toS()).toBe(t.toS());
      expect(Time.at(Time.utc(2020, 1, 1)).isUtc()).toBe(true);
    });

    it("raises TypeError when a second argument comes with it", () => {
      expect(() => Time.at(Time.utc(2020, 1, 1), 5)).toThrow(
        new TypeError("can't convert Time into an exact number"),
      );
    });
  });

  describe("Time#plus", () => {
    it("moves the receiver forward by that many seconds, keeping its zone", () => {
      const t = Time.utc(2020, 1, 1);

      expect(t.plus(1).isUtc()).toBe(true);
      expect(t.plus(1).toS()).toBe("2020-01-01 00:00:01 UTC");
      expect(new Time(2020, 1, 1, 0, 0, 0, "+05:00").plus(60).utcOffset).toBe(18000);
    });

    it("takes the Integer, Float or Rational `num_exact` takes", () => {
      const t = Time.utc(2020, 1, 1);

      expect(t.plus(new Rational(1, 3)).nsec).toBe(333333333);
      expect(t.plus(-0.5).nsec).toBe(500000000);
      expect(t.plus(-0.5).sec).toBe(59);
    });

    it("raises TypeError on a Time argument", () => {
      expect(() => Time.utc(2020, 1, 1).plus(Time.utc(2020, 1, 1))).toThrow(
        new TypeError("time + time?"),
      );
    });
  });

  describe("Time#minus", () => {
    it("answers the seconds between two Times", () => {
      expect(Time.utc(2020, 1, 1).minus(Time.utc(2019, 12, 31))).toBe(86400.0);
    });

    it("moves the receiver back by a numeric, keeping its zone", () => {
      const t = new Time(2020, 1, 1, 0, 0, 0, "+05:00");

      expect((t.minus(60) as Time).toS()).toBe("2019-12-31 23:59:00 +0500");
      expect((t.minus(60) as Time).utcOffset).toBe(18000);
    });
  });

  describe("Time#getlocal", () => {
    it("answers the same instant in the local system zone", () => {
      const t = Time.utc(2020, 1, 1, 12, 0, 0);
      const local = t.getlocal();
      expect(local.toTime().epochNanoseconds).toBe(t.toTime().epochNanoseconds);
      expect(local.utcOffset).toBe(
        Number(
          Temporal.Instant.fromEpochMilliseconds(946728000000).toZonedDateTimeISO(
            Temporal.Now.timeZoneId(),
          ).offsetNanoseconds,
        ) / 1_000_000_000,
      );
    });

    it("seats the instant at an explicit utc_offset", () => {
      const t = Time.utc(2020, 1, 1, 12, 0, 0);
      expect(t.getlocal("+05:00").utcOffset).toBe(18000);
      expect(t.getlocal("+05:00").hour).toBe(17);
      expect(t.getlocal(18000).utcOffset).toBe(18000);
    });

    it("an offset-built time has no zone, as MRI's has none", () => {
      const t = Time.utc(2020, 1, 1, 12, 0, 0);
      expect(t.getlocal("+05:00").zone).toBeNull();
      expect(t.getlocal("+05:00").strftime("%Z")).toBe("");
      expect(t.getlocal("+05:00").toS()).toBe("2020-01-01 17:00:00 +0500");
    });

    it("a zone identifier stands in for MRI's zone object argument", () => {
      const t = Time.utc(2020, 1, 1, 12, 0, 0);
      const eastern = t.getlocal("America/New_York");
      expect(eastern.utcOffset).toBe(-18000);
      expect(eastern.zone).toBe("EST");
    });
  });
  describe("Time.new given a String", () => {
    it("parses MRI's `time_init_parse` grammar", () => {
      const t = Time.new("2000-12-31 23:59:59.56789");
      expect(t.strftime("%Y-%m-%d %H:%M:%S")).toBe("2000-12-31 23:59:59");
      expect(t.nsec).toBe(567890000);
      expect(Time.new("2020-01-01T01:02:03Z").isUtc()).toBe(true);
      expect(Time.new("2020-01-01 01:02:03 +05:00").utcOffset).toBe(18000);
      expect(Time.new("2020-01-01 01:02:03+0530").utcOffset).toBe(19800);
      expect(Time.new("2020-01-01 01:02:03A").utcOffset).toBe(3600);
      expect(Time.new("2020").strftime("%Y-%m-%d %H:%M:%S")).toBe("2020-01-01 00:00:00");
      expect(Time.new("-05000-01-01 01:02:03").year).toBe(-5000);
    });

    it("truncates the sub-second to `precision:` digits", () => {
      expect(Time.new("2000-12-31 23:59:59.56789", { precision: 3 }).nsec).toBe(
        Time.new("2000-12-31 23:59:59.567").nsec,
      );
      expect(Time.new("2000-12-31 23:59:59.56789", { precision: 20 }).nsec).toBe(567890000);
      expect(Time.new("2000-12-31 23:59:59.56789", { precision: -1 }).nsec).toBe(567890000);
      expect(Time.new(2020, 1, 1, 0, 0, 0.56789, null, { precision: 3 }).nsec).toBe(567890000);
    });

    it("takes `in:` for a string that spells no zone of its own", () => {
      expect(Time.new("2020-01-01 00:00:00", { in: "+05:00" }).utcOffset).toBe(18000);
      expect(Time.new("2020-01-01 00:00:00+01:00", { in: "+05:00" }).utcOffset).toBe(3600);
    });

    it("raises MRI's own message at the step that stopped the parse", () => {
      expect(() => Time.new("garbage")).toThrow(new ArgumentError('can\'t parse: "garbage"'));
      expect(() => Time.new("202-01-01T01:02:03")).toThrow(
        new ArgumentError("year must be 4 or more digits: 202"),
      );
      expect(() => Time.new("2020-1-01 01:02:03")).toThrow(
        new ArgumentError("two digits mon is expected after `-': -1-01 01:02"),
      );
      expect(() => Time.new("2020-01-0")).toThrow(
        new ArgumentError("two digits mday is expected after `-': -0"),
      );
      expect(() => Time.new("2020-01-01")).toThrow(new ArgumentError("no time information"));
      expect(() => Time.new("2020-01-01 1:02:03")).toThrow(
        new ArgumentError("two digits hour is expected:  1:02:03"),
      );
      expect(() => Time.new("2020-01-01T01")).toThrow(new ArgumentError("missing min part: 01"));
      expect(() => Time.new("2020-01-01T01:02")).toThrow(
        new ArgumentError("missing sec part: 01:02"),
      );
      expect(() => Time.new("2020-01-01T01:02:")).toThrow(
        new ArgumentError("two digits sec is expected after `:': :"),
      );
      expect(() => Time.new("2000-12-31 23:59:59.5", { precision: 0 })).toThrow(
        new ArgumentError("subsecond expected after dot: 23:59:59.5"),
      );
      expect(() => Time.new("2020-01-01T01:02:03+05:0")).toThrow(
        new ArgumentError(
          '"+HH:MM", "-HH:MM", "UTC" or "A".."I","K".."Z" expected for utc_offset: +05:0',
        ),
      );
    });
  });

  describe("clock resolution", () => {
    for (const [name, read] of [
      ["Time.now", () => Time.now().nsec],
      ["Time.new", () => Time.new().nsec],
    ] as const) {
      it(`${name} resolves finer than a millisecond, as CLOCK_REALTIME does`, () => {
        let pairs = 0;
        let distinct = 0;

        for (let i = 0; i < 1_000; i++) {
          const millisecond = Date.now();
          const first = read();
          const second = read();
          if (Date.now() !== millisecond) continue;
          pairs++;
          if (first !== second) distinct++;
        }

        expect(pairs).toBeGreaterThan(0);
        expect(distinct).toBeGreaterThan(pairs / 2);
      });
    }
  });

  it("Time.parse reads an RFC 2822 / RFC 1123 cookie Expires value", () => {
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("America/New_York");
    const time = Time.parse("Wed, 13 Jan 2021 22:23:01 GMT");
    expect(time.xmlschema()).toBe("2021-01-13T22:23:01+00:00");
    expect(time.utcOffset).toBe(0);
  });

  it("Time.parse honours an explicit numeric zone offset", () => {
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("America/New_York");
    const time = Time.parse("Fri, 01 Jan 2021 00:00:00 -0500");
    expect(time.xmlschema()).toBe("2021-01-01T00:00:00-05:00");
    expect(time.utcOffset).toBe(-18000);
  });

  it("Time.parse reads a zoneless date as a local time where JS Date reads UTC", () => {
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("America/New_York");
    const time = Time.parse("2010-10-31");
    expect(time.xmlschema()).toBe("2010-10-31T00:00:00-04:00");
  });

  it("Time.parse fills the missing pieces from its now argument", () => {
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("America/New_York");
    const now = Time.parse("Thu Nov 29 14:33:20 2001");
    expect(now.xmlschema()).toBe("2001-11-29T14:33:20-05:00");
    expect(Time.parse("16:30", now).xmlschema()).toBe("2001-11-29T16:30:00-05:00");
    expect(Time.parse("7/23", now).xmlschema()).toBe("2001-07-23T00:00:00-04:00");
    expect(Time.parse("Aug 2000", now).xmlschema()).toBe("2000-08-01T00:00:00-04:00");
  });

  it("Time.parse understands the RFC 822 zone abbreviations", () => {
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("America/New_York");
    expect(Time.parse("10 Feb 2020 12:00:00 EST").xmlschema()).toBe("2020-02-10T12:00:00-05:00");
  });

  it("Time.parse keeps the sub-second part", () => {
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("America/New_York");
    expect(Time.parse("2010-10-31T12:34:56.789Z").xmlschema(3)).toBe("2010-10-31T12:34:56.789Z");
  });

  it("Time.parse raises ArgumentError when there is no time information", () => {
    expect(() => Time.parse("")).toThrow(ArgumentError);
  });

  it("Time.zoneOffset answers the seconds a zone differs from UTC", () => {
    expect(Time.zoneOffset("EST")).toBe(-18000);
    expect(Time.zoneOffset("Z")).toBe(0);
    expect(Time.zoneOffset("+09:30")).toBe(34200);
    expect(Time.zoneOffset("-05")).toBe(-18000);
  });

  it("Time.parse hands the uncompleted year to its block", () => {
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("America/New_York");
    expect(Time.parse("Feb 24 72", Time.now(), (y) => y + 2000).xmlschema()).toBe(
      "2072-02-24T00:00:00-05:00",
    );
    expect(Time.parse("Feb 24 72").xmlschema()).toBe("1972-02-24T00:00:00-05:00");
  });

  it("Time.xmlschema honours the zone the timestamp carries", () => {
    expect(Time.xmlschema("2011-10-05T22:26:12-04:00").toF()).toBe(1317867972);
    expect(Time.xmlschema("2011-10-05T22:26:12.5Z").toF()).toBe(1317853572.5);
  });

  it("Time.xmlschema reads a zoneless timestamp as local", () => {
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("America/New_York");
    expect(Time.xmlschema("2011-10-05T22:26:12").toF()).toBe(1317867972);
  });

  it("Time.xmlschema raises ArgumentError on a malformed timestamp", () => {
    expect(() => Time.xmlschema("nope")).toThrow(
      new ArgumentError('invalid xmlschema format: "nope"'),
    );
  });

  it("Time.iso8601 is an alias of Time.xmlschema", () => {
    expect(Time.iso8601).toBe(Time.xmlschema);
  });

  describe("Time#<=> and Time#eql?", () => {
    it("compares two times by their whole timew", () => {
      expect(Time.utc(2000, 1, 1).compare(Time.utc(2000, 1, 2))).toBe(-1);
      expect(Time.utc(2000, 1, 2).compare(Time.utc(2000, 1, 1))).toBe(1);
      expect(Time.utc(2000, 1, 1).compare(Time.utc(2000, 1, 1))).toBe(0);
      expect(Time.at(0, 1).compare(Time.at(0))).toBe(1);
    });

    it("answers nil for an operand that is not a Time", () => {
      expect(Time.utc(2000, 1, 1).compare(0)).toBeNull();
    });

    it("eql? requires the same subsecond value", () => {
      expect(Time.at(0, new Rational(1, 2)).eql(Time.at(0, new Rational(1, 2)))).toBe(true);
      expect(Time.at(0, 1).eql(Time.at(0))).toBe(false);
      expect(Time.at(0).eql(0)).toBe(false);
    });
  });

  describe("Time.strptime", () => {
    it("parses a date with an explicit format", () => {
      vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("UTC");
      resetLocalTimeZoneId();
      expect(Time.strptime("2000-10-31", "%Y-%m-%d").strftime("%Y-%m-%d %H:%M:%S %z")).toBe(
        "2000-10-31 00:00:00 +0000",
      );
    });

    it("honours a parsed zone offset", () => {
      expect(
        Time.strptime("2001-02-03T04:05:06+09:00", "%Y-%m-%dT%H:%M:%S%z").strftime(
          "%Y-%m-%d %H:%M:%S %z",
        ),
      ).toBe("2001-02-03 04:05:06 +0900");
    });

    it("parses seconds since the Epoch", () => {
      vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("UTC");
      resetLocalTimeZoneId();
      expect(Time.strptime("1234567890", "%s").strftime("%Y-%m-%d %H:%M:%S %z")).toBe(
        "2009-02-13 23:31:30 +0000",
      );
    });

    it("falls back to Date.strptime for week-number formats", () => {
      vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("UTC");
      resetLocalTimeZoneId();
      expect(Time.strptime("2015-32", "%Y-%W").strftime("%Y-%m-%d")).toBe("2015-08-10");
    });

    it("routes a Julian commercial date through Date#to_time's gregorian conversion", () => {
      vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("UTC");
      resetLocalTimeZoneId();
      expect(Time.strptime("1500-W09-6", "%G-W%V-%u").strftime("%Y-%m-%d")).toBe("1500-03-10");
    });

    it("raises ArgumentError on an unparsable date", () => {
      expect(() => Time.strptime("bogus", "%Y")).toThrow(
        new ArgumentError("invalid date or strptime format - `bogus' `%Y'"),
      );
    });
  });

  describe("Time.rfc2822", () => {
    it("parses an RFC 2822 date", () => {
      expect(Time.rfc2822("Wed, 05 Oct 2011 22:26:12 -0400").strftime("%Y-%m-%d %H:%M:%S %z")).toBe(
        "2011-10-05 22:26:12 -0400",
      );
    });

    it("completes a two-digit year and defaults the seconds", () => {
      expect(Time.rfc2822("5 Oct 11 22:26 -0400").strftime("%Y-%m-%d %H:%M:%S %z")).toBe(
        "2011-10-05 22:26:00 -0400",
      );
    });

    it("is aliased as rfc822", () => {
      expect(Time.rfc822("Thu, 06 Oct 2011 02:26:12 GMT").strftime("%Y-%m-%d %H:%M:%S %z")).toBe(
        "2011-10-06 02:26:12 +0000",
      );
    });

    it("raises ArgumentError on a non-compliant date", () => {
      expect(() => Time.rfc2822("bogus")).toThrow(
        new ArgumentError('not RFC 2822 compliant date: "bogus"'),
      );
    });
  });

  describe("Time.httpdate", () => {
    it("parses the RFC 1123 form", () => {
      const t = Time.httpdate("Thu, 06 Oct 2011 02:26:12 GMT");
      expect(t.zone).toBe("UTC");
      expect(t.strftime("%Y-%m-%d %H:%M:%S")).toBe("2011-10-06 02:26:12");
    });

    it("parses the RFC 850 form", () => {
      const t = Time.httpdate("Thursday, 06-Oct-11 02:26:12 GMT");
      expect(t.zone).toBe("UTC");
      expect(t.strftime("%Y-%m-%d %H:%M:%S")).toBe("2011-10-06 02:26:12");
    });

    it("parses the asctime form", () => {
      const t = Time.httpdate("Thu Oct  6 02:26:12 2011");
      expect(t.zone).toBe("UTC");
      expect(t.strftime("%Y-%m-%d %H:%M:%S")).toBe("2011-10-06 02:26:12");
    });

    it("raises ArgumentError on a non-compliant date", () => {
      expect(() => Time.httpdate("bogus")).toThrow(
        new ArgumentError('not RFC 2616 compliant date: "bogus"'),
      );
    });
  });
});
