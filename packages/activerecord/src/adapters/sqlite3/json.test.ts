/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/json_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { Base } from "../../index.js";

let adapter: SQLite3Adapter;

beforeEach(() => {
  adapter = new SQLite3Adapter(":memory:");
});

afterEach(() => {
  adapter.close();
});

describe("SQLite3JSONTest", () => {
  it("test_default", async () => {
    adapter.exec(`CREATE TABLE "json_data_type" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "payload" JSON DEFAULT '{}',
      "settings" JSON
    )`);

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
