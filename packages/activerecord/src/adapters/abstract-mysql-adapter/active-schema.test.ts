/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/active_schema_test.rb
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

  describe("ActiveSchemaTest", () => {
    it.skip("add index", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
    it.skip("index in create", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
    it.skip("index in bulk change", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
    it.skip("drop table", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
    it.skip("drop tables", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
    it.skip("create mysql database with encoding", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
    it.skip("recreate mysql database with encoding", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
    it.skip("add column", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
    it.skip("add column with limit", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
    it.skip("drop table with specific database", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
    it.skip("drop tables with specific database", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
    it.skip("add timestamps", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
    it.skip("remove timestamps", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
    it.skip("indexes in create", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in active-schema
      // ROOT-CAUSE: adapters/mysql2/active-schema.ts or abstract-mysql-adapter/active-schema.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/active-schema.ts; affects ~10–26 tests in active-schema.test.ts
    });
  });
});
