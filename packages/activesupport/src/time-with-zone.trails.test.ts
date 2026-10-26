import { describe, it, expect } from "vitest";
import { TimeWithZone } from "./time-with-zone.js";
import { TimeZone } from "./values/time-zone.js";
import { Timezone } from "@blazetrails/tzinfo";
import { Temporal, Time } from "@blazetrails/date";
import { DATE_FORMATS } from "./core-ext/time/conversions.js";
import { Range } from "@blazetrails/ruby-compat/range";
import { rbObjClass, rbObjClassname } from "@blazetrails/ruby-compat";

describe("TimeWithZone sub-millisecond precision", () => {
  const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
  const subMs = () =>
    new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00.123456789Z"), eastern);

  it("answers its own class for Object#class, and the branded name", () => {
    expect(rbObjClass(subMs())).toBe(TimeWithZone);
    expect(rbObjClassname(subMs())).toBe("ActiveSupport::TimeWithZone");
  });

  it("usec answers the full microseconds", () => {
    expect(subMs().usec).toBe(123456);
  });

  it("nsec answers the full nanoseconds", () => {
    expect(subMs().nsec).toBe(123456789);
  });

  it("strftime %N answers nine significant digits", () => {
    expect(subMs().strftime("%N")).toBe("123456789");
  });

  it("strftime %L is unchanged for a millisecond-precision time", () => {
    const twz = new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00.123Z"), eastern);
    expect(twz.strftime("%L")).toBe("123");
    expect(twz.nsec).toBe(123000000);
  });

  it("inspect prints the full nanoseconds", () => {
    expect(subMs().inspect()).toBe("1999-12-31 19:00:00.123456789 EST -05:00");
  });

  it("xmlschema truncates the fraction to the requested digits", () => {
    expect(subMs().xmlschema(3)).toBe("1999-12-31T19:00:00.123-05:00");
    expect(subMs().xmlschema(6)).toBe("1999-12-31T19:00:00.123456-05:00");
    expect(subMs().xmlschema(9)).toBe("1999-12-31T19:00:00.123456789-05:00");
  });

  it("change(nsec:) keeps every nanosecond digit", () => {
    expect(subMs().change({ nsec: 987654321 }).nsec).toBe(987654321);
  });

  it("change(usec:) keeps every microsecond digit", () => {
    expect(subMs().change({ usec: 987654 }).nsec).toBe(987654000);
  });

  it("change of an unrelated component carries the fraction through", () => {
    expect(subMs().change({ year: 2020 }).nsec).toBe(123456789);
  });

  it("change of a lower component still zeroes the fraction", () => {
    expect(subMs().change({ hour: 3 }).nsec).toBe(0);
  });
});

describe("TimeWithZone to_fs over Time::DATE_FORMATS", () => {
  const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
  const twz = () => new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00Z"), eastern);

  it("resolves every built-in key", () => {
    expect(twz().toFs("number")).toBe("19991231190000");
    expect(twz().toFs("usec")).toBe("19991231190000000000");
    expect(twz().toFs("nsec")).toBe("19991231190000000000000");
    expect(twz().toFs("time")).toBe("19:00");
    expect(twz().toFs("long_ordinal")).toBe("December 31st, 1999 19:00");
  });

  it("reaches a format registered after boot", () => {
    DATE_FORMATS["shouty"] = "%Y!";
    try {
      expect(twz().toFs("shouty")).toBe("1999!");
    } finally {
      delete DATE_FORMATS["shouty"];
    }
  });
});

describe("TimeWithZone local-time construction", () => {
  const eastern = TimeZone.find("Eastern Time (US & Canada)")!;

  it("resolves the period from the local time", () => {
    const twz = new TimeWithZone(null, eastern, Temporal.PlainDateTime.from("2006-01-02T03:00:00"));
    expect(twz.zone).toBe("EST");
    expect(twz.utcOffset).toBe(-5 * 3600);
    expect(twz.inspect()).toBe("2006-01-02 03:00:00.000000000 EST -05:00");
  });

  it("moves a local time in the spring-forward gap ahead one hour", () => {
    const twz = new TimeWithZone(null, eastern, Temporal.PlainDateTime.from("2006-04-02T02:30:00"));
    expect(twz.zone).toBe("EDT");
    expect(twz.inspect()).toBe("2006-04-02 03:30:00.000000000 EDT -04:00");
  });

  it("keeps a period handed to it rather than looking one up", () => {
    const period = eastern.periodForUtc(Time.utc(2006, 7, 1));
    const twz = new TimeWithZone(
      null,
      eastern,
      Temporal.PlainDateTime.from("2006-01-02T03:00:00"),
      period,
    );
    expect(twz.zone).toBe("EDT");
  });
});

describe("TimeWithZone method_missing", () => {
  const eastern = TimeZone.find("Eastern Time (US & Canada)")!;

  class AllDayTime extends TimeWithZone {
    override get time(): Time {
      const t = super.time;
      const allDay = () =>
        new Range(t.change({ hour: 0 }), t.change({ hour: 23, min: 59, sec: 59 }), true);
      return new Proxy(t, {
        get: (target, prop) => (prop === "allDay" ? allDay : Reflect.get(target, prop, target)),
      });
    }
  }

  it("rebuilds an inclusive range from a range return value", () => {
    const twz = new AllDayTime(Temporal.Instant.from("2000-01-01T00:00:00Z"), eastern);
    const range = (twz as unknown as { allDay(): Range<TimeWithZone> }).allDay();
    expect(range).toBeInstanceOf(Range);
    expect(range.excludeEnd).toBe(false);
    expect(range.begin).toBeInstanceOf(TimeWithZone);
    expect(range.end).toBeInstanceOf(TimeWithZone);
    expect(range.begin!.inspect()).toBe("1999-12-31 00:00:00.000000000 EST -05:00");
    expect(range.end!.inspect()).toBe("1999-12-31 23:59:59.000000000 EST -05:00");
  });
});

