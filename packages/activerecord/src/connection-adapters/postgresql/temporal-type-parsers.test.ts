/**
 * Tests for the per-connection Temporal type parsers.
 *
 * These tests exercise `getTypeParser` in isolation (no live DB needed)
 * and verify that the global pg type registry is unaffected.
 */

import { describe, expect, it } from "vitest";
import pg from "pg";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { DateInfinity, DateNegativeInfinity } from "@blazetrails/activemodel";
import { getTypeParser } from "./temporal-type-parsers.js";

const OID_DATE = 1082;
const OID_TIME = 1083;
const OID_TIMESTAMP = 1114;
const OID_TIMESTAMPTZ = 1184;
const OID_TIMETZ = 1266;

function parse(oid: number, value: string): unknown {
  const parser = getTypeParser(oid, "text");
  if (!parser) throw new Error(`No parser for OID ${oid}`);
  return parser(value);
}

describe("getTypeParser — timestamptz (OID 1184)", () => {
  it("returns a Temporal.Instant", () => {
    const result = parse(OID_TIMESTAMPTZ, "2026-04-26 14:23:55.123456+00");
    expect(result).toBeInstanceOf(Temporal.Instant);
    expect((result as Temporal.Instant).toString()).toBe("2026-04-26T14:23:55.123456Z");
  });

  it("preserves microseconds", () => {
    const result = parse(OID_TIMESTAMPTZ, "2024-01-01 00:00:00.000001+00") as Temporal.Instant;
    expect(result.toString()).toBe("2024-01-01T00:00:00.000001Z");
  });

  it("returns DateInfinity for 'infinity'", () => {
    expect(parse(OID_TIMESTAMPTZ, "infinity")).toBe(DateInfinity);
  });

  it("returns DateNegativeInfinity for '-infinity'", () => {
    expect(parse(OID_TIMESTAMPTZ, "-infinity")).toBe(DateNegativeInfinity);
  });

  it("handles BC timestamps", () => {
    const result = parse(OID_TIMESTAMPTZ, "0044-03-15 12:00:00+00 BC") as Temporal.Instant;
    const zdt = result.toZonedDateTimeISO("UTC");
    expect(zdt.year).toBe(-43);
  });
});

describe("getTypeParser — timestamp (OID 1114)", () => {
  it("returns a Temporal.Instant (UTC)", () => {
    const result = parse(OID_TIMESTAMP, "2026-04-26 14:23:55.123456") as Temporal.Instant;
    expect(result).toBeInstanceOf(Temporal.Instant);
    expect(result.toString()).toBe("2026-04-26T14:23:55.123456Z");
  });

  it("returns DateInfinity for 'infinity'", () => {
    expect(parse(OID_TIMESTAMP, "infinity")).toBe(DateInfinity);
  });

  it("returns DateNegativeInfinity for '-infinity'", () => {
    expect(parse(OID_TIMESTAMP, "-infinity")).toBe(DateNegativeInfinity);
  });
});

describe("getTypeParser — date (OID 1082)", () => {
  it("returns a Temporal.PlainDate", () => {
    const result = parse(OID_DATE, "2026-04-26");
    expect(result).toBeInstanceOf(Temporal.PlainDate);
    expect((result as Temporal.PlainDate).toString()).toBe("2026-04-26");
  });

  it("returns DateInfinity for 'infinity'", () => {
    expect(parse(OID_DATE, "infinity")).toBe(DateInfinity);
  });

  it("returns DateNegativeInfinity for '-infinity'", () => {
    expect(parse(OID_DATE, "-infinity")).toBe(DateNegativeInfinity);
  });
});

describe("getTypeParser — time (OID 1083)", () => {
  it("returns a Temporal.PlainTime", () => {
    const result = parse(OID_TIME, "14:23:55.123456");
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    expect((result as Temporal.PlainTime).toString()).toBe("14:23:55.123456");
  });

  it("normalizes 24:00:00 to midnight", () => {
    const result = parse(OID_TIME, "24:00:00") as Temporal.PlainTime;
    expect(result.toString()).toBe("00:00:00");
  });
});

describe("getTypeParser — timetz (OID 1266)", () => {
  it("returns a TimeTzValue with time and offset", () => {
    const result = parse(OID_TIMETZ, "14:23:55.123456+02") as {
      time: Temporal.PlainTime;
      offset: string;
    };
    expect(result.time).toBeInstanceOf(Temporal.PlainTime);
    expect(result.time.toString()).toBe("14:23:55.123456");
    expect(result.offset).toBe("+02:00");
  });
});

describe("getTypeParser — binary format", () => {
  it("delegates binary format to pg built-ins (always returns a function)", () => {
    expect(typeof getTypeParser(OID_TIMESTAMPTZ, "binary")).toBe("function");
    expect(typeof getTypeParser(OID_DATE, "binary")).toBe("function");
  });
});

describe("getTypeParser — unknown OIDs", () => {
  it("delegates non-temporal OIDs to pg built-ins (always returns a function)", () => {
    expect(typeof getTypeParser(23, "text")).toBe("function"); // int4
    expect(typeof getTypeParser(25, "text")).toBe("function"); // text
  });
});

describe("global pg type registry is unaffected", () => {
  it("pg.types still returns its default Date parser for timestamptz", () => {
    // Calling getTypeParser from our module must NOT mutate pg.types.
    // The global parser for OID 1184 should still be pg's built-in one.
    const globalParser = pg.types.getTypeParser(OID_TIMESTAMPTZ, "text");
    // pg's built-in parser returns a Date or string, not a Temporal.Instant.
    const result = (globalParser as (v: string) => unknown)("2026-04-26 14:23:55+00");
    expect(result).not.toBeInstanceOf(Temporal.Instant);
  });
});
