import { describe, it, expect } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import { TimeWithZone, useZone } from "@blazetrails/activesupport";
import {
  applySecondsPrecision,
  fastStringToTime,
  newTime,
  userInputInTimeZone,
} from "./time-value.js";
import { DateTimeType } from "../date-time.js";
import { TimeType } from "../time.js";

describe("applySecondsPrecision", () => {
  const dt = Temporal.PlainDateTime.from("2024-01-02T03:04:05.123456789");

  it("returns value unchanged when precision is undefined", () => {
    expect(applySecondsPrecision.call({}, dt)).toBe(dt);
  });

  it("returns value unchanged for precision >= 9 (full nanosecond keep)", () => {
    expect(applySecondsPrecision.call({ precision: 9 }, dt)).toBe(dt);
  });

  it("rejects non-integer precision", () => {
    expect(applySecondsPrecision.call({ precision: 3.5 }, dt)).toBe(dt);
  });

  it("rejects out-of-range precision", () => {
    expect(applySecondsPrecision.call({ precision: -1 }, dt)).toBe(dt);
    expect(applySecondsPrecision.call({ precision: 10 }, dt)).toBe(dt);
  });

  it("precision 0 truncates to whole seconds", () => {
    const r = applySecondsPrecision.call({ precision: 0 }, dt) as Temporal.PlainDateTime;
    expect(r.millisecond).toBe(0);
    expect(r.microsecond).toBe(0);
    expect(r.nanosecond).toBe(0);
  });

  it("precision 3 keeps milliseconds, drops micros + nanos", () => {
    const r = applySecondsPrecision.call({ precision: 3 }, dt) as Temporal.PlainDateTime;
    expect(r.millisecond).toBe(123);
    expect(r.microsecond).toBe(0);
    expect(r.nanosecond).toBe(0);
  });

  it("precision 6 keeps micros, drops nanos", () => {
    const r = applySecondsPrecision.call({ precision: 6 }, dt) as Temporal.PlainDateTime;
    expect(r.millisecond).toBe(123);
    expect(r.microsecond).toBe(456);
    expect(r.nanosecond).toBe(0);
  });

  it("precision 8 keeps two of three nano digits", () => {
    const r = applySecondsPrecision.call({ precision: 8 }, dt) as Temporal.PlainDateTime;
    expect(r.millisecond).toBe(123);
    expect(r.microsecond).toBe(456);
    expect(r.nanosecond).toBe(780);
  });

  it("truncates rather than rounds (789 → 780 at precision 8, not 790)", () => {
    const r = applySecondsPrecision.call({ precision: 8 }, dt) as Temporal.PlainDateTime;
    expect(r.nanosecond).toBe(780);
  });

  it("works on Temporal.Instant via .round()", () => {
    const inst = Temporal.Instant.from("2024-01-02T03:04:05.123456789Z");
    const r = applySecondsPrecision.call({ precision: 3 }, inst) as Temporal.Instant;
    const zdt = r.toZonedDateTimeISO("UTC");
    expect(zdt.millisecond).toBe(123);
    expect(zdt.microsecond).toBe(0);
    expect(zdt.nanosecond).toBe(0);
  });

  it("passes PlainDate (no .round) through unchanged", () => {
    const d = Temporal.PlainDate.from("2024-01-02");
    expect(applySecondsPrecision.call({ precision: 3 }, d)).toBe(d);
  });

  it("passes null/undefined through unchanged", () => {
    expect(applySecondsPrecision.call({ precision: 3 }, null)).toBeNull();
    expect(applySecondsPrecision.call({ precision: 3 }, undefined)).toBeUndefined();
  });
});

