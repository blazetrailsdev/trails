/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/schema_migrations_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
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
