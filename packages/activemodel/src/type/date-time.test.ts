import { describe, it, expect } from "vitest";
import { Temporal, strftime } from "@blazetrails/date";
import { instant, plainDateTime } from "@blazetrails/activesupport/testing/temporal-helpers";
import { TimeZone, setZoneDefault, toS } from "@blazetrails/activesupport";
import { Types } from "../index.js";

describe("DateTimeTest", () => {
  const type = new Types.DateTimeType();

  it("type cast datetime and timestamp", () => {
    const type = new Types.DateTimeType();
    expect(type.cast(null)).toBeNull();
    expect(type.cast("")).toBeNull();
    expect(type.cast("  ")).toBeNull();
    expect(type.cast("ABC")).toBeNull();
    expect(type.cast(" ".repeat(129))).toBeNull();

    const datetimeString = strftime(Temporal.Now.instant(), "%FT%T");
    expect(strftime(type.cast(datetimeString) as Temporal.Instant, "%FT%T")).toBe(datetimeString);
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

  it("string to time with timezone", () => {
    for (const zone of ["UTC", "US/Eastern"]) {
      setZoneDefault(TimeZone.find(zone));
      try {
        const t = new Types.DateTimeType();
        expect((t.cast("Wed, 04 Sep 2013 03:00:00 EAT") as Temporal.Instant).toString()).toBe(
          "2013-09-04T00:00:00Z",
        );
      } finally {
        setZoneDefault(null);
      }
    }
  });

  it("hash to time", () => {
    const type = new Types.DateTimeType();
    expect(type.cast({ 1: 2018, 2: 10, 3: 15 })).toEqual(
      Temporal.Instant.from("2018-10-15T00:00:00Z"),
    );
  });

  it("hash with wrong keys", () => {
    const type = new Types.DateTimeType();
    let error: unknown;
    expect(() => {
      try {
        type.cast({ ":a": 1 });
      } catch (e) {
        error = e;
        throw e;
      }
    }).toThrow(expect.objectContaining({ name: "ArgumentError" }));
    // MRI 3.3: `"Provided hash #{{ a: 1 }} ..."` renders the hash as `{:a=>1}`
    // — the Symbol-key rendering `inspect.trails.test.ts` pins against MRI.
    expect((error as Error).message).toBe(
      `Provided hash ${toS({ ":a": 1 })} doesn't contain necessary keys: [1, 2, 3]`,
    );
  });

  it("serialize returns the cast Instant (not a SQL string)", () => {
    const i = instant("2026-04-26T14:23:55.123456Z");
    expect((type.serialize(i) as Temporal.Instant).toString()).toBe("2026-04-26T14:23:55.123456Z");
  });

  it("serialize returns the cast Instant for PlainDateTime (cast to Instant first)", () => {
    const pdt = plainDateTime("2026-04-26T14:23:55.123456");
    expect((type.serialize(pdt) as Temporal.Instant).toString()).toBe(
      "2026-04-26T14:23:55.123456Z",
    );
  });

  it("serialize null returns null", () => {
    expect(type.serialize(null)).toBe(null);
  });

  it("serialize respects column precision", () => {
    const t = new Types.DateTimeType({ precision: 3 });
    const i = instant("2026-04-26T14:23:55.123456Z");
    expect((t.serialize(i) as Temporal.Instant).toString()).toBe("2026-04-26T14:23:55.123Z");
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

  it("cast accepts numeric-keyed multiparameter hash and returns Temporal.Instant", () => {
    const type = new Types.DateTimeType();
    const result = type.cast({ 1: 2024, 2: 6, 3: 15, 4: 10, 5: 30 });
    expect(result).toBeInstanceOf(Temporal.Instant);
    const zdt = (result as Temporal.Instant).toZonedDateTimeISO("UTC");
    expect(zdt.year).toBe(2024);
    expect(zdt.month).toBe(6);
    expect(zdt.day).toBe(15);
    expect(zdt.hour).toBe(10);
    expect(zdt.minute).toBe(30);
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
  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = new Types.DateTimeType({ precision: 1 });
    const value = type.cast("1999-12-31 12:34:56.789 -1000");

    expect(type.serialize(value)).toEqual(type.serializeCastValue(value));
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
