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
});
