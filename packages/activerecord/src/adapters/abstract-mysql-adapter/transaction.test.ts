/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/transaction_test.rb
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

  describe("TransactionTest", () => {
    it.skip("raises StatementTimeout when statement timeout exceeded", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in transaction
      // ROOT-CAUSE: adapters/mysql2/transaction.ts or abstract-mysql-adapter/transaction.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/transaction.ts; affects ~10–26 tests in transaction.test.ts
    });
    it.skip("reconnect preserves isolation level", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in transaction
      // ROOT-CAUSE: adapters/mysql2/transaction.ts or abstract-mysql-adapter/transaction.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/transaction.ts; affects ~10–26 tests in transaction.test.ts
    });
  });
});
