/**
 * Mirrors Rails activerecord/test/cases/connection_adapters/type_lookup_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import { IntegerType } from "@blazetrails/activemodel";

let adapter: SQLite3Adapter;

beforeEach(() => {
  adapter = new SQLite3Adapter(":memory:");
});

afterEach(() => {
  adapter.close();
});

function assertLookupType(expected: string, sqlType: string) {
  const castType = adapter.lookupCastType(sqlType);
  expect(castType.type()).toBe(expected);
}

describe("TypeLookupTest", () => {
  it("boolean types", () => {
    assertLookupType("boolean", "boolean");
    assertLookupType("boolean", "BOOLEAN");
  });

  it("string types", () => {
    assertLookupType("string", "char");
    assertLookupType("string", "varchar");
    assertLookupType("string", "VARCHAR");
    assertLookupType("string", "varchar(255)");
    assertLookupType("string", "character varying");
  });

  it("binary types", () => {
    assertLookupType("binary", "binary");
    assertLookupType("binary", "BINARY");
    assertLookupType("binary", "blob");
    assertLookupType("binary", "BLOB");
  });

  it("text types", () => {
    assertLookupType("text", "text");
    assertLookupType("text", "TEXT");
    assertLookupType("text", "clob");
    assertLookupType("text", "CLOB");
  });

  it("date types", () => {
    assertLookupType("date", "date");
    assertLookupType("date", "DATE");
  });

  it("time types", () => {
    assertLookupType("time", "time");
    assertLookupType("time", "TIME");
  });

  it("datetime types", () => {
    assertLookupType("datetime", "datetime");
    assertLookupType("datetime", "DATETIME");
    assertLookupType("datetime", "timestamp");
    assertLookupType("datetime", "TIMESTAMP");
  });

  it("decimal types", () => {
    assertLookupType("decimal", "decimal");
    assertLookupType("decimal", "decimal(2,8)");
    assertLookupType("decimal", "DECIMAL");
    assertLookupType("decimal", "numeric");
    assertLookupType("decimal", "numeric(2,8)");
    assertLookupType("decimal", "NUMERIC");
  });

  it("float types", () => {
    assertLookupType("float", "float");
    assertLookupType("float", "FLOAT");
    assertLookupType("float", "double");
    assertLookupType("float", "DOUBLE");
  });

  it("integer types", () => {
    assertLookupType("integer", "integer");
    assertLookupType("integer", "INTEGER");
    assertLookupType("integer", "tinyint");
    assertLookupType("integer", "smallint");
    assertLookupType("integer", "bigint");
  });

  it("bigint limit", () => {
    const castType = adapter.lookupCastType("bigint") as IntegerType;
    expect(castType.limit).toBe(8);
  });

  it("decimal without scale", () => {
    for (const sqlType of ["decimal(2)", "decimal(2,0)", "numeric(2)", "numeric(2,0)"]) {
      const castType = adapter.lookupCastType(sqlType);
      expect(castType.type()).toBe("decimal");
      expect(castType.cast(2.1)).toBe(2);
    }
  });
});
