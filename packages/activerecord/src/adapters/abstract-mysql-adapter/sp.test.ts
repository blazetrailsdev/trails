/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/sp_test.rb
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

  describe("StoredProcedureTest", () => {
    it.skip("multi results", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in sp
      // ROOT-CAUSE: adapters/mysql2/sp.ts or abstract-mysql-adapter/sp.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/sp.ts; affects ~10–26 tests in sp.test.ts
    });
    it.skip("multi results from select one", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in sp
      // ROOT-CAUSE: adapters/mysql2/sp.ts or abstract-mysql-adapter/sp.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/sp.ts; affects ~10–26 tests in sp.test.ts
    });
    it.skip("multi results from find by sql", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in sp
      // ROOT-CAUSE: adapters/mysql2/sp.ts or abstract-mysql-adapter/sp.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/sp.ts; affects ~10–26 tests in sp.test.ts
    });
  });
});
