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
    it.skip("deadlock correctly raises Deadlocked inside nested SavepointTransaction", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in nested-deadlock
      // ROOT-CAUSE: adapters/mysql2/nested-deadlock.ts or abstract-mysql-adapter/nested-deadlock.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/nested-deadlock.ts; affects ~10–26 tests in nested-deadlock.test.ts
    });
    it.skip("rollback exception is swallowed after a rollback", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in nested-deadlock
      // ROOT-CAUSE: adapters/mysql2/nested-deadlock.ts or abstract-mysql-adapter/nested-deadlock.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/nested-deadlock.ts; affects ~10–26 tests in nested-deadlock.test.ts
    });
  });

  // -- Rails: abstract_mysql_adapter/sql_types_test.rb --
});
