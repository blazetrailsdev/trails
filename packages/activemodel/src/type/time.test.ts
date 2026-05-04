import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { plainTime } from "@blazetrails/activesupport/testing/temporal-helpers";
import { Types } from "../index.js";

describe("TimeTest", () => {
  const type = new Types.TimeType();

  it("type cast time", () => {
    expect(type.cast(null)).toBe(null);
    expect(type.cast("")).toBe(null);
    expect(type.cast("ABC")).toBe(null);

    const result = type.cast("19:45:54");
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    expect((result as Temporal.PlainTime).hour).toBe(19);
    expect((result as Temporal.PlainTime).minute).toBe(45);
    expect((result as Temporal.PlainTime).second).toBe(54);
  });

  it("extracts time from full datetime string", () => {
    const result = type.cast("2015-02-09T19:45:54+00:00");
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    expect((result as Temporal.PlainTime).hour).toBe(19);
  });

  it("microsecond precision is preserved through cast", () => {
    const result = type.cast("14:23:55.123456");
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    const t = result as Temporal.PlainTime;
    expect(t.millisecond).toBe(123);
    expect(t.microsecond).toBe(456);
  });

  it("Temporal.PlainTime passthrough", () => {
    const original = plainTime("14:23:55.123456");
    expect(type.cast(original)).toBe(original);
  });

  it("has name 'time'", () => {
    expect(type.name).toBe("time");
  });

  it("casts undefined to null", () => {
    expect(type.cast(undefined)).toBe(null);
  });

  it("serialize returns microsecond ISO string", () => {
    const t = plainTime("14:23:55.123456");
    expect(type.serialize(t)).toBe("14:23:55.123456");
  });

  it("serialize null returns null", () => {
    expect(type.serialize(null)).toBe(null);
  });

  it("serialize respects column precision", () => {
    const t = new Types.TimeType({ precision: 3 });
    const pt = plainTime("14:23:55.123456");
    expect(t.serialize(pt)).toBe("14:23:55.123");
  });

  it("PlainDateTime input extracts time (multiparameter support)", () => {
    const pdt = Temporal.PlainDateTime.from("2024-06-15T14:23:55");
    const result = type.cast(pdt);
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    expect((result as Temporal.PlainTime).hour).toBe(14);
    expect((result as Temporal.PlainTime).minute).toBe(23);
  });

  it("user input in time zone wraps plain time in given zone", () => {
    const result = type.userInputInTimeZone("14:30:00", "America/New_York");
    expect(result).toBeInstanceOf(Temporal.ZonedDateTime);
    expect((result as Temporal.ZonedDateTime).hour).toBe(14);
    expect((result as Temporal.ZonedDateTime).timeZoneId).toBe("America/New_York");
  });

  it("user input in time zone returns null for null", () => {
    expect(type.userInputInTimeZone(null)).toBe(null);
  });

  it("user input in time zone passthrough for ZonedDateTime", () => {
    const zdt = Temporal.ZonedDateTime.from("2024-01-15T14:30:00[America/New_York]");
    expect(type.userInputInTimeZone(zdt)).toBe(zdt);
  });

  it("cast 3pm returns PlainTime 15:00", () => {
    const result = type.cast("3pm");
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    expect((result as Temporal.PlainTime).hour).toBe(15);
    expect((result as Temporal.PlainTime).minute).toBe(0);
  });

  it("cast 3:30 PM returns PlainTime 15:30", () => {
    const result = type.cast("3:30 PM");
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    expect((result as Temporal.PlainTime).hour).toBe(15);
    expect((result as Temporal.PlainTime).minute).toBe(30);
  });

  it("cast 15:30 returns PlainTime 15:30", () => {
    const result = type.cast("15:30");
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    expect((result as Temporal.PlainTime).hour).toBe(15);
    expect((result as Temporal.PlainTime).minute).toBe(30);
  });

  it("cast garbage string returns null", () => {
    expect(type.cast("garbage")).toBe(null);
  });

  it("cast ISO time string still works (regression guard)", () => {
    const result = type.cast("19:45:54");
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    expect((result as Temporal.PlainTime).hour).toBe(19);
  });

  it("cast datetime with non-zero offset preserves local time (not UTC-normalized)", () => {
    // Ruby Time._parse reports the local hour written in the string, not the UTC hour.
    const result = type.cast("2015-02-09T19:45:54+02:00");
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    expect((result as Temporal.PlainTime).hour).toBe(19);
  });

  it("valueFromMultiparameterAssignment: hour-only hash returns Time on 2000-01-01 base (P21)", () => {
    // Regression: was null before P21 because year defaulted to 0 and hit the short-circuit.
    const result = (type as any).valueFromMultiparameterAssignment({ "4": 15 });
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    expect((result as Temporal.PlainTime).hour).toBe(15);
    expect((result as Temporal.PlainTime).minute).toBe(0);
  });

  it("valueFromMultiparameterAssignment: hour and minute hash returns Time", () => {
    const result = (type as any).valueFromMultiparameterAssignment({ "4": 15, "5": 30 });
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    expect((result as Temporal.PlainTime).hour).toBe(15);
    expect((result as Temporal.PlainTime).minute).toBe(30);
  });

  it("valueFromMultiparameterAssignment: full hash with year/month/day/hour still works", () => {
    const result = (type as any).valueFromMultiparameterAssignment({ "1": 2025, "2": 6, "3": 15, "4": 10, "5": 20 });
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    expect((result as Temporal.PlainTime).hour).toBe(10);
  });
});
