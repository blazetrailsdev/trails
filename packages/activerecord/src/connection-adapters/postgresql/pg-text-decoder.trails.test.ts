import { describe, expect, it } from "vitest";
import pg from "pg";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { DateInfinity, DateNegativeInfinity } from "@blazetrails/activemodel";
import { PGTextDecoder, PGTypeMapByOid } from "./pg-text-decoder.js";
import { pgConnection } from "./pg-connection.js";

const OID_DATE = 1082;
const OID_TIMESTAMP = 1114;
const OID_TIMESTAMPTZ = 1184;
const OID_INT8 = 20;

const map = new PGTypeMapByOid()
  .addCoder(new PGTextDecoder.TimestampWithTimeZone({ oid: OID_TIMESTAMPTZ, name: "timestamptz" }))
  .addCoder(new PGTextDecoder.TimestampUtc({ oid: OID_TIMESTAMP, name: "timestamp" }))
  .addCoder(new PGTextDecoder.Date({ oid: OID_DATE, name: "date" }))
  .addCoder(new PGTextDecoder.Integer({ oid: OID_INT8, name: "int8" }));

function parse(oid: number, value: string): unknown {
  return map.coders.get(oid)!.decode(value);
}

describe("PGTextDecoder — timestamptz (OID 1184)", () => {
  it("returns a Temporal.Instant", () => {
    const result = parse(OID_TIMESTAMPTZ, "2026-04-26 14:23:55.123456+00");
    expect(result).toBeInstanceOf(RubyTime);
    expect((result as RubyTime).getutc().toZonedDateTime().toInstant().toString()).toBe(
      "2026-04-26T14:23:55.123456Z",
    );
  });

  it("preserves microseconds", () => {
    const result = parse(OID_TIMESTAMPTZ, "2024-01-01 00:00:00.000001+00") as RubyTime;
    expect(result.getutc().toZonedDateTime().toInstant().toString()).toBe(
      "2024-01-01T00:00:00.000001Z",
    );
  });

  it("returns DateInfinity for 'infinity'", () => {
    expect(parse(OID_TIMESTAMPTZ, "infinity")).toBe(DateInfinity);
  });

  it("returns DateNegativeInfinity for '-infinity'", () => {
    expect(parse(OID_TIMESTAMPTZ, "-infinity")).toBe(DateNegativeInfinity);
  });

  it("handles BC timestamps", () => {
    const result = parse(OID_TIMESTAMPTZ, "0044-03-15 12:00:00+00 BC") as RubyTime;
    expect(result.getutc().year).toBe(-43);
  });
});

describe("PGTextDecoder — timestamp (OID 1114)", () => {
  it("returns a Temporal.Instant (UTC)", () => {
    const result = parse(OID_TIMESTAMP, "2026-04-26 14:23:55.123456") as RubyTime;
    expect(result).toBeInstanceOf(RubyTime);
    expect(result.getutc().toZonedDateTime().toInstant().toString()).toBe(
      "2026-04-26T14:23:55.123456Z",
    );
  });

  it("returns DateInfinity for 'infinity'", () => {
    expect(parse(OID_TIMESTAMP, "infinity")).toBe(DateInfinity);
  });

  it("returns DateNegativeInfinity for '-infinity'", () => {
    expect(parse(OID_TIMESTAMP, "-infinity")).toBe(DateNegativeInfinity);
  });
});

describe("PGTextDecoder — date (OID 1082)", () => {
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

describe("PGTextDecoder — int8 (OID 20)", () => {
  it("returns a number for a count(*) value", () => {
    expect(parse(OID_INT8, "3")).toBe(3);
  });

  it("returns a bigint past the safe-integer range rather than truncating", () => {
    expect(parse(OID_INT8, "9223372036854775807")).toBe(9223372036854775807n);
    expect(parse(OID_INT8, "-9223372036854775808")).toBe(-9223372036854775808n);
  });

  it("returns a number at the safe-integer boundary", () => {
    expect(parse(OID_INT8, String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("PGTextDecoder — Float, Boolean", () => {
  it("decodes the text wire form", () => {
    expect(new PGTextDecoder.Float({ oid: 701, name: "float8" }).decode("1.5")).toBe(1.5);
    expect(new PGTextDecoder.Float({ oid: 701, name: "float8" }).decode("NaN")).toBeNaN();
    expect(new PGTextDecoder.Boolean({ oid: 16, name: "bool" }).decode("t")).toBe(true);
    expect(new PGTextDecoder.Boolean({ oid: 16, name: "bool" }).decode("f")).toBe(false);
  });
});

describe("PGTextDecoder — TimestampWithoutTimeZone", () => {
  it("reads the timestamp in the local zone, and keeps the coder's oid and name", () => {
    const utc = map.coders.get(OID_TIMESTAMP)!;
    const local = new PGTextDecoder.TimestampWithoutTimeZone({ ...utc.toH() });
    expect(local.toH()).toEqual({ oid: OID_TIMESTAMP, name: "timestamp" });
    const naive = Temporal.PlainDateTime.from("2026-04-26T14:23:55");
    expect(
      (local.decode("2026-04-26 14:23:55") as RubyTime).getutc().toZonedDateTime().toInstant()
        .epochNanoseconds,
    ).toBe(naive.toZonedDateTime(Temporal.Now.timeZoneId()).toInstant().epochNanoseconds);
  });
});

describe("PGConnection#typeMapForResults", () => {
  it("decodes a text column through its coder and leaves the rest to the client", async () => {
    const queries: { types: { getTypeParser(oid: number, format?: string): unknown } }[] = [];
    const client = pgConnection({
      getTypeParser: () => () => "from the client",
      query: async (config: never) => (queries.push(config), { rows: [], fields: [] }),
    });
    expect(client.typeMapForResults.coders.size).toBe(0);
    client.typeMapForResults = map;
    await client.asyncExec("SELECT 1");
    const { getTypeParser } = queries[0].types;
    expect((getTypeParser(OID_INT8, "text") as (v: string) => unknown)("3")).toBe(3);
    expect((getTypeParser(OID_INT8, "binary") as (v: string) => unknown)("3")).toBe(
      "from the client",
    );
    expect((getTypeParser(25, "text") as (v: string) => unknown)("x")).toBe("from the client");
  });
});

describe("global pg type registry is unaffected", () => {
  it("pg.types still returns its default Date parser for timestamptz", () => {
    const globalParser = pg.types.getTypeParser(OID_TIMESTAMPTZ, "text");
    const result = (globalParser as (v: string) => unknown)("2026-04-26 14:23:55+00");
    expect(result).not.toBeInstanceOf(Temporal.Instant);
  });
});
