import { ValueType } from "@blazetrails/activemodel";
import { quotingHost } from "../../support/quoting-host.js";
import {
  BinaryData,
  BinaryType,
  DateInfinity,
  DateNegativeInfinity,
} from "@blazetrails/activemodel";
import { Temporal } from "@blazetrails/date";
import { TimeWithZone, TimeZone } from "@blazetrails/activesupport";
import { describe, expect, it } from "vitest";
import { Data as ArrayData, PgTextEncoderArray } from "./oid/array.js";
import { Data as BitData } from "./oid/bit.js";
import { Data as XmlData } from "./oid/xml.js";
import {
  checkIntInRange,
  columnNameMatcher,
  columnNameWithOrderMatcher,
  lookupCastTypeFromColumn,
  quote as quoteFn,
  quoteDefaultExpression,
  type CastTypeLookupHost,
  quotedBinary,
  quotedDate,
  quoteSchemaName,
  quoteTableNameForAssignment,
  typeCast as typeCastFn,
  unescapeBytea,
} from "./quoting.js";
import { Range } from "@blazetrails/ruby-compat";

const HOST = quotingHost({ quotedDate, quotedBinary });
const quote = (value: unknown): string | null => quoteFn.call(HOST, value);
const typeCast = (value: unknown): unknown => typeCastFn.call(HOST, value);

