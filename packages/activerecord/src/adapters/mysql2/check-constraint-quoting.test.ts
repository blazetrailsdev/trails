/**
 * Mirrors Rails activerecord/test/cases/adapters/mysql2/check_constraint_quoting_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import {
  describeIfMysql,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "../abstract-mysql-adapter/test-helper.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("MySQL2CheckConstraintQuotingTest", () => {
    it.skip("check constraint no duplicate expression quoting", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in check-constraint-quoting
      // ROOT-CAUSE: adapters/mysql2/check-constraint-quoting.ts or abstract-mysql-adapter/check-constraint-quoting.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/check-constraint-quoting.ts; affects ~10–26 tests in check-constraint-quoting.test.ts
    });
  });
});
