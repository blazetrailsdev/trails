/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/foreign_table_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlForeignTableTest", () => {
    it.skip("create foreign table", async () => {});
    it.skip("drop foreign table", async () => {});
    it.skip("foreign table exists", async () => {});
    it.skip("foreign table columns", async () => {});
    it.skip("foreign table options", async () => {});
    it.skip("foreign table schema dump", async () => {});
    it.skip("foreign table insert", async () => {});
    it.skip("foreign table select", async () => {});
    it.skip("foreign table update", async () => {});
    it.skip("foreign table delete", async () => {});
    it.skip("foreign tables are valid data sources", async () => {});
    it.skip("foreign tables", async () => {});
    it.skip("does not have a primary key", async () => {});
    it.skip("insert record", async () => {});
    it.skip("update record", async () => {});
    it.skip("delete record", async () => {});
  });
  it.skip("table exists", () => {
    /* TODO: needs imports from original file */
  });

  it.skip("attribute names", () => {
    /* TODO: needs imports from original file */
  });

  it.skip("attributes", () => {
    /* TODO: needs imports from original file */
  });
});
