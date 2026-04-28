import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { instant, plainDateTime } from "@blazetrails/activesupport/testing/temporal-helpers";
import { Types } from "../index.js";

describe("DateTimeTest", () => {
  const type = new Types.DateTimeType();

  it("type cast datetime and timestamp", () => {
    const result = type.cast("2024-01-15T10:30:00Z");
    expect(result).toBeInstanceOf(Temporal.Instant);
    expect((result as Temporal.Instant).epochMilliseconds).toBe(
      Temporal.Instant.from("2024-01-15T10:30:00Z").epochMilliseconds,
    );
  });

  it("string with offset produces Instant", () => {
    const result = type.cast("2024-01-15T10:30:00+05:00");
    expect(result).toBeInstanceOf(Temporal.Instant);
    expect((result as Temporal.Instant).epochMilliseconds).toBe(
      Temporal.Instant.from("2024-01-15T05:30:00Z").epochMilliseconds,
    );
  });

  it("string without offset produces Instant (treated as UTC)", () => {
    const result = type.cast("2024-01-15T10:30:00") as Temporal.Instant;
    expect(result).toBeInstanceOf(Temporal.Instant);
    const zdt = result.toZonedDateTimeISO("UTC");
    expect(zdt.hour).toBe(10);
    expect(zdt.minute).toBe(30);
  });

  it("Postgres wire format (space separator, short offset) produces Instant", () => {
    const result = type.cast("2026-04-26 14:23:55.123456+00");
    expect(result).toBeInstanceOf(Temporal.Instant);
    const i = result as Temporal.Instant;
    expect(i.toString({ smallestUnit: "microsecond" })).toBe("2026-04-26T14:23:55.123456Z");
  });

  it("Postgres naive wire format produces Instant (treated as UTC)", () => {
    const result = type.cast("2026-04-26 14:23:55.123456") as Temporal.Instant;
    expect(result).toBeInstanceOf(Temporal.Instant);
    expect(result.toZonedDateTimeISO("UTC").microsecond).toBe(456);
  });

  it("microsecond precision is preserved through cast", () => {
    const result = type.cast("2026-04-26T14:23:55.123456Z");
    expect(result).toBeInstanceOf(Temporal.Instant);
    const zdt = (result as Temporal.Instant).toZonedDateTimeISO("UTC");
    expect(zdt.millisecond).toBe(123);
    expect(zdt.microsecond).toBe(456);
  });

  it("Temporal.Instant passthrough", () => {
    const original = instant("2026-04-26T14:23:55.123456Z");
    expect(type.cast(original)).toBe(original);
  });

  it("Temporal.PlainDateTime is converted to Instant (treated as UTC)", () => {
    const pdt = plainDateTime("2026-04-26T14:23:55.123456");
    const result = type.cast(pdt) as Temporal.Instant;
    expect(result).toBeInstanceOf(Temporal.Instant);
    expect(result.toZonedDateTimeISO("UTC").microsecond).toBe(456);
  });

  it("has name 'datetime'", () => {
    expect(type.name).toBe("datetime");
  });

  it("casts null to null", () => {
    expect(type.cast(null)).toBe(null);
  });

  it("casts undefined to null", () => {
    expect(type.cast(undefined)).toBe(null);
  });

  it("casts empty string to null", () => {
    expect(type.cast("")).toBe(null);
  });

  it("hash with wrong keys", () => {
    expect(type.cast("not-a-date")).toBe(null);
  });

  it("serialize returns microsecond ISO string for Instant", () => {
    const i = instant("2026-04-26T14:23:55.123456Z");
    expect(type.serialize(i)).toBe("2026-04-26T14:23:55.123456Z");
  });

  it("serialize returns UTC ISO string for PlainDateTime (cast to Instant first)", () => {
    const pdt = plainDateTime("2026-04-26T14:23:55.123456");
    expect(type.serialize(pdt)).toBe("2026-04-26T14:23:55.123456Z");
  });

  it("serialize null returns null", () => {
    expect(type.serialize(null)).toBe(null);
  });

  it("serialize respects column precision", () => {
    const t = new Types.DateTimeType({ precision: 3 });
    const i = instant("2026-04-26T14:23:55.123456Z");
    expect(t.serialize(i)).toBe("2026-04-26T14:23:55.123Z");
  });

  it("PlainDateTime input is converted to Instant (multiparameter support)", () => {
    const pdt = Temporal.PlainDateTime.from("2026-04-26T14:23:55");
    const result = type.cast(pdt);
    expect(result).toBeInstanceOf(Temporal.Instant);
  });
});
