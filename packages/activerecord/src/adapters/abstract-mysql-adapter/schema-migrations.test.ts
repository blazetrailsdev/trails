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
    it.skip("renaming index on foreign key", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in schema-migrations
      // ROOT-CAUSE: adapters/mysql2/schema-migrations.ts or abstract-mysql-adapter/schema-migrations.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/schema-migrations.ts; affects ~10–26 tests in schema-migrations.test.ts
    });
    it.skip("initializes schema migrations for encoding utf8mb4", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in schema-migrations
      // ROOT-CAUSE: adapters/mysql2/schema-migrations.ts or abstract-mysql-adapter/schema-migrations.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/schema-migrations.ts; affects ~10–26 tests in schema-migrations.test.ts
    });
    it.skip("initializes internal metadata for encoding utf8mb4", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in schema-migrations
      // ROOT-CAUSE: adapters/mysql2/schema-migrations.ts or abstract-mysql-adapter/schema-migrations.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/schema-migrations.ts; affects ~10–26 tests in schema-migrations.test.ts
    });
  });
});
