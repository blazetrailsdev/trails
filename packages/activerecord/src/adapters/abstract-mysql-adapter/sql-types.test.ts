/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/sql_types_test.rb
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

  describe("SqlTypesTest", () => {
    it.skip("binary types", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in sql-types
      // ROOT-CAUSE: adapters/mysql2/sql-types.ts or abstract-mysql-adapter/sql-types.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/sql-types.ts; affects ~10–26 tests in sql-types.test.ts
    });
  });
});
