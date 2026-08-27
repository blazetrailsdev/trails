import { describe, it, expect } from "vitest";
import { TimeWithZone } from "./time-with-zone.js";
import { TimeZone } from "./values/time-zone.js";
import { Temporal, Time } from "@blazetrails/date";
import { DATE_FORMATS } from "./core-ext/time/conversions.js";
import { Range } from "./range-ext.js";

// Ruby's Time carries full nanosecond precision, so %N answers nine significant
// digits (time_with_zone.rb:223-227 delegates strftime to that Time). These
// cover the readers and formatters that derive the sub-second part.
describe("TimeWithZone sub-millisecond precision", () => {
  const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
  const subMs = () =>
    new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00.123456789Z"), eastern);

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

// `to_fs` resolves through `Time::DATE_FORMATS` (time_with_zone.rb:212-220), so
// every key in that hash answers here — including one an app registers at boot.
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

// `initialize`'s local-time arm (time_with_zone.rb:51-56): with no `utc_time`,
// `get_period_and_ensure_valid_local_time` (:570-581) resolves the period from
// the LOCAL time, and rescues `TZInfo::PeriodNotFound` by moving the time
// forward an hour and retrying — the only place the class raises on, or
// repairs, a local time that does not exist.
describe("TimeWithZone local-time construction", () => {
  const eastern = TimeZone.find("Eastern Time (US & Canada)")!;

  it("resolves the period from the local time", () => {
    const twz = new TimeWithZone(null, eastern, Temporal.PlainDateTime.from("2006-01-02T03:00:00"));
    expect(twz.zone).toBe("EST");
    expect(twz.utcOffset).toBe(-5 * 3600);
    expect(twz.inspect()).toBe("2006-01-02 03:00:00.000000000 EST -05:00");
  });

  it("moves a local time in the spring-forward gap ahead one hour", () => {
    // 2006-04-02 02:30 EST does not exist: the clocks went 02:00 → 03:00.
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

// `method_missing` forwards to `time` and re-wraps the result
// (time_with_zone.rb:553-557 → :593-602). trails' `time` is a Temporal wall
// clock, and no Temporal method returns a Range, so the `..` arm of
// `wrap_with_time_zone` is reached through a `time` that answers one — the
// stand-in for Ruby's `Time#all_day`.
describe("TimeWithZone method_missing", () => {
  const eastern = TimeZone.find("Eastern Time (US & Canada)")!;

  class AllDayTime extends TimeWithZone {
    override get time(): Temporal.PlainDateTime {
      const t = super.time;
      const allDay = () =>
        new Range(
          t.with({ hour: 0, minute: 0, second: 0 }),
          t.with({ hour: 23, minute: 59, second: 59 }),
          true,
        );
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
