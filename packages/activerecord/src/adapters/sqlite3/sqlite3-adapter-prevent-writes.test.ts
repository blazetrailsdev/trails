import { it, expect, beforeEach, afterEach } from "vitest";
import "../../index.js";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";
import type { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { ReadOnlyError } from "../../errors.js";

let adapter: SQLite3Adapter;

describeIfSqlite("SQLite3AdapterPreventWritesTest", () => {
  fixtures([], { useTransactionalTests: false });

  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as unknown as SQLite3Adapter;
  });

  afterEach(async () => {
    await adapter.dropTable("pw", "pw2", "pw3", "pw4", "pw5", { ifExists: true });
  });

  it("errors when an insert query is called while preventing writes", async () => {
    await adapter.execute(`CREATE TABLE "pw" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    await Base.whilePreventingWrites(async () => {
      await expect(adapter.insert(`INSERT INTO "pw" ("name") VALUES ('x')`)).rejects.toThrow(
        ReadOnlyError,
      );
    });
  });

  it("errors when an update query is called while preventing writes", async () => {
    await adapter.execute(`CREATE TABLE "pw2" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    await adapter.execute(`INSERT INTO "pw2" ("name") VALUES ('x')`);
    await Base.whilePreventingWrites(async () => {
      await expect(adapter.update(`UPDATE "pw2" SET "name" = 'y'`)).rejects.toThrow(ReadOnlyError);
    });
  });

  it("errors when a delete query is called while preventing writes", async () => {
    await adapter.execute(`CREATE TABLE "pw3" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    await adapter.execute(`INSERT INTO "pw3" ("name") VALUES ('x')`);
    await Base.whilePreventingWrites(async () => {
      await expect(adapter.delete(`DELETE FROM "pw3"`)).rejects.toThrow(ReadOnlyError);
    });
  });

  it("errors when a replace query is called while preventing writes", async () => {
    await adapter.execute(`CREATE TABLE "pw4" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    await Base.whilePreventingWrites(async () => {
      await expect(
        adapter.execute(`REPLACE INTO "pw4" ("id", "name") VALUES (1, 'x')`),
      ).rejects.toThrow(ReadOnlyError);
    });
  });

  it("doesnt error when a select query is called while preventing writes", async () => {
    await adapter.execute(`CREATE TABLE "pw5" ("id" int, "data" string)`);
    await adapter.execute(`INSERT INTO pw5 (data) VALUES ('138853948594')`);

    await Base.whilePreventingWrites(async () => {
      expect(
        (await adapter.execute(`SELECT data from pw5 WHERE data = '138853948594'`))!.length,
      ).toEqual(1);
    });
  });

  it("doesnt error when a read query with leading chars is called while preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      const rows = (await adapter.execute(`  SELECT 1 AS val`))!;
      expect(rows[0].val).toBe(1);
    });
  });
});
