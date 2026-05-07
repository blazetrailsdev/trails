/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/mysql_enum_test.rb
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

  describe("MysqlEnumTest", () => {
    it.skip("should not be unsigned", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in mysql-enum
      // ROOT-CAUSE: adapters/mysql2/mysql-enum.ts or abstract-mysql-adapter/mysql-enum.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/mysql-enum.ts; affects ~10–26 tests in mysql-enum.test.ts
    });
    it.skip("should not be bigint", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in mysql-enum
      // ROOT-CAUSE: adapters/mysql2/mysql-enum.ts or abstract-mysql-adapter/mysql-enum.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/mysql-enum.ts; affects ~10–26 tests in mysql-enum.test.ts
    });
    it.skip("enum with attribute", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in mysql-enum
      // ROOT-CAUSE: adapters/mysql2/mysql-enum.ts or abstract-mysql-adapter/mysql-enum.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/mysql-enum.ts; affects ~10–26 tests in mysql-enum.test.ts
    });
  });
});
