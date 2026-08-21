import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { plainDate } from "@blazetrails/activesupport/testing/temporal-helpers";
import { Types } from "../index.js";

describe("DateTest", () => {
  const type = new Types.DateType();

  it("type cast date", () => {
    expect(type.cast(null)).toBeNull();
    expect(type.cast("")).toBeNull();
    expect(type.cast(" ")).toBeNull();
    expect(type.cast("ABC")).toBeNull();
    expect(type.cast(" ".repeat(129))).toBeNull();

    const now = Temporal.Now.instant().toZonedDateTimeISO("UTC");
    const valuesHash = { 1: now.year, 2: now.month, 3: now.day };
    const dateString = now.toPlainDate().toString();
    expect((type.cast(dateString) as Temporal.PlainDate).toString()).toEqual(dateString);
    expect((type.cast(valuesHash) as Temporal.PlainDate).toString()).toEqual(dateString);
  });

  it("returns correct year", () => {
    const time = new Temporal.PlainDateTime(1, 1, 1).toZonedDateTime("UTC");
    const date = new Temporal.PlainDate(time.year, time.month, time.day);

    const valuesHashForMultiparameterAssignment = { 1: 1, 2: 1, 3: 1 };

    expect(type.cast(valuesHashForMultiparameterAssignment)).toEqual(date);
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

  it("serialize returns the cast PlainDate (not a SQL string)", () => {
    const d = plainDate("2024-01-15");
    expect((type.serialize(d) as Temporal.PlainDate).toString()).toBe("2024-01-15");
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

  it("cast slash string", () => {
    // ruby 3.3.11: Date._parse("7/4/2020", false) #=> {year: 2020, mon: 4, mday: 7}
    const result = type.cast("7/4/2020");
    expect(result).toBeInstanceOf(Temporal.PlainDate);
    expect((result as Temporal.PlainDate).toString()).toBe("2020-04-07");
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
