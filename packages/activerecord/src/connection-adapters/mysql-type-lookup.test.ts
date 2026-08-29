import { it, expect, beforeEach } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { describeIfMysqlAdapter } from "../support/describe-if-mysql-adapter.js";

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
    assertLookupType("boolean", "tinyint(1)");
    assertLookupType("boolean", "TINYINT(1)");
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
  });

  it("integer types", () => {
    adapter.emulateBooleans = false;
    assertLookupType("integer", "tinyint(1)");
    assertLookupType("integer", "TINYINT(1)");
    assertLookupType("integer", "year");
    assertLookupType("integer", "YEAR");
  });
});
