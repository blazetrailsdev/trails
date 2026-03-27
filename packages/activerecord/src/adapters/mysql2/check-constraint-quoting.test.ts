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
    it.skip("check constraint no duplicate expression quoting", () => {});
  });
});
