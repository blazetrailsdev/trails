/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/nested_deadlock_test.rb
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

  describe("NestedDeadlockTest", () => {
    it.skip("deadlock correctly raises Deadlocked inside nested SavepointTransaction", () => {});
    it.skip("rollback exception is swallowed after a rollback", () => {});
    it.skip("deadlock inside nested SavepointTransaction is recoverable", () => {});
  });

  // -- Rails: abstract_mysql_adapter/sql_types_test.rb --
});
