import { describe, expect, it, vi } from "vitest";
import pg from "pg";
import { Date as RubyDate, Temporal, Time as RubyTime } from "@blazetrails/date";
import { PG } from "@blazetrails/pg";
import { fakePgConnection } from "../../../support/fake-pg-connection.js";
import { Rational } from "@blazetrails/ruby-compat";

const OID_DATE = 1082;
const OID_TIMESTAMP = 1114;
const OID_TIMESTAMPTZ = 1184;
const OID_INT8 = 20;

const map = new PG.TypeMapByOid()
  .addCoder(
    new PG.TextDecoder.TimestampWithTimeZone(null, { oid: OID_TIMESTAMPTZ, name: "timestamptz" }),
  )
  .addCoder(new PG.TextDecoder.TimestampUtc(undefined, { oid: OID_TIMESTAMP, name: "timestamp" }))
  .addCoder(new PG.TextDecoder.Date(null, { oid: OID_DATE, name: "date" }))
  .addCoder(new PG.TextDecoder.Integer(null, { oid: OID_INT8, name: "int8" }));

function parse(oid: number, value: string): unknown {
  return map._lookupOid(0, oid)!.decode(value);
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

  it("leaves 'infinity' a String for the OID type to cast", () => {
    expect(parse(OID_TIMESTAMPTZ, "infinity")).toBe("infinity");
  });

  it("leaves '-infinity' a String for the OID type to cast", () => {
    expect(parse(OID_TIMESTAMPTZ, "-infinity")).toBe("-infinity");
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

  it("leaves 'infinity' a String for the OID type to cast", () => {
    expect(parse(OID_TIMESTAMP, "infinity")).toBe("infinity");
  });

  it("leaves '-infinity' a String for the OID type to cast", () => {
    expect(parse(OID_TIMESTAMP, "-infinity")).toBe("-infinity");
  });
});

describe("PGTextDecoder — date (OID 1082)", () => {
  it("returns a Date", () => {
    const result = parse(OID_DATE, "2026-04-26");
    expect(result).toBeInstanceOf(RubyDate);
    expect((result as RubyDate).toDate().toString()).toBe("2026-04-26");
  });

  it("leaves 'infinity' a String for the OID type to cast", () => {
    expect(parse(OID_DATE, "infinity")).toBe("infinity");
  });

  it("leaves '-infinity' a String for the OID type to cast", () => {
    expect(parse(OID_DATE, "-infinity")).toBe("-infinity");
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
    expect(new PG.TextDecoder.Float(null, { oid: 701, name: "float8" }).decode("1.5")).toBe(1.5);
    expect(new PG.TextDecoder.Float(null, { oid: 701, name: "float8" }).decode("NaN")).toBeNaN();
    expect(new PG.TextDecoder.Boolean(null, { oid: 16, name: "bool" }).decode("t")).toBe(true);
    expect(new PG.TextDecoder.Boolean(null, { oid: 16, name: "bool" }).decode("f")).toBe(false);
  });
});

describe("PGTextDecoder — TimestampWithoutTimeZone", () => {
  it("reads the timestamp in the local zone, and keeps the coder's oid and name", () => {
    const utc = map._lookupOid(0, OID_TIMESTAMP)!;
    const local = new PG.TextDecoder.TimestampWithoutTimeZone(undefined, { ...utc.toH() });
    expect(local.toH()).toEqual({ oid: OID_TIMESTAMP, format: 0, flags: 0x3, name: "timestamp" });
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
    const client = fakePgConnection({
      getTypeParser: () => () => "from the client",
      query: async (config: never) => (queries.push(config), { rows: [], fields: [] }),
    });
    expect(client.typeMapForResults._lookupOid(0, OID_INT8)).toBeNull();
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

describe("PGTextDecoder — timestamps match Time.new", () => {
  const RE =
    /^(\d{1,7})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)(?:\.(\d+))?(?:([+-])(\d\d)(?::(\d\d))?(?::(\d\d))?)?( BC)?$/;

  function viaTimeNew(value: string, dbLocal: boolean, appLocal: boolean): RubyTime {
    const m = RE.exec(value)!;
    let year = Number(m[1]);
    if (m[12]) year = -year + 1;
    const nsec = BigInt((m[7] ?? "").slice(0, 9).padEnd(9, "0"));
    const sec = nsec
      ? dbLocal
        ? new Rational(BigInt(m[6]) * 1_000_000n + nsec / 1000n, 1_000_000n)
        : new Rational(BigInt(m[6]) * 1_000_000_000n + nsec, 1_000_000_000n)
      : Number(m[6]);
    const args = [year, +m[2], +m[3], +m[4], +m[5], sec] as const;
    if (m[8]) {
      let offset = Number(m[9]) * 3600 + Number(m[10] ?? 0) * 60 + Number(m[11] ?? 0);
      if (m[8] === "-") offset = -offset;
      return RubyTime.new(...args, offset);
    }
    const res = RubyTime.new(...args, dbLocal ? null : 0);
    if (dbLocal && appLocal) return res;
    return appLocal ? res.getlocal() : res.utc();
  }

  const fingerprint = (t: RubyTime) =>
    [t.utcOffset, t.isUtc(), t.zone, t.nsec, t.toR().toString(), t.yday, t.wday]
      .concat(t.strftime("%FT%T.%N %z %Z"))
      .join("|");

  const values = [
    "2026-11-06 19:33:14.918",
    "2026-11-06 19:33:14",
    "2026-11-06 19:33:14.123456789",
    "2000-02-29 00:00:00.5",
    "1969-12-31 23:59:59.999999",
    "1970-01-01 00:00:00",
    "0099-01-01 00:00:00",
    "0001-01-01 00:00:00",
    "0044-03-15 12:00:00 BC",
    "9999-12-31 23:59:59.999999",
    "2026-11-06 19:33:14.918+05:30",
    "2026-11-06 19:33:14-08",
    "1900-01-01 00:00:00+00:19:32",
    "2026-03-08 02:30:00",
    "275760-01-01 00:00:00",
  ];

  const coders = [
    [
      new PG.TextDecoder.TimestampUtcToLocal(undefined, { oid: OID_TIMESTAMP, name: "timestamp" }),
      false,
      true,
    ],
    [
      new PG.TextDecoder.TimestampUtc(undefined, { oid: OID_TIMESTAMP, name: "timestamp" }),
      false,
      false,
    ],
    [
      new PG.TextDecoder.TimestampWithTimeZone(null, { oid: OID_TIMESTAMPTZ, name: "timestamptz" }),
      false,
      false,
    ],
    [
      new PG.TextDecoder.TimestampWithoutTimeZone(undefined, {
        oid: OID_TIMESTAMP,
        name: "timestamp",
      }),
      true,
      true,
    ],
  ] as const;

  for (const [coder, dbLocal, appLocal] of coders) {
    it(`${coder.constructor.name} decodes like Time.new`, () => {
      for (const value of values) {
        expect([value, fingerprint(coder.decode(value) as RubyTime)]).toEqual([
          value,
          fingerprint(viaTimeNew(value, dbLocal, appLocal)),
        ]);
      }
    });
  }

  it("takes the timespec path only where Date.UTC agrees with Time.new", () => {
    const spy = vi.spyOn(RubyTime, "timespecNew");
    const coder = new PG.TextDecoder.TimestampUtc(undefined, {
      oid: OID_TIMESTAMP,
      name: "timestamp",
    });
    try {
      coder.decode("2026-11-06 19:33:14.918");
      expect(spy).toHaveBeenCalledTimes(1);
      coder.decode("0099-01-01 00:00:00");
      coder.decode("275760-01-01 00:00:00");
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
