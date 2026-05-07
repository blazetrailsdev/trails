/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/unsigned_type_test.rb
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

  describe("UnsignedTypeTest", () => {
    it.skip("unsigned int max value is in range", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in unsigned-type
      // ROOT-CAUSE: adapters/mysql2/unsigned-type.ts or abstract-mysql-adapter/unsigned-type.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/unsigned-type.ts; affects ~10–26 tests in unsigned-type.test.ts
    });
    it.skip("minus value is out of range", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in unsigned-type
      // ROOT-CAUSE: adapters/mysql2/unsigned-type.ts or abstract-mysql-adapter/unsigned-type.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/unsigned-type.ts; affects ~10–26 tests in unsigned-type.test.ts
    });
    it.skip("schema definition can use unsigned as the type", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in unsigned-type
      // ROOT-CAUSE: adapters/mysql2/unsigned-type.ts or abstract-mysql-adapter/unsigned-type.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/unsigned-type.ts; affects ~10–26 tests in unsigned-type.test.ts
    });
    it.skip("deprecate unsigned_float and unsigned_decimal", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in unsigned-type
      // ROOT-CAUSE: adapters/mysql2/unsigned-type.ts or abstract-mysql-adapter/unsigned-type.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/unsigned-type.ts; affects ~10–26 tests in unsigned-type.test.ts
    });
    it.skip("schema dump includes unsigned option", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in unsigned-type
      // ROOT-CAUSE: adapters/mysql2/unsigned-type.ts or abstract-mysql-adapter/unsigned-type.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/unsigned-type.ts; affects ~10–26 tests in unsigned-type.test.ts
    });
  });
});
