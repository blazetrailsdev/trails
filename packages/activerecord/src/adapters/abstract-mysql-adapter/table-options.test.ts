/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/table_options_test.rb
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

  describe("TableOptionsTest", () => {
    it.skip("table options with ENGINE", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in table-options
      // ROOT-CAUSE: adapters/mysql2/table-options.ts or abstract-mysql-adapter/table-options.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/table-options.ts; affects ~10–26 tests in table-options.test.ts
    });
    it.skip("table options with ROW_FORMAT", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in table-options
      // ROOT-CAUSE: adapters/mysql2/table-options.ts or abstract-mysql-adapter/table-options.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/table-options.ts; affects ~10–26 tests in table-options.test.ts
    });
    it.skip("table options with CHARSET", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in table-options
      // ROOT-CAUSE: adapters/mysql2/table-options.ts or abstract-mysql-adapter/table-options.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/table-options.ts; affects ~10–26 tests in table-options.test.ts
    });
    it.skip("table options with COLLATE", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in table-options
      // ROOT-CAUSE: adapters/mysql2/table-options.ts or abstract-mysql-adapter/table-options.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/table-options.ts; affects ~10–26 tests in table-options.test.ts
    });
    it.skip("charset and collation options", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in table-options
      // ROOT-CAUSE: adapters/mysql2/table-options.ts or abstract-mysql-adapter/table-options.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/table-options.ts; affects ~10–26 tests in table-options.test.ts
    });
    it.skip("charset and partitioned table options", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in table-options
      // ROOT-CAUSE: adapters/mysql2/table-options.ts or abstract-mysql-adapter/table-options.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/table-options.ts; affects ~10–26 tests in table-options.test.ts
    });
    it.skip("schema dump works with NO_TABLE_OPTIONS sql mode", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in table-options
      // ROOT-CAUSE: adapters/mysql2/table-options.ts or abstract-mysql-adapter/table-options.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/table-options.ts; affects ~10–26 tests in table-options.test.ts
    });
  });

  describe("DefaultEngineOptionTest", () => {
    it.skip("new migrations do not contain default ENGINE=InnoDB option", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in table-options
      // ROOT-CAUSE: adapters/mysql2/table-options.ts or abstract-mysql-adapter/table-options.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/table-options.ts; affects ~10–26 tests in table-options.test.ts
    });
    it.skip("legacy migrations contain default ENGINE=InnoDB option", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in table-options
      // ROOT-CAUSE: adapters/mysql2/table-options.ts or abstract-mysql-adapter/table-options.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/table-options.ts; affects ~10–26 tests in table-options.test.ts
    });
  });
});
