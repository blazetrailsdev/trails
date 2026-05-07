/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/virtual_column_test.rb
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

  describe("VirtualColumnTest", () => {
    it.skip("virtual column", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in virtual-column
      // ROOT-CAUSE: adapters/mysql2/virtual-column.ts or abstract-mysql-adapter/virtual-column.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/virtual-column.ts; affects ~10–26 tests in virtual-column.test.ts
    });
    it.skip("schema dumping", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in virtual-column
      // ROOT-CAUSE: adapters/mysql2/virtual-column.ts or abstract-mysql-adapter/virtual-column.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/virtual-column.ts; affects ~10–26 tests in virtual-column.test.ts
    });
  });
});
