import { describe, it, expect } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { BigDecimal } from "@blazetrails/activesupport";
import { mysql2Client } from "./mysql2-client.js";

type TypeCast = (field: unknown, next: () => unknown) => unknown;

const config: { typeCast?: TypeCast } = {};
const client = mysql2Client({ config });
client.queryOptions.databaseTimezone = "utc";
const temporalTypeCast: TypeCast = (field, next) => config.typeCast!(field, next);

function field(type: string, value: string | null) {
  return { type, string: () => value };
}
const next = () => "next-called";

describe("mysql2Client cast", () => {
  it("wraps the typeCast the caller configured, and only once", () => {
    const userConfig: { typeCast?: TypeCast } = { typeCast: () => "from the caller" };
    const wrapped = mysql2Client({ config: userConfig });
    const installed = userConfig.typeCast;
    expect(mysql2Client(wrapped)).toBe(wrapped);
    expect(userConfig.typeCast).toBe(installed);
    expect(userConfig.typeCast!(field("VARCHAR", "x"), next)).toBe("from the caller");
  });

  it("reads a DATETIME in the zone queryOptions.databaseTimezone names", () => {
    const local: { typeCast?: TypeCast } = {};
    mysql2Client({ config: local }).queryOptions.databaseTimezone = "local";
    const naive = Temporal.PlainDateTime.from("2026-04-27T14:23:55");
    const instantOf = (cast: TypeCast): bigint =>
      (cast(field("DATETIME", "2026-04-27 14:23:55"), next) as RubyTime)
        .getutc()
        .toZonedDateTime()
        .toInstant().epochNanoseconds;
    expect(instantOf(config.typeCast!)).toBe(
      naive.toZonedDateTime("UTC").toInstant().epochNanoseconds,
    );
    expect(instantOf(local.typeCast!)).toBe(
      naive.toZonedDateTime(Temporal.Now.timeZoneId()).toInstant().epochNanoseconds,
    );
  });

  describe("TIMESTAMP", () => {
    it("parses a UTC timestamp to Temporal.Instant", () => {
      const result = temporalTypeCast(field("TIMESTAMP", "2026-04-27 14:23:55.123456"), next);
      expect(result).toBeInstanceOf(RubyTime);
      expect((result as RubyTime).getutc().toZonedDateTime().toInstant().epochMilliseconds).toBe(
        Temporal.Instant.from("2026-04-27T14:23:55.123456Z").epochMilliseconds,
      );
    });

    it("preserves microsecond precision", () => {
      const result = temporalTypeCast(field("TIMESTAMP", "2026-01-01 00:00:00.000001"), next);
      expect(result).toBeInstanceOf(RubyTime);
      expect(
        (result as RubyTime).getutc().toZonedDateTime().toInstant().epochNanoseconds % 1000000000n,
      ).toBe(1000n);
    });

    it("returns null for NULL", () => {
      expect(temporalTypeCast(field("TIMESTAMP", null), next)).toBeNull();
    });

    it("returns null for zero timestamp '0000-00-00 00:00:00'", () => {
      expect(temporalTypeCast(field("TIMESTAMP", "0000-00-00 00:00:00"), next)).toBeNull();
    });

    it("handles TIMESTAMP2 (binary protocol fractional variant)", () => {
      const result = temporalTypeCast(field("TIMESTAMP2", "2026-04-27 14:23:55.123456"), next);
      expect(result).toBeInstanceOf(RubyTime);
    });
  });

  describe("DATETIME", () => {
    it("parses DATETIME to Temporal.Instant (UTC)", () => {
      const result = temporalTypeCast(field("DATETIME", "2026-04-27 14:23:55.123456"), next);
      expect(result).toBeInstanceOf(RubyTime);
      const zdt = (result as RubyTime)
        .getutc()
        .toZonedDateTime()
        .toInstant()
        .toZonedDateTimeISO("UTC");
      expect(zdt.millisecond).toBe(123);
      expect(zdt.microsecond).toBe(456);
    });

    it("returns null for zero-date", () => {
      expect(temporalTypeCast(field("DATETIME", "0000-00-00 00:00:00"), next)).toBeNull();
    });

    it("handles DATETIME2 (binary protocol fractional variant)", () => {
      const result = temporalTypeCast(field("DATETIME2", "2026-04-27 00:00:00"), next);
      expect(result).toBeInstanceOf(RubyTime);
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
    it("delegates TIME to the driver default so Type::Time casts the string", () => {
      expect(temporalTypeCast(field("TIME", "14:23:55.123456"), next)).toBe("next-called");
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

  describe("DECIMAL", () => {
    it("casts a scaled NEWDECIMAL to BigDecimal", () => {
      const result = temporalTypeCast(field("NEWDECIMAL", "1.10"), () => "1.10");
      expect(result).toBeInstanceOf(BigDecimal);
      expect((result as BigDecimal).toString()).toBe(new BigDecimal("1.10").toString());
    });

    it("casts a scale-0 NEWDECIMAL to an integer", () => {
      expect(temporalTypeCast(field("NEWDECIMAL", "42"), () => "42")).toBe(42);
      expect(temporalTypeCast(field("DECIMAL", "-7"), () => "-7")).toBe(-7);
    });

    it("keeps a scale-0 NEWDECIMAL beyond the safe range exact", () => {
      expect(
        temporalTypeCast(field("NEWDECIMAL", "9007199254740993"), () => "9007199254740993"),
      ).toBe(9007199254740993n);
    });

    it("returns null for NULL", () => {
      expect(temporalTypeCast(field("NEWDECIMAL", null), () => null)).toBeNull();
    });
  });

  describe("LONGLONG", () => {
    it("passes a safe-range value through as a number", () => {
      expect(temporalTypeCast(field("LONGLONG", "42"), () => 42)).toBe(42);
    });

    it("casts the big-number string the driver returns to a bigint", () => {
      expect(
        temporalTypeCast(field("LONGLONG", "9007199254740993"), () => "9007199254740993"),
      ).toBe(9007199254740993n);
    });
  });
});
