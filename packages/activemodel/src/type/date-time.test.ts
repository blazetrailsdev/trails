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

  it("string without offset produces PlainDateTime", () => {
    const result = type.cast("2024-01-15T10:30:00");
    expect(result).toBeInstanceOf(Temporal.PlainDateTime);
    const pdt = result as Temporal.PlainDateTime;
    expect(pdt.hour).toBe(10);
    expect(pdt.minute).toBe(30);
  });

  it("Postgres wire format (space separator, short offset) produces Instant", () => {
    const result = type.cast("2026-04-26 14:23:55.123456+00");
    expect(result).toBeInstanceOf(Temporal.Instant);
    const i = result as Temporal.Instant;
    expect(i.toString({ smallestUnit: "microsecond" })).toBe("2026-04-26T14:23:55.123456Z");
  });

  it("Postgres naive wire format produces PlainDateTime", () => {
    const result = type.cast("2026-04-26 14:23:55.123456");
    expect(result).toBeInstanceOf(Temporal.PlainDateTime);
    const pdt = result as Temporal.PlainDateTime;
    expect(pdt.microsecond).toBe(456);
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

  it("Temporal.PlainDateTime passthrough", () => {
    const original = plainDateTime("2026-04-26T14:23:55.123456");
    expect(type.cast(original)).toBe(original);
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

  it("serialize returns microsecond ISO string for PlainDateTime", () => {
    const pdt = plainDateTime("2026-04-26T14:23:55.123456");
    expect(type.serialize(pdt)).toBe("2026-04-26T14:23:55.123456");
  });

  it("serialize null returns null", () => {
    expect(type.serialize(null)).toBe(null);
  });

  it("serialize respects column precision", () => {
    const t = new Types.DateTimeType({ precision: 3 });
    const i = instant("2026-04-26T14:23:55.123456Z");
    expect(t.serialize(i)).toBe("2026-04-26T14:23:55.123Z");
  });

  it("PlainDateTime input from multiparameter is accepted", () => {
    const pdt = Temporal.PlainDateTime.from("2026-04-26T14:23:55");
    expect(type.cast(pdt)).toBe(pdt);
  });
});
