/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/collation_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlCollationTest", () => {
    it.skip("columns collation", async () => {});
    it.skip("collation change", async () => {});
    it.skip("collation add", async () => {});
    it.skip("collation schema dump", async () => {});
    it.skip("collation default", async () => {});
  });
  it("string column with collation", async () => {
    adapter.exec(`CREATE TABLE "coll_str" ("id" INTEGER PRIMARY KEY, "name" TEXT COLLATE NOCASE)`);
    await adapter.executeMutation(`INSERT INTO "coll_str" ("name") VALUES ('Alice')`);
    const rows = await adapter.execute(`SELECT * FROM "coll_str" WHERE "name" = 'alice'`);
    expect(rows).toHaveLength(1);
  });

  it("text column with collation", async () => {
    adapter.exec(`CREATE TABLE "coll_text" ("id" INTEGER PRIMARY KEY, "body" TEXT COLLATE NOCASE)`);
    await adapter.executeMutation(`INSERT INTO "coll_text" ("body") VALUES ('Hello World')`);
    const rows = await adapter.execute(`SELECT * FROM "coll_text" WHERE "body" = 'hello world'`);
    expect(rows).toHaveLength(1);
  });

  it("add column with collation", async () => {
    adapter.exec(`CREATE TABLE "coll_add" ("id" INTEGER PRIMARY KEY)`);
    adapter.exec(`ALTER TABLE "coll_add" ADD COLUMN "title" TEXT COLLATE NOCASE`);
    await adapter.executeMutation(`INSERT INTO "coll_add" ("title") VALUES ('Test')`);
    const rows = await adapter.execute(`SELECT * FROM "coll_add" WHERE "title" = 'test'`);
    expect(rows).toHaveLength(1);
  });

  it("change column with collation", async () => {
    // Create table with a case-sensitive column
    adapter.exec(`CREATE TABLE "coll_change" ("id" INTEGER PRIMARY KEY, "title" TEXT)`);
    await adapter.executeMutation(`INSERT INTO "coll_change" ("title") VALUES ('Hello')`);
    // Case-sensitive by default: 'hello' should not match 'Hello'
    let rows = await adapter.execute(`SELECT * FROM "coll_change" WHERE "title" = 'hello'`);
    expect(rows).toHaveLength(0);

    // SQLite doesn't support ALTER COLUMN, so we recreate the table (Rails-style copy)
    adapter.exec(`ALTER TABLE "coll_change" RENAME TO "coll_change_old"`);
    adapter.exec(
      `CREATE TABLE "coll_change" ("id" INTEGER PRIMARY KEY, "title" TEXT COLLATE NOCASE)`,
    );
    adapter.exec(`INSERT INTO "coll_change" SELECT * FROM "coll_change_old"`);
    adapter.exec(`DROP TABLE "coll_change_old"`);

    // Now case-insensitive: 'hello' should match 'Hello'
    rows = await adapter.execute(`SELECT * FROM "coll_change" WHERE "title" = 'hello'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Hello");
  });

  it.skip("schema dump includes collation", () => {});
});
