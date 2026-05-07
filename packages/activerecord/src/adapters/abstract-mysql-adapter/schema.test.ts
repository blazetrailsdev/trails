/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/schema_test.rb
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

  describe("SchemaTest", () => {
    it.skip("float limits", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in schema
      // ROOT-CAUSE: adapters/mysql2/schema.ts or abstract-mysql-adapter/schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/schema.ts; affects ~10–26 tests in schema.test.ts
    });
    it.skip("schema", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in schema
      // ROOT-CAUSE: adapters/mysql2/schema.ts or abstract-mysql-adapter/schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/schema.ts; affects ~10–26 tests in schema.test.ts
    });
    it.skip("primary key", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in schema
      // ROOT-CAUSE: adapters/mysql2/schema.ts or abstract-mysql-adapter/schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/schema.ts; affects ~10–26 tests in schema.test.ts
    });
    it.skip("data source exists", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in schema
      // ROOT-CAUSE: adapters/mysql2/schema.ts or abstract-mysql-adapter/schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/schema.ts; affects ~10–26 tests in schema.test.ts
    });
    it.skip("dump indexes", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in schema
      // ROOT-CAUSE: adapters/mysql2/schema.ts or abstract-mysql-adapter/schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/schema.ts; affects ~10–26 tests in schema.test.ts
    });
    it.skip("drop temporary table", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in schema
      // ROOT-CAUSE: adapters/mysql2/schema.ts or abstract-mysql-adapter/schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/schema.ts; affects ~10–26 tests in schema.test.ts
    });
  });

  describe("MySQLAnsiQuotesTest", () => {
    it.skip("primary key method with ansi quotes", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in schema
      // ROOT-CAUSE: adapters/mysql2/schema.ts or abstract-mysql-adapter/schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/schema.ts; affects ~10–26 tests in schema.test.ts
    });
    it.skip("foreign keys method with ansi quotes", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in schema
      // ROOT-CAUSE: adapters/mysql2/schema.ts or abstract-mysql-adapter/schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/schema.ts; affects ~10–26 tests in schema.test.ts
    });
  });
});
