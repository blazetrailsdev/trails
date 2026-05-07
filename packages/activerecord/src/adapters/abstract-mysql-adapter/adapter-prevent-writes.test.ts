/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/adapter_prevent_writes_test.rb
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

  describe("AdapterPreventWritesTest", () => {
    it.skip("errors when a replace query is called while preventing writes", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in adapter-prevent-writes
      // ROOT-CAUSE: adapters/mysql2/adapter-prevent-writes.ts or abstract-mysql-adapter/adapter-prevent-writes.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/adapter-prevent-writes.ts; affects ~10–26 tests in adapter-prevent-writes.test.ts
    });
    it.skip("doesnt error when a describe query is called while preventing writes", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in adapter-prevent-writes
      // ROOT-CAUSE: adapters/mysql2/adapter-prevent-writes.ts or abstract-mysql-adapter/adapter-prevent-writes.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/adapter-prevent-writes.ts; affects ~10–26 tests in adapter-prevent-writes.test.ts
    });
    it.skip("doesnt error when a desc query is called while preventing writes", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in adapter-prevent-writes
      // ROOT-CAUSE: adapters/mysql2/adapter-prevent-writes.ts or abstract-mysql-adapter/adapter-prevent-writes.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/adapter-prevent-writes.ts; affects ~10–26 tests in adapter-prevent-writes.test.ts
    });
    it.skip("doesnt error when a use query is called while preventing writes", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in adapter-prevent-writes
      // ROOT-CAUSE: adapters/mysql2/adapter-prevent-writes.ts or abstract-mysql-adapter/adapter-prevent-writes.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/adapter-prevent-writes.ts; affects ~10–26 tests in adapter-prevent-writes.test.ts
    });
    it.skip("doesnt error when a kill query is called while preventing writes", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in adapter-prevent-writes
      // ROOT-CAUSE: adapters/mysql2/adapter-prevent-writes.ts or abstract-mysql-adapter/adapter-prevent-writes.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/adapter-prevent-writes.ts; affects ~10–26 tests in adapter-prevent-writes.test.ts
    });
  });
});
