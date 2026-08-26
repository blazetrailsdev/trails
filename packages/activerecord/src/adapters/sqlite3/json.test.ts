/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/json_test.rb
 */
import { it, expect, beforeEach } from "vitest";
import "../../index.js";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";
import { jsonSharedTestCases, JsonDataType as klass } from "../../cases/json-shared-test-cases.js";
import type { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";

const columnType = "json";

describeIfSqlite("SQLite3JSONTest", () => {
  fixtures([]);

  let connection: SQLite3Adapter;

  // Registered before the shared module's setup so the table exists by the time
  // that hook reflects its columns; Ruby reflects lazily, per test.
  beforeEach(async () => {
    connection = (await Base.leaseConnection()) as unknown as SQLite3Adapter;
    // Teardown lives in the shared module's afterEach (Rails: JSONSharedTestCases#teardown).
    // eslint-disable-next-line blazetrails/require-table-teardown
    await connection.createTable("json_data_type", {}, (t: any) => {
      t.json("payload", { default: {} });
      t.json("settings");
    });
  });

  jsonSharedTestCases({ columnType });

  it("test_default", async () => {
    const defaultVal = { users: "read", posts: ["read", "write"] };
    await connection.addColumn("json_data_type", "permissions", columnType, {
      default: defaultVal,
    });
    await klass.resetColumnInformation();
    await klass.loadSchema();

    expect(klass.columnDefaults["permissions"]).toEqual(defaultVal);
    expect((new klass() as any).permissions).toEqual(defaultVal);
  });
});
