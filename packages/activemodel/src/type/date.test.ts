import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

/**
 * Test-only subclass that promotes Rails' private helpers to callable
 * methods so behavior can be asserted directly (e.g. new_date returns
 * nil for year 0 in a way `cast` can't reliably surface).
 */
class TestableDateType extends Types.DateType {
  publicFastStringToDate(value: string) {
    return this.fastStringToDate(value);
  }
  publicNewDate(year: number, month: number, day: number) {
    return this.newDate(year, month, day);
  }
}

describe("DateTest", () => {
  it("type cast date", () => {
    const type = new Types.DateType();
    const result = type.cast("2024-01-15");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2024);
  });

  it("returns correct year", () => {
    const type = new Types.DateType();
    const result = type.cast("2024-01-15");
    expect(result!.getUTCFullYear()).toBe(2024);
  });

  it("fast_string_to_date matches ISO YYYY-MM-DD only", () => {
    // Rails type/date.rb — ISO_DATE regex, fast path; everything else
    // falls through to fallback_string_to_date.
    const type = new TestableDateType();
    expect(type.publicFastStringToDate("2024-06-01")).not.toBeNull();
    expect(type.publicFastStringToDate("2024/06/01")).toBeNull();
    expect(type.publicFastStringToDate("2024-06-01T00:00:00")).toBeNull();
  });

  it("new_date preserves literal years 1–99 (not the JS Date.UTC 1900+ hack)", () => {
    const type = new TestableDateType();
    expect(type.publicNewDate(1, 1, 1)!.getUTCFullYear()).toBe(1);
    expect(type.cast("0001-01-01")!.getUTCFullYear()).toBe(1);
    expect(type.publicNewDate(99, 12, 31)!.getUTCFullYear()).toBe(99);
  });

  it("new_date rejects year 0 and day/month overflow", () => {
    // Mirrors Rails new_date, which returns nil when year is 0 or when
    // Date.new raises ArgumentError.
    const type = new TestableDateType();
    expect(type.publicNewDate(0, 1, 1)).toBeNull();
    expect(type.publicNewDate(2024, 13, 1)).toBeNull();
    expect(type.publicNewDate(2024, 2, 31)).toBeNull();
    const d = type.publicNewDate(2024, 6, 15);
    expect(d!.getUTCFullYear()).toBe(2024);
    expect(d!.getUTCMonth()).toBe(5);
    expect(d!.getUTCDate()).toBe(15);
  });

  it("cast falls through to fallback parser for non-ISO strings", () => {
    // Use an ISO-datetime form — deterministic across JS runtimes but
    // does not match the ISO_DATE fast path (which is YYYY-MM-DD only).
    const type = new Types.DateType();
    const d = type.cast("2024-06-01T00:00:00Z");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getUTCFullYear()).toBe(2024);
  });
});
