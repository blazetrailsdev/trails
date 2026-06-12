/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/json_test.rb
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfSqlite } from "./test-helper.js";
import { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";
import { Base } from "../../index.js";
import { defineSchema } from "../../test-helpers/define-schema.js";

let adapter: AbstractSQLite3Adapter;

beforeEach(() => {
  adapter = new BetterSQLite3Adapter(":memory:");
});

afterEach(() => {
  adapter.close();
});

describeIfSqlite("SQLite3JSONTest", () => {
  it("json string cast round-trip", async () => {
    await defineSchema(adapter, {
      json_string_cast: { data: "json" },
    });
    class JsonStringCast extends Base {
      static {
        this.tableName = "json_string_cast";
      }
    }
    JsonStringCast.adapter = adapter;
    await JsonStringCast.loadSchema();
    const record = new JsonStringCast();
    (record as any).data = '{"a":1}';
    await record.save();
    await record.reload();
    expect((record as any).data).toBe('{"a":1}');
  });

  it("test_default", async () => {
    await defineSchema(adapter, {
      json_data_type: {
        payload: { type: "json", default: "{}" },
        settings: "json",
      },
    });

    const defaultVal = { users: "read", posts: ["read", "write"] };
    await adapter.addColumn("json_data_type", "permissions", "json", {
      default: JSON.stringify(defaultVal),
    });

    class JsonDataType extends Base {
      static {
        this.tableName = "json_data_type";
      }
    }
    JsonDataType.adapter = adapter;
    await JsonDataType.loadSchema();

    const defaults = JsonDataType.columnDefaults;
    expect(defaults["permissions"]).toEqual({ users: "read", posts: ["read", "write"] });

    const record = new JsonDataType();
    expect((record as any).permissions).toEqual({ users: "read", posts: ["read", "write"] });
  });
});
