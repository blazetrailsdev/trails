import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { Types } from "../index.js";
import { useZone } from "@blazetrails/activesupport";

/** `::Time.utc(...)`, the value Rails' own assertions are written against. */
function timeUtc(
  year: number,
  mon: number,
  mday: number,
  hour = 0,
  min = 0,
  sec = 0,
): Temporal.Instant {
  return new Temporal.PlainDateTime(year, mon, mday, hour, min, sec)
    .toZonedDateTime("UTC")
    .toInstant();
}

describe("TimeTest", () => {
  const type = new Types.TimeType();

  it("type cast time", () => {
    expect(type.cast(null)).toBe(null);
    expect(type.cast("")).toBe(null);
    expect(type.cast("ABC")).toBe(null);
    expect(type.cast(" ".repeat(129))).toBe(null);

    expect(type.cast("2015-06-13T19:45:54+03:00")).toEqual(timeUtc(2000, 1, 1, 16, 45, 54));
    expect(type.cast("06:07:08+09:00")).toEqual(timeUtc(1999, 12, 31, 21, 7, 8));
    expect(type.cast({ "4": 16, "5": 45, "6": 54 })).toEqual(timeUtc(2000, 1, 1, 16, 45, 54));
    expect(type.cast("2023-01-01T00:00:00-03:30")).toEqual(timeUtc(2000, 1, 1, 3, 30, 0));

    expect(type.cast("19:45:54")).toEqual(timeUtc(2000, 1, 1, 19, 45, 54));
  });

  it("extracts time from full datetime string", () => {
    expect(type.cast("2015-02-09T19:45:54+00:00")).toEqual(timeUtc(2000, 1, 1, 19, 45, 54));
  });

  it("microsecond precision is preserved through cast", () => {
    const result = type.cast("14:23:55.123456") as Temporal.Instant;
    expect(result.toString()).toBe("2000-01-01T14:23:55.123456Z");
  });

  it("Temporal.Instant passthrough", () => {
    const original = timeUtc(2000, 1, 1, 14, 23, 55);
    expect(type.cast(original)).toBe(original);
  });

  it("has name 'time'", () => {
    expect(type.name).toBe("time");
  });

  it("casts undefined to null", () => {
    expect(type.cast(undefined)).toBe(null);
  });

  it("serialize returns the cast Instant (not a SQL string)", () => {
    const t = type.cast("14:23:55.123456") as Temporal.Instant;
    expect(String(type.serialize(t))).toBe("2000-01-01T14:23:55.123456Z");
  });

  it("serialize null returns null", () => {
    expect(type.serialize(null)).toBe(null);
  });

  it("serialize respects column precision", () => {
    const t = new Types.TimeType({ precision: 3 });
    expect(String(t.serialize("14:23:55.123456"))).toBe("2000-01-01T14:23:55.123Z");
  });

  it("PlainDateTime input extracts time (multiparameter support)", () => {
    const pdt = Temporal.PlainDateTime.from("2024-06-15T14:23:55");
    expect(type.cast(pdt)).toEqual(timeUtc(2024, 6, 15, 14, 23, 55));
  });

  it("user input in time zone wraps plain time in Time.zone", () => {
    useZone("Eastern Time (US & Canada)", () => {
      const result = type.userInputInTimeZone("14:30:00");
      expect(result).toBeInstanceOf(Temporal.ZonedDateTime);
      expect((result as Temporal.ZonedDateTime).hour).toBe(14);
      expect((result as Temporal.ZonedDateTime).timeZoneId).toBe("America/New_York");
    });
  });

  it("user input in time zone answers a zoneless value when Time.zone is unset", () => {
    const result = type.userInputInTimeZone("14:30:00");
    expect(result).toBeInstanceOf(Temporal.PlainDateTime);
    expect((result as Temporal.PlainDateTime).hour).toBe(14);
  });

  it("user input in time zone returns null for null", () => {
    expect(type.userInputInTimeZone(null)).toBe(null);
    expect(type.userInputInTimeZone("")).toBe(null);
    expect(type.userInputInTimeZone("ABC")).toBe(null);
    expect(type.userInputInTimeZone(" ".repeat(129))).toBe(null);
  });

  it("user input in time zone passthrough for ZonedDateTime", () => {
    const zdt = Temporal.ZonedDateTime.from("2024-01-15T14:30:00[America/New_York]");
    expect(type.userInputInTimeZone(zdt)).toBe(zdt);
  });

  it("cast 3pm returns 15:00", () => {
    expect(type.cast("3pm")).toEqual(timeUtc(2000, 1, 1, 15, 0, 0));
  });

  it("cast 3:30 PM returns 15:30", () => {
    expect(type.cast("3:30 PM")).toEqual(timeUtc(2000, 1, 1, 15, 30, 0));
  });

  it("cast 15:30 returns 15:30", () => {
    expect(type.cast("15:30")).toEqual(timeUtc(2000, 1, 1, 15, 30, 0));
  });

  it("cast garbage string returns null", () => {
    expect(type.cast("garbage")).toBe(null);
  });

  it("cast ISO time string still works (regression guard)", () => {
    expect(type.cast("19:45:54")).toEqual(timeUtc(2000, 1, 1, 19, 45, 54));
  });

  it("cast datetime with non-zero offset shifts the instant", () => {
    expect(type.cast("2015-02-09T19:45:54+02:00")).toEqual(timeUtc(2000, 1, 1, 17, 45, 54));
  });

  it("valueFromMultiparameterAssignment: hour-only hash returns Time on 2000-01-01 base (P21)", () => {
    // Regression: was null before P21 because year defaulted to 0 and hit the short-circuit.
    expect(type.cast({ "4": 15 })).toEqual(timeUtc(2000, 1, 1, 15, 0, 0));
  });

  it("valueFromMultiparameterAssignment: hour and minute hash returns Time", () => {
    expect(type.cast({ "4": 15, "5": 30 })).toEqual(timeUtc(2000, 1, 1, 15, 30, 0));
  });

  it("valueFromMultiparameterAssignment: full hash with year/month/day/hour still works", () => {
    expect(type.cast({ "1": 2025, "2": 6, "3": 15, "4": 10, "5": 20 })).toEqual(
      timeUtc(2025, 6, 15, 10, 20, 0),
    );
  });

  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = new Types.TimeType({ precision: 1 });
    const value = type.cast("1999-12-31T12:34:56.789-10:00");

    expect(type.serializeCastValue(value)).toEqual(type.serialize(value));
    expect(String(type.serializeCastValue(value))).toBe("2000-01-01T22:34:56.7Z");
  });

  it("sec_fraction reaches new_time as Time.utc's microsecond argument", () => {
    const result = type.cast("3:30:15.5 PM") as Temporal.Instant;
    expect(result.toString()).toBe("2000-01-01T15:30:15.0000005Z");
  });
});
