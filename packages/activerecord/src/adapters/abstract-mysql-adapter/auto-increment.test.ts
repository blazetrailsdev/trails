/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/auto_increment_test.rb
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

  describe("AutoIncrementTest", () => {
    it.skip("auto increment without primary key", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in auto-increment
      // ROOT-CAUSE: adapters/mysql2/auto-increment.ts or abstract-mysql-adapter/auto-increment.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/auto-increment.ts; affects ~10–26 tests in auto-increment.test.ts
    });
    it.skip("auto increment with composite primary key", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in auto-increment
      // ROOT-CAUSE: adapters/mysql2/auto-increment.ts or abstract-mysql-adapter/auto-increment.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/auto-increment.ts; affects ~10–26 tests in auto-increment.test.ts
    });
    it.skip("auto increment false with custom primary key", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in auto-increment
      // ROOT-CAUSE: adapters/mysql2/auto-increment.ts or abstract-mysql-adapter/auto-increment.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/auto-increment.ts; affects ~10–26 tests in auto-increment.test.ts
    });
    it.skip("auto increment false with create table", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in auto-increment
      // ROOT-CAUSE: adapters/mysql2/auto-increment.ts or abstract-mysql-adapter/auto-increment.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/auto-increment.ts; affects ~10–26 tests in auto-increment.test.ts
    });
  });
});
