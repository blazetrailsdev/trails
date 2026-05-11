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

  it("valueFromMultiparameterAssignment reconstructs an Instant from {1..6}", () => {
    class Probe extends Types.DateTimeType {
      call(values: Record<number, unknown>) {
        return this.valueFromMultiparameterAssignment(values);
      }
    }
    const result = new Probe().call({ 1: 2024, 2: 1, 3: 2, 4: 12, 5: 30, 6: 0 });
    expect(result).toBeInstanceOf(Temporal.Instant);
  });

  it("valueFromMultiparameterAssignment throws when keys 1/2/3 missing", () => {
    class Probe extends Types.DateTimeType {
      call(values: Record<number, unknown>) {
        return this.valueFromMultiparameterAssignment(values);
      }
    }
    expect(() => new Probe().call({ 1: 2024, 4: 12 })).toThrow(
      expect.objectContaining({ name: "ArgumentError" }),
    );
  });

  it("valueFromMultiparameterAssignment defaults hour/minute to 0 when only date parts given (P21)", () => {
    class Probe extends Types.DateTimeType {
      call(values: Record<number, unknown>) {
        return this.valueFromMultiparameterAssignment(values);
      }
    }
    const result = new Probe().call({ 1: 2025, 2: 7, 3: 4 }) as Temporal.Instant;
    expect(result).toBeInstanceOf(Temporal.Instant);
    const zdt = result.toZonedDateTimeISO("UTC");
    expect(zdt.year).toBe(2025);
    expect(zdt.month).toBe(7);
    expect(zdt.day).toBe(4);
    expect(zdt.hour).toBe(0);
    expect(zdt.minute).toBe(0);
  });
});

describe("DateTimeType#isChanged", () => {
  // 1_000_000n ns = exactly 1ms from epoch — a clean boundary for all precision tests.
  const MS1 = 1_000_000n;

  it("two identical Temporal.Instant references are unchanged", () => {
    const t = new Types.DateTimeType();
    const a = Temporal.Instant.fromEpochNanoseconds(MS1);
    expect(t.isChanged(a, a)).toBe(false);
  });

  it("two distinct Temporal.Instant objects with same epoch are unchanged (precision=null)", () => {
    const t = new Types.DateTimeType();
    const a = Temporal.Instant.fromEpochNanoseconds(MS1);
    const b = Temporal.Instant.fromEpochNanoseconds(MS1);
    expect(t.isChanged(a, b)).toBe(false);
  });

  it("instants differing only in sub-microsecond nanoseconds are unchanged (precision=null defaults 6)", () => {
    const t = new Types.DateTimeType();
    const a = Temporal.Instant.fromEpochNanoseconds(MS1); // 1_000_000ns = 1000μs exactly
    const b = Temporal.Instant.fromEpochNanoseconds(MS1 + 999n); // 1000μs + 999ns (same μs bucket)
    expect(t.isChanged(a, b)).toBe(false);
  });

  it("instants differing by one full microsecond are changed (precision=null)", () => {
    const t = new Types.DateTimeType();
    const a = Temporal.Instant.fromEpochNanoseconds(MS1);
    const b = Temporal.Instant.fromEpochNanoseconds(MS1 + 1000n); // next μs bucket
    expect(t.isChanged(a, b)).toBe(true);
  });

  it("instants differing only in sub-millisecond are unchanged (precision=3)", () => {
    const t = new Types.DateTimeType({ precision: 3 });
    const a = Temporal.Instant.fromEpochNanoseconds(MS1); // exactly 1ms
    const b = Temporal.Instant.fromEpochNanoseconds(MS1 + 999_000n); // 1ms + 999μs (same ms bucket)
    expect(t.isChanged(a, b)).toBe(false);
  });

  it("instants differing by one full millisecond are changed (precision=3)", () => {
    const t = new Types.DateTimeType({ precision: 3 });
    const a = Temporal.Instant.fromEpochNanoseconds(MS1);
    const b = Temporal.Instant.fromEpochNanoseconds(MS1 + 1_000_000n); // next ms bucket
    expect(t.isChanged(a, b)).toBe(true);
  });

  it("instants differing only in sub-second are unchanged (precision=0)", () => {
    const t = new Types.DateTimeType({ precision: 0 });
    // Use 1s boundary + 999ms — both in the same second bucket
    const a = Temporal.Instant.fromEpochNanoseconds(1_000_000_000n);
    const b = Temporal.Instant.fromEpochNanoseconds(1_000_000_000n + 999_999_999n);
    expect(t.isChanged(a, b)).toBe(false);
  });

  it("instants differing by one full nanosecond are changed (precision=9)", () => {
    const t = new Types.DateTimeType({ precision: 9 });
    const a = Temporal.Instant.fromEpochNanoseconds(MS1);
    const b = Temporal.Instant.fromEpochNanoseconds(MS1 + 1n);
    expect(t.isChanged(a, b)).toBe(true);
  });

  it("non-Instant values fall back to reference equality", () => {
    const t = new Types.DateTimeType();
    expect(t.isChanged(null, null)).toBe(false);
    expect(t.isChanged(null, "2024-01-01")).toBe(true);
  });
});
