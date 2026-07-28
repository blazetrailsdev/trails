/**
 * Mirrors Rails activerecord/test/cases/connection_adapters/type_lookup_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Type } from "@blazetrails/activemodel";
import { IntegerType } from "@blazetrails/activemodel";
import { Base } from "../base.js";
import { adapterType } from "../test-adapter.js";

interface TypeLookupConnection {
  lookupCastType(sqlType: string): Type;
}

let adapter: TypeLookupConnection;

beforeEach(async () => {
  adapter = (await Base.leaseConnection()) as unknown as TypeLookupConnection;
});

function assertLookupType(expected: string, sqlType: string) {
  const castType = adapter.lookupCastType(sqlType);
  expect(castType.type()).toBe(expected);
}

// Rails: class TypeLookupTest, gated `unless current_adapter?(:PostgreSQLAdapter)`
// (PostgreSQL has its own type-lookup suite). adapters: mysql + sqlite.
describe.skipIf(adapterType === "postgres")("TypeLookupTest", () => {
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
    assertLookupType("decimal", "number");
    assertLookupType("decimal", "number(2,8)");
    assertLookupType("decimal", "NUMBER");
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
    // Mirrors Rails test_bigint_limit (type_lookup_test.rb:84): it asserts the
    // PRIVATE `_limit` (`.send(:_limit)`), not the public `limit`. SQLite3Integer
    // overrides `_limit` to default to 8 (the 8-byte INTEGER storage class) while
    // leaving the public `limit` reader nil.
    const castType = adapter.lookupCastType("bigint") as IntegerType;
    const limit = (castType as unknown as { _limit(): number })._limit();
    expect(limit).toBe(8);
  });

  it("decimal without scale", () => {
    for (const sqlType of [
      "decimal(2)",
      "decimal(2,0)",
      "numeric(2)",
      "numeric(2,0)",
      "number(2)",
      "number(2,0)",
    ]) {
      const castType = adapter.lookupCastType(sqlType);
      expect(castType.type()).toBe("decimal");
      expect(castType.cast(2.1)).toBe(2);
    }
  });
});
