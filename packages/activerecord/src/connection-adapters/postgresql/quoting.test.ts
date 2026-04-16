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
  quoteSchemaName,
  quoteTableNameForAssignment,
  typeCast,
  unescapeBytea,
} from "./quoting.js";

describe("PostgreSQL quoting", () => {
  it("inherits abstract boolean SQL literals", () => {
    expect(quotedTrue()).toBe("TRUE");
    expect(quotedFalse()).toBe("FALSE");
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

  it("documents the JavaScript regexp limitation for nested functions", () => {
    expect(columnNameMatcher().test("lower(name)")).toBe(true);
    expect(columnNameMatcher().test("lower(trim(name))")).toBe(false);
  });

  it("unescapes hex bytea values we now own locally", () => {
    expect(unescapeBytea("\\x6869")).toEqual(Buffer.from("hi"));
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
});

const stringSubtype = {
  cast: (value: unknown) => value,
  serialize: (value: unknown) => value,
};
