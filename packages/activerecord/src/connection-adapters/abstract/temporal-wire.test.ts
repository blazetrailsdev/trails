import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import {
  parsePostgresInstant,
  parsePostgresPlainDateTime,
  parsePostgresDate,
  parsePostgresTime,
  parsePostgresTimeTz,
  parseMysqlInstant,
  parseMysqlPlainDateTime,
  parseMysqlDate,
  parseMysqlTime,
  DateInfinity,
  DateNegativeInfinity,
} from "./temporal-wire.js";

describe("parsePostgresInstant", () => {
  it("parses a timestamptz with space separator and two-digit offset", () => {
    const result = parsePostgresInstant("2026-04-26 14:23:55.123456+00");
    expect(result.toString()).toBe("2026-04-26T14:23:55.123456Z");
  });

  it("preserves microseconds", () => {
    const result = parsePostgresInstant("2024-01-15 09:00:00.000001+00");
    expect(result.toString()).toBe("2024-01-15T09:00:00.000001Z");
  });

  it("truncates sub-nanosecond digits beyond 9", () => {
    // No DB emits >9 fractional digits, but guard against corrupt input
    // shifting the slice boundaries. "1234567899" → treat as "123456789".
    const result = parsePostgresInstant("2026-04-26 14:23:55.1234567899+00") as Temporal.Instant;
    const zdt = result.toZonedDateTimeISO("UTC");
    expect(zdt.millisecond).toBe(123);
    expect(zdt.microsecond).toBe(456);
    expect(zdt.nanosecond).toBe(789);
  });

  it("handles a positive offset", () => {
    const result = parsePostgresInstant("2026-04-26 14:23:55+02");
    expect(result.toString()).toBe("2026-04-26T12:23:55Z");
  });

  it("handles ±HH:MM offset", () => {
    const result = parsePostgresInstant("2026-04-26 14:23:55.100000+05:30");
    expect(result.toString()).toBe("2026-04-26T08:53:55.1Z");
  });

  it("handles negative offset", () => {
    const result = parsePostgresInstant("2026-04-26 14:23:55-05");
    expect(result.toString()).toBe("2026-04-26T19:23:55Z");
  });

  it("returns DateInfinity for 'infinity'", () => {
    expect(parsePostgresInstant("infinity")).toBe(DateInfinity);
  });

  it("returns DateNegativeInfinity for '-infinity'", () => {
    expect(parsePostgresInstant("-infinity")).toBe(DateNegativeInfinity);
  });

  it("parses a BC timestamp", () => {
    // Postgres 0044-03-15 BC = ISO year -43
    const result = parsePostgresInstant("0044-03-15 12:00:00+00 BC") as Temporal.Instant;
    expect(result.epochNanoseconds).toBeLessThan(0n);
    // year -43 in proleptic Gregorian = 44 BC
    const zdt = result.toZonedDateTimeISO("UTC");
    expect(zdt.year).toBe(-43);
    expect(zdt.month).toBe(3);
    expect(zdt.day).toBe(15);
  });

  it("parses a BC timestamp with microseconds", () => {
    const result = parsePostgresInstant("0044-03-15 12:00:00.000123+00 BC") as Temporal.Instant;
    const zdt = result.toZonedDateTimeISO("UTC");
    expect(zdt.millisecond).toBe(0);
    expect(zdt.microsecond).toBe(123);
    expect(zdt.nanosecond).toBe(0);
  });
});

describe("parsePostgresPlainDateTime", () => {
  it("parses a timestamp with space separator", () => {
    const result = parsePostgresPlainDateTime("2026-04-26 14:23:55.123456");
    expect(result.toString()).toBe("2026-04-26T14:23:55.123456");
  });

  it("preserves microseconds", () => {
    const result = parsePostgresPlainDateTime("2024-12-31 23:59:59.999999");
    expect(result.toString()).toBe("2024-12-31T23:59:59.999999");
  });

  it("returns DateInfinity for 'infinity'", () => {
    expect(parsePostgresPlainDateTime("infinity")).toBe(DateInfinity);
  });

  it("returns DateNegativeInfinity for '-infinity'", () => {
    expect(parsePostgresPlainDateTime("-infinity")).toBe(DateNegativeInfinity);
  });

  it("parses a BC datetime", () => {
    const result = parsePostgresPlainDateTime("0044-03-15 12:00:00 BC") as Temporal.PlainDateTime;
    expect(result.year).toBe(-43);
    expect(result.month).toBe(3);
    expect(result.day).toBe(15);
  });

  it("parses a BC datetime with microseconds", () => {
    const result = parsePostgresPlainDateTime(
      "0044-03-15 12:00:00.000456 BC",
    ) as Temporal.PlainDateTime;
    expect(result.millisecond).toBe(0);
    expect(result.microsecond).toBe(456);
    expect(result.nanosecond).toBe(0);
  });
});

