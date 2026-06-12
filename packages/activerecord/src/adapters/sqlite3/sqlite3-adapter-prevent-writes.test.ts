/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/sqlite3_adapter_prevent_writes_test.rb
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfSqlite } from "./test-helper.js";
import { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";
import { ReadOnlyError } from "../../errors.js";

let adapter: AbstractSQLite3Adapter;

beforeEach(() => {
  adapter = new BetterSQLite3Adapter(":memory:");
});

afterEach(() => {
  adapter.close();
});

// -- Rails test class: sqlite3_adapter_prevent_writes_test.rb --
describeIfSqlite("SQLite3AdapterPreventWritesTest", () => {
  it("errors when an insert query is called while preventing writes", async () => {
    adapter.exec(`CREATE TABLE "pw" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    await adapter.withPreventedWrites(async () => {
      await expect(
        adapter.executeMutation(`INSERT INTO "pw" ("name") VALUES ('x')`),
      ).rejects.toThrow(ReadOnlyError);
    });
  });

  it("errors when an update query is called while preventing writes", async () => {
    adapter.exec(`CREATE TABLE "pw2" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    await adapter.executeMutation(`INSERT INTO "pw2" ("name") VALUES ('x')`);
    await adapter.withPreventedWrites(async () => {
      await expect(adapter.executeMutation(`UPDATE "pw2" SET "name" = 'y'`)).rejects.toThrow(
        ReadOnlyError,
      );
    });
  });

  it("errors when a delete query is called while preventing writes", async () => {
    adapter.exec(`CREATE TABLE "pw3" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    await adapter.executeMutation(`INSERT INTO "pw3" ("name") VALUES ('x')`);
    await adapter.withPreventedWrites(async () => {
      await expect(adapter.executeMutation(`DELETE FROM "pw3"`)).rejects.toThrow(ReadOnlyError);
    });
  });

  it("errors when a replace query is called while preventing writes", async () => {
    adapter.exec(`CREATE TABLE "pw4" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    await adapter.withPreventedWrites(async () => {
      await expect(
        adapter.executeMutation(`REPLACE INTO "pw4" ("id", "name") VALUES (1, 'x')`),
      ).rejects.toThrow(ReadOnlyError);
    });
  });

  it("doesnt error when a select query is called while preventing writes", async () => {
    adapter.exec(`CREATE TABLE "pw5" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    await adapter.withPreventedWrites(async () => {
      const rows = await adapter.execute(`SELECT * FROM "pw5"`);
      expect(rows).toHaveLength(0);
    });
  });

  it("doesnt error when a read query with leading chars is called while preventing writes", async () => {
    await adapter.withPreventedWrites(async () => {
      const rows = await adapter.execute(`  SELECT 1 AS val`);
      expect(rows[0].val).toBe(1);
    });
  });
});

// -- Rails test class: statement_pool_test.rb --
// All tests null-overridden (Ruby process model)

// -- Rails test class: transaction_test.rb --
// All tests null-overridden (shared-cache mode not supported by better-sqlite3)
