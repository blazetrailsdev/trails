/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/rename_table_test.rb
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

  describe("PostgresqlRenameTableTest", () => {
    it.skip("rename table", async () => {});
    it.skip("rename table with index", async () => {});
    it.skip("rename table with sequence", async () => {});
    it.skip("rename table preserves data", async () => {});
    it.skip("renaming a table with uuid primary key and uuid_generate_v4() default also renames the primary key index", async () => {});
    it.skip("renaming a table with uuid primary key and gen_random_uuid() default also renames the primary key index", async () => {});
    it.skip("renaming a table also renames the primary key sequence", () => {});
    it.skip("renaming a table also renames the primary key index", () => {});
  });
});