describe("parsePostgresDate", () => {
  it("parses a normal date", () => {
    const result = parsePostgresDate("2026-04-26");
    expect(result.toString()).toBe("2026-04-26");
  });

  it("returns DateInfinity for 'infinity'", () => {
    expect(parsePostgresDate("infinity")).toBe(DateInfinity);
  });

  it("returns DateNegativeInfinity for '-infinity'", () => {
    expect(parsePostgresDate("-infinity")).toBe(DateNegativeInfinity);
  });

  it("parses a BC date", () => {
    const result = parsePostgresDate("0044-03-15 BC") as Temporal.PlainDate;
    expect(result.year).toBe(-43);
    expect(result.month).toBe(3);
  });
});

describe("parsePostgresTime", () => {
  it("parses a time with microseconds", () => {
    const result = parsePostgresTime("14:23:55.123456");
    expect(result.toString()).toBe("14:23:55.123456");
  });

  it("parses a whole-second time", () => {
    const result = parsePostgresTime("00:00:00");
    expect(result.toString()).toBe("00:00:00");
  });

  it("normalizes 24:00:00 (PG end-of-day sentinel) to 00:00:00", () => {
    expect(parsePostgresTime("24:00:00").toString()).toBe("00:00:00");
  });

  it("normalizes 24:00:00 with fractional seconds", () => {
    expect(parsePostgresTime("24:00:00.000000").toString()).toBe("00:00:00");
  });
});

describe("parsePostgresTimeTz", () => {
  it("parses timetz with two-digit offset", () => {
    const { time, offset } = parsePostgresTimeTz("14:23:55.123456+02");
    expect(time.toString()).toBe("14:23:55.123456");
    expect(offset).toBe("+02:00");
  });

  it("parses timetz with full offset", () => {
    const { time, offset } = parsePostgresTimeTz("14:23:55+05:30");
    expect(time.toString()).toBe("14:23:55");
    expect(offset).toBe("+05:30");
  });

  it("parses timetz with negative offset", () => {
    const { time, offset } = parsePostgresTimeTz("08:00:00.000001-08");
    expect(time.toString()).toBe("08:00:00.000001");
    expect(offset).toBe("-08:00");
  });

  it("normalizes 24:00:00 timetz to 00:00:00", () => {
    const { time, offset } = parsePostgresTimeTz("24:00:00+00");
    expect(time.toString()).toBe("00:00:00");
    expect(offset).toBe("+00:00");
  });

  it("throws on unparseable input", () => {
    expect(() => parsePostgresTimeTz("not-a-time")).toThrow(RangeError);
  });
});

describe("parseMysqlInstant", () => {
  it("treats the wire string as UTC (pinned session tz)", () => {
    const result = parseMysqlInstant("2026-04-26 14:23:55.123456");
    expect(result.toString()).toBe("2026-04-26T14:23:55.123456Z");
  });

  it("preserves microseconds", () => {
    const result = parseMysqlInstant("2024-01-01 00:00:00.000001");
    expect(result.toString()).toBe("2024-01-01T00:00:00.000001Z");
  });
});

describe("parseMysqlPlainDateTime", () => {
  it("parses a DATETIME string", () => {
    const result = parseMysqlPlainDateTime("2026-04-26 14:23:55.123456");
    expect(result?.toString()).toBe("2026-04-26T14:23:55.123456");
  });

  it("returns null for zero-date", () => {
    expect(parseMysqlPlainDateTime("0000-00-00 00:00:00")).toBeNull();
  });

  it("returns null for zero-date with fractional seconds (DATETIME(6))", () => {
    expect(parseMysqlPlainDateTime("0000-00-00 00:00:00.000000")).toBeNull();
  });
});

describe("parseMysqlDate", () => {
  it("parses a DATE string", () => {
    const result = parseMysqlDate("2026-04-26");
    expect(result?.toString()).toBe("2026-04-26");
  });

  it("returns null for zero-date", () => {
    expect(parseMysqlDate("0000-00-00")).toBeNull();
  });
});

describe("parseMysqlTime", () => {
  it("parses a TIME string", () => {
    const result = parseMysqlTime("14:23:55.123456");
    expect(result.toString()).toBe("14:23:55.123456");
  });

  it("parses midnight", () => {
    const result = parseMysqlTime("00:00:00");
    expect(result.toString()).toBe("00:00:00");
  });
});