describe("PostgreSQL quoting", () => {
  it("inherits abstract boolean SQL literals", () => {
    expect(quote(true)).toBe("TRUE");
    expect(quote(false)).toBe("FALSE");
    expect(typeCast(true)).toBe(true);
    expect(typeCast(false)).toBe(false);
    expect(
      quote(
        new ArrayData(new PgTextEncoderArray({ name: "text[]", delimiter: "," }), [true, false]),
      ),
    ).toBe("'{true,false}'");
  });

  it("type casts binary data to a Buffer for node-postgres bytea binding", () => {
    const cast = typeCast(new BinaryData(new Uint8Array([0xde, 0xad, 0xbe, 0xef])));
    expect(Buffer.isBuffer(cast)).toBe(true);
    expect(Array.from(cast as Buffer)).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it("quotes PostgreSQL OID wrapper values before delegating other values", () => {
    expect(quote(new XmlData("<root />"))).toBe("xml '<root />'");
    expect(quote(new BitData("1010"))).toBe("B'1010'");
    expect(
      quote(new ArrayData(new PgTextEncoderArray({ name: "text[]", delimiter: "," }), ["a", "b"])),
    ).toBe("'{a,b}'");
    expect(quote(new Range(1, 10, true))).toBe("'[1,10)'");
    expect(quote(Infinity)).toBe("'Infinity'");
  });

  it("quotes arrays through the encoder's delimiter, not a hardcoded comma", async () => {
    const boxArray = new ArrayData(new PgTextEncoderArray({ name: "box[]", delimiter: ";" }), [
      "(1,1),(0,0)",
      "(2,2),(1,1)",
    ]);
    expect(typeCast(boxArray)).toBe("{(1,1),(0,0);(2,2),(1,1)}");
    expect(quote(boxArray)).toBe("'{(1,1),(0,0);(2,2),(1,1)}'");
  });

  it("type_casts datetime array elements through quoted_date (fixed-6, BC)", () => {
    const dtArray = new ArrayData(new PgTextEncoderArray({ name: "datetime[]", delimiter: "," }), [
      Temporal.Instant.from("2026-04-26T14:23:55.123456789Z"),
      Temporal.Instant.from("-000043-03-15T12:34:56.123456Z"),
    ]);
    expect(quote(dtArray)).toBe(
      '\'{"2026-04-26 14:23:55.123456","0044-03-15 12:34:56.123456 BC"}\'',
    );
  });

  it("encodes unbounded range bounds as empty, matching Ruby nil interpolation", () => {
    expect(typeCast(new Range("2020-01-01", null, true))).toBe("[2020-01-01,)");
    expect(typeCast(new Range(null, "2020-12-31", false))).toBe("[,2020-12-31]");
    expect(quote(new Range("2020-01-01", null, true))).toBe("'[2020-01-01,)'");
  });

  it("serializes defaults for any PostgreSQL column, not only array columns", async () => {
    const column = { sqlType: "integer", array: false };
    const host = Object.assign(Object.create(HOST) as CastTypeLookupHost & typeof HOST, {
      lookupCastTypeFromColumn(col: { sqlType?: string | null }) {
        expect(col.sqlType).toBe("integer");
        return { serialize: (value: unknown) => Number(value) + 1 };
      },
    });

    expect(await quoteDefaultExpression.call(host, 41, column)).toBe("42");
  });

  it("serializes a non-array column's default through its cast type", async () => {
    const host = Object.assign(Object.create(HOST) as CastTypeLookupHost & typeof HOST, {
      lookupCastType(sqlType: string | null) {
        expect(sqlType).toBe("integer");
        return { serialize: (value: unknown) => Number(value) + 1 };
      },
    });

    expect(await quoteDefaultExpression.call(host, 41, { sqlType: "integer" })).toBe("42");
  });

  it("quotes a binary default through PG's quotedBinary", async () => {
    const host = Object.assign(Object.create(HOST) as CastTypeLookupHost & typeof HOST, {
      lookupCastType: () => new BinaryType(),
    });
    expect(
      await quoteDefaultExpression.call(host, new Uint8Array([0x1f, 0x8b]), { sqlType: "bytea" }),
    ).toBe("'\\x1f8b'");
    expect(
      await quoteDefaultExpression.call(host, new BinaryData(new Uint8Array([0x1f, 0x8b])), {
        sqlType: "bytea",
      }),
    ).toBe("'\\x1f8b'");
  });

  it("quotes a BC date default through PG's quotedDate", async () => {
    const host = Object.assign(Object.create(HOST) as CastTypeLookupHost & typeof HOST, {
      lookupCastType: () => ({ serialize: (v: unknown) => v }),
    });
    expect(
      await quoteDefaultExpression.call(host, Temporal.PlainDate.from("-000043-03-15"), {
        sqlType: "date",
      }),
    ).toBe("'0044-03-15 BC'");
  });

  it("quotes a binary default produced by BinaryType#serialize", async () => {
    const column = { sqlType: "bytea", array: false };
    const host = Object.assign(Object.create(HOST) as CastTypeLookupHost & typeof HOST, {
      lookupCastTypeFromColumn: () => new BinaryType(),
    });
    expect(await quoteDefaultExpression.call(host, "ab", column)).toBe("'\\x6162'");
  });

  it("does not quote function default values for UUID columns", async () => {
    const column = { type: "uuid", sqlType: "uuid" };
    const host = Object.assign(Object.create(HOST) as CastTypeLookupHost & typeof HOST, {
      lookupCastType: () => ({ serialize: (v: unknown) => v }),
    });
    expect(await quoteDefaultExpression.call(host, "gen_random_uuid()", column)).toBe(
      "gen_random_uuid()",
    );
    expect(await quoteDefaultExpression.call(host, "uuid_generate_v4()", column)).toBe(
      "uuid_generate_v4()",
    );
    expect(
      await quoteDefaultExpression.call(host, "11111111-1111-1111-1111-111111111111", column),
    ).toBe("'11111111-1111-1111-1111-111111111111'");
    expect(
      await quoteDefaultExpression.call(host, "gen_random_uuid()", {
        type: "text",
        sqlType: "text",
      }),
    ).toBe("'gen_random_uuid()'");
  });

  it("serializes array defaults through the type map", async () => {
    const arrayType = new PgTextEncoderArray({ name: "text[]", delimiter: "," });
    const column = { sqlType: "text[]", array: true };
    const host = Object.assign(Object.create(HOST) as CastTypeLookupHost & typeof HOST, {
      lookupCastTypeFromColumn() {
        return { serialize: (value: unknown) => new ArrayData(arrayType, value as unknown[]) };
      },
    });

    expect(await quoteDefaultExpression.call(host, ["a", "b"], column)).toBe("'{a,b}'");
  });

  it("supports nested function calls up to 2 levels deep", () => {
    expect(columnNameMatcher().test("lower(name)")).toBe(true);
    expect(columnNameMatcher().test("lower(trim(name))")).toBe(true);
  });

  it("unescapes hex bytea values we now own locally", () => {
    expect(unescapeBytea("\\x6869")).toEqual(Buffer.from("hi"));
  });

  it("unescapes legacy octal bytea with escaped backslashes", () => {
    expect(unescapeBytea("a\\134\\000b")).toEqual(Buffer.from([0x61, 0x5c, 0x00, 0x62]));
  });

  it("quoteTableNameForAssignment drops the table prefix", () => {
    expect(quoteTableNameForAssignment("users", "name")).toBe('"name"');
  });

  it("quoteSchemaName delegates to quoteColumnName", () => {
    expect(quoteSchemaName("public")).toBe('"public"');
  });

  it("accepts the Type::Binary::Data Rails' quoted_binary is given", () => {
    expect(quotedBinary(new BinaryData(new Uint8Array([0x1f, 0x8b])))).toBe("'\\x1f8b'");
  });

  it("quotedBinary wraps escape_bytea output in SQL quotes", () => {
    expect(quotedBinary(Buffer.from("ab"))).toBe("'\\x6162'");
    expect(quotedBinary("ab")).toBe("'\\x6162'");
  });

  it("quotedBinary hexes an ArrayBuffer view like MySQL/SQLite do", () => {
    const buffer = new Uint8Array([0x1f, 0x8b]).buffer;
    expect(quotedBinary(new DataView(buffer))).toBe("'\\x1f8b'");
  });

  it("quotedBinary hexes a bare ArrayBuffer like MySQL/SQLite do", () => {
    const buffer = new Uint8Array([0x1f, 0x8b]).buffer;
    expect(quotedBinary(buffer)).toBe("'\\x1f8b'");
  });

  it("quote(Uint8Array) emits a bytea hex literal via quotedBinary", () => {
    expect(quote(new Uint8Array([0x1f, 0x8b]))).toBe("'\\x1f8b'");
  });

  it("quote(BinaryData) unwraps to bytes via quotedBinary", () => {
    expect(quote(new BinaryData(new Uint8Array([0x1f, 0x8b])))).toBe("'\\x1f8b'");
  });

  it("quote(non-Uint8Array ArrayBuffer view) normalizes to bytes via quotedBinary", () => {
    expect(quote(new Int8Array([0x1f, 0x8b - 0x100]))).toBe("'\\x1f8b'");
    expect(quote(new DataView(new Uint8Array([0x1f, 0x8b]).buffer))).toBe("'\\x1f8b'");
  });

  it("checkIntInRange raises Rails' check_int_in_range message verbatim", () => {
    expect(() => checkIntInRange(BigInt("9223372036854775807"))).not.toThrow();
    expect(() => checkIntInRange(BigInt("9223372036854775808"))).toThrow(
      `Provided value outside of the range of a signed 64bit integer.

PostgreSQL will treat the column type in question as a numeric.
This may result in a slow sequential scan due to a comparison
being performed between an integer or bigint value and a numeric value.

To allow for this potentially unwanted behavior, set
ActiveRecord.raiseIntWiderThan64bit to false.
`,
    );
  });

  it("lookupCastTypeFromColumn forwards oid/fmod/sqlType to the type map", () => {
    const calls: Array<[number, number, string]> = [];
    const sentinel = new ValueType();
    const typeMap = {
      lookup(oid: number, fmod: number, sqlType: string) {
        calls.push([oid, fmod, sqlType]);
        return sentinel;
      },
    };
    const column = { oid: 23, fmod: -1, sqlType: "integer" };

    expect(lookupCastTypeFromColumn.call({ typeMap }, column)).toBe(sentinel);
    expect(calls).toEqual([[23, -1, "integer"]]);
  });

  describe("columnNameWithOrderMatcher", () => {
    const matcher = columnNameWithOrderMatcher();

    it("matches a bare column", () => {
      expect(matcher.test("name")).toBe(true);
    });

    it("matches ASC / DESC / NULLS FIRST | LAST", () => {
      expect(matcher.test("name ASC")).toBe(true);
      expect(matcher.test("name DESC NULLS LAST")).toBe(true);
    });

    it("matches quoted collations (Rails-faithful: quoted only)", () => {
      expect(matcher.test('name COLLATE "C"')).toBe(true);
    });

    it("rejects unquoted collations, matching Rails", () => {
      expect(matcher.test("name COLLATE C")).toBe(false);
    });

    it("rejects SQL injection attempts", () => {
      expect(matcher.test("name; DROP TABLE users")).toBe(false);
    });
  });

  it("quote(new Date()) throws — Date is no longer accepted", () => {
    expect(() => quote(new Date())).toThrow(TypeError);
    expect(() => quote(new Date())).toThrow(/Temporal/);
  });

  it("quoted_date suffixes BC for proleptic years <= 0", () => {
    expect(quotedDate(Temporal.PlainDate.from("-000043-03-15"))).toBe("0044-03-15 BC");
  });

  it("quoted_date emits fixed 6-digit microseconds when usec > 0", () => {
    expect(quotedDate(Temporal.Instant.from("2026-04-26T14:23:55.5Z"))).toBe(
      "2026-04-26 14:23:55.500000",
    );
    expect(quotedDate(Temporal.Instant.from("2026-04-26T14:23:55.123Z"))).toBe(
      "2026-04-26 14:23:55.123000",
    );
  });

  it("quoted_date omits the fractional field when usec == 0", () => {
    expect(quotedDate(Temporal.Instant.from("2026-04-26T14:23:55Z"))).toBe("2026-04-26 14:23:55");
  });

  it("quoted_date caps fractional seconds at microseconds (drops nanos)", () => {
    expect(quotedDate(Temporal.Instant.from("2026-04-26T14:23:55.123456789Z"))).toBe(
      "2026-04-26 14:23:55.123456",
    );
  });

  it("quoted_date suffixes BC for an Instant with proleptic year <= 0", () => {
    const instant = Temporal.Instant.from("-000043-03-15T12:34:56Z");
    expect(instant.toZonedDateTimeISO("UTC").year).toBe(-43);
    expect(quotedDate(instant)).toBe("0044-03-15 12:34:56 BC");
  });

  it("quoted_date reads the BC year off a TimeWithZone's own zone", () => {
    const twz = new TimeWithZone(
      Temporal.Instant.from("0000-12-31T23:30:00Z"),
      TimeZone.find("Tokyo")!,
    );
    expect(twz.year).toBe(1);
    expect(quotedDate(twz)).toBe("0000-12-31 23:30:00");
  });

  it("quoted_date suffixes BC for a PlainDateTime with proleptic year <= 0", () => {
    expect(quotedDate(Temporal.PlainDateTime.from("-000043-03-15T12:34:56.123456"))).toBe(
      "0044-03-15 12:34:56.123456 BC",
    );
  });

  it("quote dispatches Date/Time through this.quoted_date (BC suffix)", () => {
    const v = Temporal.PlainDate.from("-000043-03-15");
    expect(quoteFn.call(quotingHost({ quotedDate }), v)).toBe("'0044-03-15 BC'");
  });

  it("typeCast maps the infinity sentinels to the PG wire strings", () => {
    expect(typeCast(DateInfinity)).toBe("infinity");
    expect(typeCast(DateNegativeInfinity)).toBe("-infinity");
  });

  it("typeCast(new Date()) throws — Date is no longer accepted", () => {
    expect(() => typeCast(new Date())).toThrow(TypeError);
    expect(() => typeCast(new Date())).toThrow(/Temporal/);
  });
});
