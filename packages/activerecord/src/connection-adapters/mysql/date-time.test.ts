import { Temporal } from "@blazetrails/activesupport/temporal";
import { DateInfinity, DateNegativeInfinity } from "@blazetrails/activemodel";
import { describe, expect, it } from "vitest";
import { DateTime } from "./date-time.js";

describe("MySQL::DateTime", () => {
  const type = new DateTime();

  it("serialize emits YYYY-MM-DD HH:MM:SS.ffffff without T or Z", () => {
    const instant = Temporal.Instant.from("2026-05-08T14:32:00.123456Z");
    expect(type.serialize(instant)).toBe("2026-05-08 14:32:00.123456");
  });

  it("serialize zero-pads years below 1000", () => {
    // Realistic case: year 44 CE — ensure 4-digit year, not 2-digit (MySQL
    // 2-digit-year rules would misinterpret "44-01-01 00:00:00")
    const instant = Temporal.Instant.from("0044-01-01T00:00:00Z");
    const result = type.serialize(instant) as string;
    expect(result).toMatch(/^0044-/);
  });

  it("serialize returns null for null input", () => {
    expect(type.serialize(null)).toBeNull();
  });

  it("serialize returns null for infinity sentinels (MySQL has no infinity timestamps)", () => {
    expect(type.serialize(DateInfinity)).toBeNull();
    expect(type.serialize(DateNegativeInfinity)).toBeNull();
  });

  it("serialize strips fractional seconds when microseconds are zero", () => {
    const instant = Temporal.Instant.from("2026-05-08T14:32:00Z");
    const result = type.serialize(instant) as string;
    expect(result).not.toContain("T");
    expect(result).not.toContain("Z");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });
});
