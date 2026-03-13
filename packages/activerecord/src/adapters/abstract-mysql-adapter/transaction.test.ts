/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/transaction_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, MysqlAdapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("MysqlAdapter", () => {
  let adapter: MysqlAdapter;
  beforeEach(async () => {
    adapter = new MysqlAdapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("TransactionTest", () => {
    it.skip("raises Deadlocked when a deadlock is encountered", () => {});
    it.skip("raises LockWaitTimeout when lock wait timeout exceeded", () => {});
    it.skip("raises StatementTimeout when statement timeout exceeded", () => {});
    it.skip("raises QueryCanceled when canceling statement due to user request", () => {});
    it.skip("reconnect preserves isolation level", () => {});
  });
});
