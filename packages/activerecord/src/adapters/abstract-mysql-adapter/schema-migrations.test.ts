/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/schema_migrations_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, MysqlAdapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("MysqlAdapter", () => {
  let adapter: MysqlAdapter;
  beforeEach(async () => {
    adapter = new MysqlAdapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("SchemaMigrationsTest", () => {
    it.skip("renaming index on foreign key", () => {});
    it.skip("initializes schema migrations for encoding utf8mb4", () => {});
    it.skip("initializes internal metadata for encoding utf8mb4", () => {});
  });
});
