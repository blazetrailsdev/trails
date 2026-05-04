import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { plainDate } from "@blazetrails/activesupport/testing/temporal-helpers";
import { Types } from "../index.js";

describe("DateTest", () => {
  const type = new Types.DateType();

  it("type cast date", () => {
    const result = type.cast("2024-01-15");
    expect(result).toBeInstanceOf(Temporal.PlainDate);
    expect((result as Temporal.PlainDate).year).toBe(2024);
    expect((result as Temporal.PlainDate).month).toBe(1);
    expect((result as Temporal.PlainDate).day).toBe(15);
  });

  it("Temporal.PlainDate passthrough", () => {
    const original = plainDate("2024-01-15");
    expect(type.cast(original)).toBe(original);
  });

  it("has name 'date'", () => {
    expect(type.name).toBe("date");
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

  it("casts invalid string to null", () => {
    expect(type.cast("not-a-date")).toBe(null);
  });

  it("serialize returns ISO date string", () => {
    const d = plainDate("2024-01-15");
    expect(type.serialize(d)).toBe("2024-01-15");
  });

  it("serialize null returns null", () => {
    expect(type.serialize(null)).toBe(null);
  });

  it("PlainDateTime input extracts date (multiparameter support)", () => {
    const pdt = Temporal.PlainDateTime.from("2024-06-15T10:30:00");
    const result = type.cast(pdt);
    expect(result).toBeInstanceOf(Temporal.PlainDate);
    expect((result as Temporal.PlainDate).toString()).toBe("2024-06-15");
  });

  it("typeCastForSchema returns quoted string for PlainDate", () => {
    const d = plainDate("2024-01-15");
    expect(type.typeCastForSchema(d)).toBe('"2024-01-15"');
  });

  it("typeCastForSchema returns null for null", () => {
    expect(type.typeCastForSchema(null)).toBe("null");
  });

  it("newDate rejects out-of-range components (rescue nil parity)", () => {
    class Probe extends Types.DateType {
      newDateFor(y: number, m: number, d: number) {
        return this.newDate(y, m, d);
      }
    }
    const p = new Probe();
    expect(p.newDateFor(2024, 2, 30)).toBe(null);
    expect(p.newDateFor(0, 0, 0)).toBe(null);
    expect(p.newDateFor(2024, 1, 15)?.toString()).toBe("2024-01-15");
  });

  it("cast month-name string", () => {
    const result = type.cast("July 4, 2020");
    expect(result).toBeInstanceOf(Temporal.PlainDate);
    expect((result as Temporal.PlainDate).toString()).toBe("2020-07-04");
  });

  it("cast US-slash string", () => {
    const result = type.cast("7/4/2020");
    expect(result).toBeInstanceOf(Temporal.PlainDate);
    expect((result as Temporal.PlainDate).toString()).toBe("2020-07-04");
  });

  it("cast garbage string returns null", () => {
    expect(type.cast("garbage")).toBe(null);
  });

  it("cast ISO string still works (regression guard)", () => {
    const result = type.cast("2020-07-04");
    expect(result).toBeInstanceOf(Temporal.PlainDate);
    expect((result as Temporal.PlainDate).toString()).toBe("2020-07-04");
  });

  it("cast datetime with non-zero offset near midnight preserves local date", () => {
    // Ruby Date._parse("2020-07-04T00:30:00+02:00") reports mday=4, not the UTC day (3).
    const result = type.cast("2020-07-04T00:30:00+02:00");
    expect(result).toBeInstanceOf(Temporal.PlainDate);
    expect((result as Temporal.PlainDate).toString()).toBe("2020-07-04");
  });

  it("multiparameter hash missing day returns null (no defaults for DateType — P21 regression guard)", () => {
    // Date has no defaults; year/month/day are all required.
    const result = (type as any).valueFromMultiparameterAssignment({ 1: 2025, 2: 7 });
    expect(result).toBeNull();
  });

  it("multiparameter hash with all date parts returns PlainDate (P21 regression guard)", () => {
    const result = (type as any).valueFromMultiparameterAssignment({ 1: 2025, 2: 7, 3: 4 });
    expect(result).toBeInstanceOf(Temporal.PlainDate);
    expect((result as Temporal.PlainDate).toString()).toBe("2025-07-04");
  });
});