describe("TimeWithZone Comparable", () => {
  const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
  const twz = new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00Z"), eastern);

  it("<=> answers nil for an operand it cannot place", () => {
    expect(twz.compareTo("foo")).toBeNull();
  });

  it("== is false for an operand <=> cannot place, and does not raise", () => {
    expect(twz.equals("foo")).toBe(false);
    expect(twz.equals(new Date(Date.UTC(2000, 0, 1)))).toBe(true);
  });

  it("< <= > >= and between? raise ArgumentError for an operand <=> cannot place", () => {
    const message = "comparison of ActiveSupport::TimeWithZone with String failed";
    expect(() => twz.lessThan("foo")).toThrow(message);
    expect(() => twz.lessThanOrEqual("foo")).toThrow(message);
    expect(() => twz.greaterThan("foo")).toThrow(message);
    expect(() => twz.greaterThanOrEqual("foo")).toThrow(message);
    expect(() => twz.isBefore("foo")).toThrow(message);
    expect(() => twz.isAfter("foo")).toThrow(message);
    expect(() => twz.isBetween("foo", "bar")).toThrow(message);
  });
});

describe("TimeWithZone built with a TZInfo Timezone", () => {
  const twz = () => new TimeWithZone(Time.utc(2000, 1, 1, 0), Timezone.get("America/New_York"));

  it("inspect reads the zone through its protocol", () => {
    expect(twz().inspect()).toBe("1999-12-31 19:00:00.000000000 EST -05:00");
  });

  it("utc? answers from the zone abbreviation", () => {
    expect(twz().isUtc()).toBe(false);
    expect(new TimeWithZone(Time.utc(2000), Timezone.get("Etc/UTC")).isUtc()).toBe(true);
  });
});

describe("TZInfo periods read tzdata transitions", () => {
  it("equates two instants of one period by its transitions", () => {
    const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
    const july = eastern.periodForUtc(Time.utc(2006, 7, 1));
    expect(july.equals(eastern.periodForUtc(Time.utc(2006, 8, 1)))).toBe(true);
    expect(july.equals(eastern.periodForUtc(Time.utc(2007, 7, 1)))).toBe(false);
    expect(july.startTransition!.timestampValue).toBe(Date.UTC(2006, 3, 2, 7) / 1000);
    expect(july.endTransition!.timestampValue).toBe(Date.UTC(2006, 9, 29, 6) / 1000);
  });

  it("reads a year-round DST period's base offset from the standard period before it", () => {
    const period = TimeZone.find("Eastern Time (US & Canada)")!.periodForUtc(Time.utc(1943, 1, 15));
    expect(period.isDst()).toBe(true);
    expect(period.utcOffset).toBe(-18000);
    expect(period.stdOffset).toBe(3600);
  });
});

describe("TZInfo periods across an offset-only transition", () => {
  it("carries the DST amount when the base offset moves during DST", () => {
    const cancun = Timezone.get("America/Cancun");
    const before = cancun.periodForUtc(Time.utc(1998, 7, 1));
    const after = cancun.periodForUtc(Time.utc(1998, 9, 1));
    expect([before.utcOffset, before.stdOffset]).toEqual([-18000, 3600]);
    expect([after.utcOffset, after.stdOffset]).toEqual([-21600, 3600]);
    expect(after.equals(before)).toBe(false);
  });

  it("compares constant-offset periods by their offsets", () => {
    const plusFive = Timezone.get("Etc/GMT+5").periodForUtc(Time.utc(2020, 1, 1));
    const utc = Timezone.get("Etc/UTC").periodForUtc(Time.utc(2020, 1, 1));
    expect(plusFive.equals(utc)).toBe(false);
    expect(utc.equals(Timezone.get("Etc/UTC").periodForUtc(Time.utc(2021, 1, 1)))).toBe(true);
  });
});

describe("TZInfo periods read base offsets from tzdata", () => {
  it("reads a negative DST amount across Hong Kong's 1941 war-time transition", () => {
    const period = Timezone.get("Asia/Hong_Kong").periodForUtc(Time.utc(1941, 12, 20));
    expect([period.utcOffset, period.stdOffset, period.isDst()]).toEqual([32400, -1800, true]);
    expect(period.startTransition!.timestampValue).toBe(-891579600);
    expect(period.endTransition!.timestampValue).toBe(-884248200);
  });

  it("reads Cancun's 1998 base offset on both sides of its offset-only transition", () => {
    const cancun = Timezone.get("America/Cancun");
    const before = cancun.periodForUtc(Time.utc(1998, 7, 1));
    const after = cancun.periodForUtc(Time.utc(1998, 9, 1));
    expect([before.utcOffset, before.stdOffset, before.endTransition!.timestampValue]).toEqual([
      -18000, 3600, 902037600,
    ]);
    expect([after.utcOffset, after.stdOffset, after.startTransition!.timestampValue]).toEqual([
      -21600, 3600, 902037600,
    ]);
  });

  it("tells apart the periods around Windhoek's 1990 abbreviation-only transition", () => {
    const windhoek = Timezone.get("Africa/Windhoek");
    const before = windhoek.periodForUtc(Time.utc(1990, 3, 1));
    const after = windhoek.periodForUtc(Time.utc(1990, 4, 1));
    expect(before.endTransition!.timestampValue).toBe(637970400);
    expect(after.startTransition!.timestampValue).toBe(637970400);
    expect(after.endTransition!.timestampValue).toBe(764200800);
    expect(before.equals(after)).toBe(false);
  });
});
