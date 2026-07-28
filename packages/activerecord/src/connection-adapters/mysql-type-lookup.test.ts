/**
 * Mirrors Rails activerecord/test/cases/connection_adapters/mysql_type_lookup_test.rb
 */
import { it, expect, beforeEach } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { describeIfMysqlAdapter } from "../adapters/abstract-mysql-adapter/test-helper.js";

// Minimal subclass of the *concrete* Mysql2Adapter — char/varchar/enum/set
// string registrations live on the concrete adapter (mysql2_adapter.rb:40-49),
// not AbstractMysqlAdapter, so the type map under test must be the concrete
// one. A string config constructs inert (no live connection); only the static
// type map is exercised here.
class TestMysqlAdapter extends Mysql2Adapter {
  constructor() {
    super("mysql2://localhost/test");
  }
  override isWriteQuery(sql: string): boolean {
    return /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE)/i.test(sql);
  }
}

let adapter: TestMysqlAdapter;

beforeEach(() => {
  adapter = new TestMysqlAdapter();
  adapter.emulateBooleans = true;
});

function assertLookupType(expected: string, lookup: string) {
  const castType = adapter.lookupCastType(lookup);
  expect(castType.type()).toBe(expected);
}

describeIfMysqlAdapter("MysqlTypeLookupTest", () => {
  it("boolean types", () => {
    // emulate_booleans = true: tinyint(1) → boolean
    assertLookupType("boolean", "tinyint(1)");
    assertLookupType("boolean", "TINYINT(1)");

    // emulate_booleans = false: tinyint(1) → integer
    adapter.emulateBooleans = false;
    assertLookupType("integer", "tinyint(1)");
    assertLookupType("integer", "TINYINT(1)");
  });

  it("string types", () => {
    assertLookupType("string", "enum('one', 'two', 'three')");
    assertLookupType("string", "ENUM('one', 'two', 'three')");
    assertLookupType("string", "enum ('one', 'two', 'three')");
    assertLookupType("string", "ENUM ('one', 'two', 'three')");
    assertLookupType("string", "set('one', 'two', 'three')");
    assertLookupType("string", "SET('one', 'two', 'three')");
    assertLookupType("string", "set ('one', 'two', 'three')");
    assertLookupType("string", "SET ('one', 'two', 'three')");
  });

  it("set type with value matching other type", () => {
    assertLookupType("string", "SET('unicode', '8bit', 'none', 'time')");
  });

  it("enum type with value matching other type", () => {
    assertLookupType("string", "ENUM('unicode', '8bit', 'none', 'time')");
  });

  it("binary types", () => {
    assertLookupType("binary", "bit");
    assertLookupType("binary", "BIT");
    assertLookupType("binary", "binary(100)");
    assertLookupType("binary", "varbinary(255)");
  });

  it("integer types", () => {
    adapter.emulateBooleans = false;
    assertLookupType("integer", "tinyint(1)");
    assertLookupType("integer", "TINYINT(1)");
    assertLookupType("integer", "year");
    assertLookupType("integer", "YEAR");
  });
});
