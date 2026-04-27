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
});
