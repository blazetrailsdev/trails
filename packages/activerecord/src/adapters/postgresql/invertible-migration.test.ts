/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/invertible_migration_test.rb
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

  describe("PostgresqlInvertibleMigrationTest", () => {
    it.skip("up", async () => {});
    it.skip("down", async () => {});
    it.skip("change", async () => {});
    it.skip("revert", async () => {});
    it.skip("revert whole migration", async () => {});
    it.skip("migrate and revert", async () => {});
    it.skip("migrate revert add index with expression", () => {});
    it.skip("migrate revert create enum", () => {});
    it.skip("migrate revert drop enum", () => {});
    it.skip("migrate revert rename enum value", () => {});
    it.skip("migrate revert add and validate check constraint", () => {});
    it.skip("migrate revert add and validate foreign key", () => {});
  });
});
