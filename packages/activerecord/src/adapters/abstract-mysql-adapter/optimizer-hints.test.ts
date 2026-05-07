/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/optimizer_hints_test.rb
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

  describe("OptimizerHintsTest", () => {
    it.skip("optimizer hints", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in optimizer-hints
      // ROOT-CAUSE: adapters/mysql2/optimizer-hints.ts or abstract-mysql-adapter/optimizer-hints.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/optimizer-hints.ts; affects ~10–26 tests in optimizer-hints.test.ts
    });
  });
});
