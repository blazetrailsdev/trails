import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { temporalTypeCast } from "./temporal-type-cast.js";

// mysql2's createTypecastField sets field.type to the string name, not a numeric OID.
function field(type: string, value: string | null) {
  return { type, string: () => value };
}
const next = () => "next-called";

describe("temporalTypeCast", () => {
  describe("TIMESTAMP", () => {
    it("parses a UTC timestamp to Temporal.Instant", () => {
      const result = temporalTypeCast(field("TIMESTAMP", "2026-04-27 14:23:55.123456"), next);
      expect(result).toBeInstanceOf(Temporal.Instant);
      expect((result as Temporal.Instant).epochMilliseconds).toBe(
        Temporal.Instant.from("2026-04-27T14:23:55.123456Z").epochMilliseconds,
      );
    });

    it("preserves microsecond precision", () => {
      const result = temporalTypeCast(field("TIMESTAMP", "2026-01-01 00:00:00.000001"), next);
      expect(result).toBeInstanceOf(Temporal.Instant);
      expect((result as Temporal.Instant).epochNanoseconds % 1000000000n).toBe(1000n);
    });

    it("returns null for NULL", () => {
      expect(temporalTypeCast(field("TIMESTAMP", null), next)).toBeNull();
    });

    it("returns null for zero timestamp '0000-00-00 00:00:00'", () => {
      expect(temporalTypeCast(field("TIMESTAMP", "0000-00-00 00:00:00"), next)).toBeNull();
    });

    it("handles TIMESTAMP2 (binary protocol fractional variant)", () => {
      const result = temporalTypeCast(field("TIMESTAMP2", "2026-04-27 14:23:55.123456"), next);
      expect(result).toBeInstanceOf(Temporal.Instant);
    });
  });

  describe("DATETIME", () => {
    it("parses DATETIME to Temporal.Instant (UTC)", () => {
      const result = temporalTypeCast(field("DATETIME", "2026-04-27 14:23:55.123456"), next);
      expect(result).toBeInstanceOf(Temporal.Instant);
      const zdt = (result as Temporal.Instant).toZonedDateTimeISO("UTC");
      expect(zdt.millisecond).toBe(123);
      expect(zdt.microsecond).toBe(456);
    });

    it("returns null for zero-date", () => {
      expect(temporalTypeCast(field("DATETIME", "0000-00-00 00:00:00"), next)).toBeNull();
    });

    it("handles DATETIME2 (binary protocol fractional variant)", () => {
      const result = temporalTypeCast(field("DATETIME2", "2026-04-27 00:00:00"), next);
      expect(result).toBeInstanceOf(Temporal.Instant);
    });

    it("returns null for NULL", () => {
      expect(temporalTypeCast(field("DATETIME", null), next)).toBeNull();
    });
  });

  describe("DATE", () => {
    it("parses DATE to Temporal.PlainDate", () => {
      const result = temporalTypeCast(field("DATE", "2026-04-27"), next);
      expect(result).toBeInstanceOf(Temporal.PlainDate);
      expect((result as Temporal.PlainDate).toString()).toBe("2026-04-27");
    });

    it("handles NEWDATE (DATE-only wire type) as Temporal.PlainDate", () => {
      const result = temporalTypeCast(field("NEWDATE", "2026-04-27"), next);
      expect(result).toBeInstanceOf(Temporal.PlainDate);
      expect((result as Temporal.PlainDate).toString()).toBe("2026-04-27");
    });

    it("returns null for zero-date", () => {
      expect(temporalTypeCast(field("DATE", "0000-00-00"), next)).toBeNull();
    });

    it("returns null for NULL", () => {
      expect(temporalTypeCast(field("DATE", null), next)).toBeNull();
    });
  });

  describe("TIME", () => {
    it("parses TIME to Temporal.PlainTime", () => {
      const result = temporalTypeCast(field("TIME", "14:23:55.123456"), next);
      expect(result).toBeInstanceOf(Temporal.PlainTime);
      const pt = result as Temporal.PlainTime;
      expect(pt.hour).toBe(14);
      expect(pt.minute).toBe(23);
      expect(pt.second).toBe(55);
    });

    it("returns null for NULL", () => {
      expect(temporalTypeCast(field("TIME", null), next)).toBeNull();
    });
  });

  describe("non-temporal types", () => {
    it("delegates to next() for VARCHAR", () => {
      expect(temporalTypeCast(field("VARCHAR", "hello"), next)).toBe("next-called");
    });

    it("delegates to next() for LONG", () => {
      expect(temporalTypeCast(field("LONG", "42"), next)).toBe("next-called");
    });
  });
});
