import { describe, it, expect } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { BigDecimal } from "@blazetrails/activesupport";
import { Mysql2, mysql2Client } from "./client.js";
import { defaultTimezone, setDefaultTimezone } from "../active-record.js";

type TypeCast = (field: unknown, next: () => unknown) => unknown;

const config: { typeCast?: TypeCast } = {};
const client = mysql2Client({ config });
client.queryOptions.databaseTimezone = "utc";
const typeCast: TypeCast = (field, next) => config.typeCast!(field, next);

function field(type: string, value: string | null) {
  return { type, name: "field", string: () => value };
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

  it("answers a Time in the zone queryOptions.databaseTimezone names, whatever the global default", () => {
    const local: { typeCast?: TypeCast } = {};
    mysql2Client({ config: local }).queryOptions.databaseTimezone = "local";
    const before = defaultTimezone();
    try {
      for (const zone of ["utc", "local"] as const) {
        setDefaultTimezone(zone);
        const utc = config.typeCast!(field("DATETIME", "2026-04-27 14:23:55"), next) as RubyTime;
        const loc = local.typeCast!(field("DATETIME", "2026-04-27 14:23:55"), next) as RubyTime;
        expect(utc.isUtc()).toBe(true);
        expect(loc.isUtc()).toBe(false);
      }
    } finally {
      setDefaultTimezone(before);
    }
  });

  it("reads a TIMESTAMP in the zone queryOptions.databaseTimezone names, as it reads a DATETIME", () => {
    const local: { typeCast?: TypeCast } = {};
    mysql2Client({ config: local }).queryOptions.databaseTimezone = "local";
    const timestamp = local.typeCast!(field("TIMESTAMP", "2026-04-27 14:23:55"), next) as RubyTime;
    const datetime = local.typeCast!(field("DATETIME", "2026-04-27 14:23:55"), next) as RubyTime;
    expect(timestamp.isUtc()).toBe(false);
    expect(timestamp.toF()).toBe(datetime.toF());
  });

  it("converts to queryOptions.applicationTimezone only when it is set", () => {
    const app: { typeCast?: TypeCast } = {};
    const raw = mysql2Client({ config: app });
    raw.queryOptions.databaseTimezone = "utc";
    raw.queryOptions.applicationTimezone = "local";
    const val = app.typeCast!(field("DATETIME", "2026-04-27 14:23:55"), next) as RubyTime;
    expect(val.isUtc()).toBe(false);
    expect(val.toF()).toBe(
      (config.typeCast!(field("DATETIME", "2026-04-27 14:23:55"), next) as RubyTime).toF(),
    );
  });

  it("raises Mysql2::Error from to_a for a non-zero date with a zero month or day", async () => {
    const invalid: { typeCast?: TypeCast } = {};
    for (const [type, value] of [
      ["DATETIME", "2026-00-27 14:23:55"],
      ["TIMESTAMP", "2026-04-00 14:23:55"],
      ["DATE", "2026-00-00"],
    ]) {
      const raw = mysql2Client({
        config: invalid,
        query: async () => (
          invalid.typeCast!({ ...field(type, value), name: "created_at" }, next),
          [[[null]], [{ name: "created_at" }]]
        ),
      });
      const result = (await raw.query("SELECT created_at FROM t"))!;
      expect(() => result.toA()).toThrow(Mysql2.Error as never);
      expect(() => result.toA()).toThrow(`Invalid date in field 'created_at': ${value}`);
    }
  });

  it("asks the driver for rows as arrays only when queryOptions.as is :array", async () => {
    const seen: unknown[] = [];
    const raw = mysql2Client({
      query: async (options: object) => (seen.push(options), [[], [{ name: "x" }]]),
    });
    await raw.query("SELECT 1");
    raw.queryOptions.as = "array";
    await raw.query("SELECT 1");
    expect(seen).toMatchObject([
      { sql: "SELECT 1", rowsAsArray: false },
      { sql: "SELECT 1", rowsAsArray: true },
    ]);
  });

  describe("TIMESTAMP", () => {
    it("parses a UTC timestamp to Temporal.Instant", () => {
      const result = typeCast(field("TIMESTAMP", "2026-04-27 14:23:55.123456"), next);
      expect(result).toBeInstanceOf(RubyTime);
      expect((result as RubyTime).getutc().toZonedDateTime().toInstant().epochMilliseconds).toBe(
        Temporal.Instant.from("2026-04-27T14:23:55.123456Z").epochMilliseconds,
      );
    });

    it("preserves microsecond precision", () => {
      const result = typeCast(field("TIMESTAMP", "2026-01-01 00:00:00.000001"), next);
      expect(result).toBeInstanceOf(RubyTime);
      expect(
        (result as RubyTime).getutc().toZonedDateTime().toInstant().epochNanoseconds % 1000000000n,
      ).toBe(1000n);
    });

    it("returns null for NULL", () => {
      expect(typeCast(field("TIMESTAMP", null), next)).toBeNull();
    });

    it("returns null for zero timestamp '0000-00-00 00:00:00'", () => {
      expect(typeCast(field("TIMESTAMP", "0000-00-00 00:00:00"), next)).toBeNull();
    });
  });

  describe("DATETIME", () => {
    it("parses DATETIME to Temporal.Instant (UTC)", () => {
      const result = typeCast(field("DATETIME", "2026-04-27 14:23:55.123456"), next);
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
      expect(typeCast(field("DATETIME", "0000-00-00 00:00:00"), next)).toBeNull();
    });

    it("returns null for NULL", () => {
      expect(typeCast(field("DATETIME", null), next)).toBeNull();
    });
  });

  describe("DATE", () => {
    it("parses DATE to Temporal.PlainDate", () => {
      const result = typeCast(field("DATE", "2026-04-27"), next);
      expect(result).toBeInstanceOf(Temporal.PlainDate);
      expect((result as Temporal.PlainDate).toString()).toBe("2026-04-27");
    });

    it("handles NEWDATE (DATE-only wire type) as Temporal.PlainDate", () => {
      const result = typeCast(field("NEWDATE", "2026-04-27"), next);
      expect(result).toBeInstanceOf(Temporal.PlainDate);
      expect((result as Temporal.PlainDate).toString()).toBe("2026-04-27");
    });

    it("returns null for zero-date", () => {
      expect(typeCast(field("DATE", "0000-00-00"), next)).toBeNull();
    });

    it("returns null for NULL", () => {
      expect(typeCast(field("DATE", null), next)).toBeNull();
    });
  });

  describe("TIME", () => {
    it("answers a Time on 2000-01-01 in the database timezone", () => {
      const result = typeCast(field("TIME", "14:23:55.123456"), next) as RubyTime;
      expect(result.isUtc()).toBe(true);
      expect([result.year, result.month, result.day]).toEqual([2000, 1, 1]);
      expect([result.hour, result.min, result.sec, result.usec]).toEqual([14, 23, 55, 123456]);
    });

    it("returns null for a value outside hh:mm:ss", () => {
      expect(typeCast(field("TIME", "838:59:59"), next)).toBeNull();
      expect(typeCast(field("TIME", "-01:00:00"), next)).toBeNull();
    });
  });

  describe("non-temporal types", () => {
    it("delegates to next() for VARCHAR", () => {
      expect(typeCast(field("VARCHAR", "hello"), next)).toBe("next-called");
    });

    it("takes the driver's number for LONG and DOUBLE", () => {
      expect(typeCast(field("LONG", "42"), () => 42)).toBe(42);
      expect(typeCast(field("DOUBLE", "1.5"), () => 1.5)).toBe(1.5);
    });
  });

  describe("DECIMAL", () => {
    it("casts a scaled NEWDECIMAL to BigDecimal", () => {
      const result = typeCast(field("NEWDECIMAL", "1.10"), () => "1.10");
      expect(result).toBeInstanceOf(BigDecimal);
      expect((result as BigDecimal).toString()).toBe(new BigDecimal("1.10").toString());
    });

    it("casts a scale-0 NEWDECIMAL to an integer", () => {
      expect(typeCast(field("NEWDECIMAL", "42"), () => "42")).toBe(42);
      expect(typeCast(field("DECIMAL", "-7"), () => "-7")).toBe(-7);
    });

    it("keeps a scale-0 NEWDECIMAL beyond the safe range exact", () => {
      expect(typeCast(field("NEWDECIMAL", "9007199254740993"), () => "9007199254740993")).toBe(
        9007199254740993n,
      );
    });

    it("returns null for NULL", () => {
      expect(typeCast(field("NEWDECIMAL", null), () => null)).toBeNull();
    });
  });

  describe("LONGLONG", () => {
    it("passes a safe-range value through as a number", () => {
      expect(typeCast(field("LONGLONG", "42"), () => 42)).toBe(42);
    });

    it("casts the big-number string the driver returns to a bigint", () => {
      expect(typeCast(field("LONGLONG", "9007199254740993"), () => "9007199254740993")).toBe(
        9007199254740993n,
      );
    });
  });
});
