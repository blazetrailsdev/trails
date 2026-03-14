/**
 * Mirrors Rails activerecord/test/cases/adapters/mysql2/check_constraint_quoting_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import {
  describeIfMysql,
  MysqlAdapter,
  MYSQL_TEST_URL,
} from "../abstract-mysql-adapter/test-helper.js";

describeIfMysql("MysqlAdapter", () => {
  let adapter: MysqlAdapter;
  beforeEach(async () => {
    adapter = new MysqlAdapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("CheckConstraintQuotingTest", () => {
    it.skip("check constraint no duplicate expression quoting", () => {});
  });
});
