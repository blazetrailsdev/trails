/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/virtual_column_test.rb
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

  describe("PostgresqlVirtualColumnTest", () => {
    it.skip("virtual column", async () => {});
    it.skip("virtual column default", async () => {});
    it.skip("virtual column type cast", async () => {});
    it.skip("virtual column write", async () => {});
    it.skip("virtual column schema dump", async () => {});
    it.skip("virtual column migration", async () => {});
    it.skip("virtual column stored", async () => {});
    it.skip("non persisted column", async () => {});
  });

  describe("PostgresqlXmlTest", () => {
    it.skip("xml column", async () => {});
    it.skip("xml default", async () => {});
    it.skip("xml type cast", async () => {});
    it.skip("xml write", async () => {});
    it.skip("xml schema dump", async () => {});
    it.skip("null xml", async () => {});
    it.skip("round trip", async () => {});
  });
  it("virtual column with full inserts", async () => {
    adapter.exec(
      `CREATE TABLE "virt_full" ("id" INTEGER PRIMARY KEY, "x" INTEGER, "y" INTEGER, "sum" INTEGER GENERATED ALWAYS AS ("x" + "y") VIRTUAL)`,
    );
    // Cannot insert into generated columns — should only specify real columns
    await adapter.executeMutation(`INSERT INTO "virt_full" ("x", "y") VALUES (5, 3)`);
    const rows = await adapter.execute(`SELECT "sum" FROM "virt_full"`);
    expect(rows[0].sum).toBe(8);
  });

  it.skip("stored column", () => {});

  it.skip("change table", () => {});
});