describe("newTime", () => {
  it("returns null for 0000-00-00 00:00:00 and rejects out-of-range components", () => {
    expect(newTime(0, 0, 0, 0, 0, 0, 0)).toBeNull();
    expect(newTime(2024, 13, 1, 0, 0, 0, 0)).toBeNull();
  });

  it("subtracts offset (in seconds) when offset != 0", () => {
    const i = newTime(2024, 1, 2, 12, 0, 0, 0, 3600);
    expect(i?.getutc().xmlschema()).toBe("2024-01-02T11:00:00Z");
  });

  it("splits Ruby microsec (0..999_999) across Temporal millisecond/microsecond", () => {
    const i = newTime(2024, 1, 2, 12, 0, 0, 123456);
    expect(i?.usec).toBe(123456);
  });

  it("carries a Rational microsec and offset exactly, as Time.utc does", () => {
    const i = newTime(2000, 1, 1, 14, 23, 55, new Rational(123456, 1_000_000));
    expect(i?.getutc().xmlschema(9)).toBe("2000-01-01T14:23:55.000000123Z");

    const shifted = newTime(
      2000,
      1,
      1,
      14,
      23,
      55,
      new Rational(123456, 1_000_000),
      new Rational(3600, 1),
    );
    expect(shifted?.getutc().xmlschema(9)).toBe("2000-01-01T13:23:55.000000123Z");
  });
});

describe("fastStringToTime", () => {
  it("returns null for strings without '-'", () => {
    expect(fastStringToTime("1234")).toBeNull();
  });

  it("normalizes Postgres short offset (+00) to (+00:00)", () => {
    const i = fastStringToTime("2026-04-26 14:23:55.123456+00");
    expect(i?.getutc().xmlschema(6)).toBe("2026-04-26T14:23:55.123456Z");
  });

  it("returns null for a date-only string, as Time.new raises 'no time information'", () => {
    expect(fastStringToTime("2026-04-26")).toBeNull();
  });

  it("floors a sub-second longer than nine digits at the nanosecond", () => {
    const i = fastStringToTime("2026-04-26 14:23:55.1234567891+00:00");
    expect(i?.getutc().xmlschema(9)).toBe("2026-04-26T14:23:55.123456789Z");
  });

  it("truncates a pre-1970 sub-second instant on nsec, not toward zero", () => {
    const inst = RubyTime.utc(1969, 12, 31, 23, 59, 59, new Rational(123456789, 1000));
    const time = new TimeType({ precision: 3 });
    const dateTime = new DateTimeType({ precision: 3 });

    expect((time.serializeCastValue(inst) as RubyTime).xmlschema(3)).toBe(
      "1969-12-31T23:59:59.123Z",
    );
    expect((dateTime.serializeCastValue(inst) as RubyTime).xmlschema(3)).toBe(
      "1969-12-31T23:59:59.123Z",
    );
  });
});

describe("userInputInTimeZone", () => {
  it("answers String#to_time when Time.zone is unset", () => {
    const result = userInputInTimeZone("2024-06-15 14:30:00");
    expect(result).toBeInstanceOf(Temporal.ZonedDateTime);
    expect((result as Temporal.ZonedDateTime).toPlainDateTime().toString()).toBe(
      "2024-06-15T14:30:00",
    );
  });

  it("parses in Time.zone when one is set", () => {
    useZone("Eastern Time (US & Canada)", () => {
      const result = userInputInTimeZone("2024-06-15 14:30:00") as TimeWithZone;
      expect(result).toBeInstanceOf(TimeWithZone);
      expect(result.timeZone.name).toBe("Eastern Time (US & Canada)");
      expect(result.hour).toBe(14);
    });
  });

  it("keeps sub-millisecond precision through the zone parse", () => {
    useZone("Eastern Time (US & Canada)", () => {
      const result = userInputInTimeZone("2024-06-15 14:30:00.123456789") as TimeWithZone;
      expect(result.utc().toTime().epochNanoseconds % 1_000_000_000n).toBe(123456789n);
    });
  });

  it("honours an explicit offset in the string", () => {
    useZone("Eastern Time (US & Canada)", () => {
      const result = userInputInTimeZone("2024-06-15T10:30:00Z") as TimeWithZone;
      expect(result.hour).toBe(6);
    });
  });

  it("reads a date-only string as midnight in the zone", () => {
    useZone("Eastern Time (US & Canada)", () => {
      const result = userInputInTimeZone("2024-06-15") as TimeWithZone;
      expect(result.hour).toBe(0);
      expect(result.day).toBe(15);
    });
  });
});
