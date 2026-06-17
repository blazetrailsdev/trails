/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/json_test.rb
 * (plus the JSONSharedTestCases it includes).
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfSqlite } from "./test-helper.js";
import { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";
import { Base } from "../../index.js";

let adapter: AbstractSQLite3Adapter;

class JsonDataType extends Base {
  static {
    this.tableName = "json_data_type";
  }
}

beforeEach(async () => {
  adapter = new BetterSQLite3Adapter(":memory:");
  JsonDataType.adapter = adapter;
  // Mirrors Rails JSONSharedTestCases#setup creating the table ad-hoc:
  //   t.json "payload", default: {}
  //   t.json "settings"
  await adapter.createTable("json_data_type", {}, (t: any) => {
    t.json("payload", { default: "{}" });
    t.json("settings");
  });
});

afterEach(async () => {
  // Mirrors Rails JSONSharedTestCases#teardown: drop_table :json_data_type.
  await adapter.dropTable("json_data_type", { ifExists: true });
  adapter.close();
});

describeIfSqlite("SQLite3JSONTest", () => {
  it("test_assigning_string_literal", async () => {
    await JsonDataType.loadSchema();
    const json = await JsonDataType.create({ payload: "foo" });
    expect((json as any).payload).toBe("foo");
  });

  it("test_default", async () => {
    const defaultVal = { users: "read", posts: ["read", "write"] };
    await adapter.addColumn("json_data_type", "permissions", "json", {
      default: JSON.stringify(defaultVal),
    });
    await JsonDataType.loadSchema();

    expect(JsonDataType.columnDefaults["permissions"]).toEqual(defaultVal);
    expect((new JsonDataType() as any).permissions).toEqual(defaultVal);
  });
});
