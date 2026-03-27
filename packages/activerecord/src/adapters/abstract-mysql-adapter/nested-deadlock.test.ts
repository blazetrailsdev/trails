/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/nested_deadlock_test.rb
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

  describe("NestedDeadlockTest", () => {
    it.skip("deadlock correctly raises Deadlocked inside nested SavepointTransaction", () => {});
    it.skip("rollback exception is swallowed after a rollback", () => {});
  });

  // -- Rails: abstract_mysql_adapter/sql_types_test.rb --
});
