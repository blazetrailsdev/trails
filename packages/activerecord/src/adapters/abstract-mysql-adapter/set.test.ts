/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/set_test.rb
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

  describe("SetTest", () => {
    it.skip("should not be unsigned", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in set
      // ROOT-CAUSE: adapters/mysql2/set.ts or abstract-mysql-adapter/set.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/set.ts; affects ~10–26 tests in set.test.ts
    });
    it.skip("should not be bigint", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in set
      // ROOT-CAUSE: adapters/mysql2/set.ts or abstract-mysql-adapter/set.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/set.ts; affects ~10–26 tests in set.test.ts
    });
    it.skip("schema dumping", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in set
      // ROOT-CAUSE: adapters/mysql2/set.ts or abstract-mysql-adapter/set.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/set.ts; affects ~10–26 tests in set.test.ts
    });
  });
});
