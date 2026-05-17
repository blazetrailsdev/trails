import { BinaryData } from "@blazetrails/activemodel";
import { describe, expect, it } from "vitest";
import { Data as ArrayData, Array as OidArray } from "./oid/array.js";
import { Data as BitData } from "./oid/bit.js";
import { Range } from "./oid/range.js";
import { Data as XmlData } from "./oid/xml.js";
import {
  checkIntInRange,
  columnNameMatcher,
  columnNameWithOrderMatcher,
  IntegerOutOf64BitRange,
  lookupCastTypeFromColumn,
  quote,
  quoteDefaultExpression,
  quotedBinary,
  quotedFalse,
  quotedTrue,
  quoteIdentifier,
  quoteSchemaName,
  quoteTableNameForAssignment,
  typeCast,
  unescapeBytea,
} from "./quoting.js";

describe("PostgreSQL quoting", () => {
  it("inherits abstract boolean SQL literals", () => {
    // Rails PG does not override quoted_true/quoted_false — it inherits
    // "TRUE"/"FALSE" from active_record/connection_adapters/abstract/quoting.rb:166.
    expect(quotedTrue()).toBe("TRUE");
    expect(quotedFalse()).toBe("FALSE");
  });

  it("quoteIdentifier wraps in double quotes and escapes embedded ones", () => {
    expect(quoteIdentifier("foo")).toBe('"foo"');
    expect(quoteIdentifier('foo"bar')).toBe('"foo""bar"');
  });

  it("type casts binary data using the PG binary bind shape", () => {
    expect(typeCast(new BinaryData("hello"))).toEqual({ value: "hello", format: 1 });
  });

  it("quotes PostgreSQL OID wrapper values before delegating other values", () => {
    expect(quote(new XmlData("<root />"))).toBe("xml '<root />'");
    expect(quote(new BitData("1010"))).toBe("B'1010'");
    expect(quote(new ArrayData(new OidArray(stringSubtype), ["a", "b"]))).toBe("'{a,b}'");
    expect(quote(new Range(1, 10, true))).toBe("'[1,10)'");
    expect(quote(Infinity)).toBe("'Infinity'");
  });

  it("serializes defaults for any PostgreSQL column, not only array columns", () => {
    const column = { sqlType: "integer", array: false };
    const typeMap = {
      lookup(sqlType: string) {
        expect(sqlType).toBe("integer");
        return { serialize: (value: unknown) => Number(value) + 1 };
      },
    };

    expect(quoteDefaultExpression(41, column, typeMap)).toBe(" DEFAULT 42");
  });

  it("serializes array defaults via fallback OidArray when type map misses", () => {
    const column = { sqlType: "text[]", array: true };
    const nullTypeMap = {
      lookup() {
        return null;
      },
    };
    expect(quoteDefaultExpression([], column, nullTypeMap)).toBe(" DEFAULT '{}'");
    expect(quoteDefaultExpression(["a", "b"], column, nullTypeMap)).toBe(" DEFAULT '{a,b}'");
  });

  it("does not apply array fallback when column.array is false", () => {
    const column = { sqlType: "text", array: false };
    const nullTypeMap = {
      lookup() {
        return null;
      },
    };
    // A plain string value should still round-trip normally
    expect(quoteDefaultExpression("hello", column, nullTypeMap)).toBe(" DEFAULT 'hello'");
  });

  it("serializes array defaults through the type map", () => {
    const arrayType = new OidArray(stringSubtype);
    const column = { sqlType: "text[]", array: true };
    const typeMap = {
      lookup() {
        return { serialize: (value: unknown) => new ArrayData(arrayType, value as unknown[]) };
      },
    };

    expect(quoteDefaultExpression(["a", "b"], column, typeMap)).toBe(" DEFAULT '{a,b}'");
  });

  it("serializes array defaults via an element subtype (per-element coercion)", () => {
    // Mirrors Rails postgresql/quoting.rb:161-163 where
    // lookup_cast_type_from_column returns OID::Array(IntegerType) and
    // serialize walks each element through Integer#serialize. Trails'
    // TypeMapLike returns the element subtype here; quoteDefaultExpression
    // must wrap it in OidArray so per-element casting fires.
    const column = { sqlType: "integer", array: true };
    const typeMap = {
      lookup() {
        return { cast: (v: unknown) => v, serialize: (v: unknown) => Number(v) + 100 };
      },
    };
    expect(quoteDefaultExpression([1, 2, 3], column, typeMap)).toBe(" DEFAULT '{101,102,103}'");
  });

  it("passes raw array-literal string defaults through without scalar coercion", () => {
    // Regression: when the value is a PG array literal string (e.g.
    // `"{}"`) on an array column, the element-subtype lookup must NOT
    // run — IntegerType#serialize("{}") would coerce to NaN. Rails
    // would route through OID::Array#serialize whose string path is a
    // pass-through; mirror that here.
    const column = { sqlType: "integer", array: true };
    const typeMap = {
      lookup() {
        return { serialize: (v: unknown) => Number(v) };
      },
    };
    expect(quoteDefaultExpression("{}", column, typeMap)).toBe(" DEFAULT '{}'");
    expect(quoteDefaultExpression("{1,2,3}", column, typeMap)).toBe(" DEFAULT '{1,2,3}'");
  });

  it("supports nested function calls up to 2 levels deep", () => {
    expect(columnNameMatcher().test("lower(name)")).toBe(true);
    expect(columnNameMatcher().test("lower(trim(name))")).toBe(true);
  });

  it("unescapes hex bytea values we now own locally", () => {
    expect(unescapeBytea("\\x6869")).toEqual(Buffer.from("hi"));
  });

  it("unescapes legacy octal bytea with escaped backslashes", () => {
    // PG::Connection.unescape_bytea handles the pre-9.0 octal format: \NNN
    // for bytes and \\ for a literal backslash. Parsed byte-by-byte so
    // high bytes aren't UTF-8 re-encoded.
    expect(unescapeBytea("a\\134\\000b")).toEqual(Buffer.from([0x61, 0x5c, 0x00, 0x62]));
  });

  it("quoteTableNameForAssignment drops the table prefix", () => {
    expect(quoteTableNameForAssignment("users", "name")).toBe('"name"');
  });

  it("quoteSchemaName delegates to quoteColumnName", () => {
    expect(quoteSchemaName("public")).toBe('"public"');
  });

  it("quotedBinary wraps escape_bytea output in SQL quotes", () => {
    expect(quotedBinary(Buffer.from("ab"))).toBe("'\\x6162'");
    expect(quotedBinary("ab")).toBe("'\\x6162'");
  });

  it("quote(Uint8Array) emits a bytea hex literal via quotedBinary", () => {
    // byte 0x8b (> 0x7f) must not be corrupted to the UTF-8 replacement
    // character sequence EF BF BD — regression for the String(buffer) path
    expect(quote(new Uint8Array([0x1f, 0x8b]))).toBe("'\\x1f8b'");
  });

  it("checkIntInRange is the Rails name for checkIntegerRange", () => {
    expect(() => checkIntInRange(BigInt("9223372036854775808"))).toThrow(IntegerOutOf64BitRange);
    expect(() => checkIntInRange(BigInt("9223372036854775807"))).not.toThrow();
  });

  it("lookupCastTypeFromColumn forwards oid/fmod/sqlType to the type map", () => {
    const calls: Array<[number, number, string]> = [];
    const typeMap = {
      lookup(oid: number, fmod: number, sqlType: string) {
        calls.push([oid, fmod, sqlType]);
        return { sentinel: true };
      },
    };
    const column = { oid: 23, fmod: -1, sqlType: "integer" };

    expect(lookupCastTypeFromColumn(column, typeMap)).toEqual({ sentinel: true });
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
      // Rails: (?:\s+COLLATE\s+"\w+")? — quoted identifier only.
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

  it("typeCast(new Date()) throws — Date is no longer accepted", () => {
    expect(() => typeCast(new Date())).toThrow(TypeError);
    expect(() => typeCast(new Date())).toThrow(/Temporal/);
  });
});

const stringSubtype = {
  cast: (value: unknown) => value,
  serialize: (value: unknown) => value,
};
