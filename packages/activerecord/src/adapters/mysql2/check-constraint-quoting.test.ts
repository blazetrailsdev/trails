/**
 * Mirrors Rails activerecord/test/cases/adapters/mysql2/check_constraint_quoting_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  describeIfMysql,
  isMariaDb,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "../abstract-mysql-adapter/test-helper.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
    await adapter.createTable("trades", { force: true }, (t: any) => {
      t.string("name");
    });
  });
  afterEach(async () => {
    await adapter.dropTable("trades", { ifExists: true });
    await adapter.close();
  });

  describe("MySQL2CheckConstraintQuotingTest", () => {
    it("check constraint no duplicate expression quoting", async () => {
      await adapter.addCheckConstraint("trades", "name != 'forbidden_string'");

      const checkConstraints = await adapter.checkConstraints("trades");
      expect(checkConstraints.length).toBe(1);

      const expression = checkConstraints[0].expression;
      // MariaDB stores the expression unescaped; MySQL prefixes the string
      // literal with its connection charset introducer (_utf8mb4).
      const expected = isMariaDb
        ? "`name` <> 'forbidden_string'"
        : "`name` <> _utf8mb4'forbidden_string'";
      expect(expression).toBe(expected);
    });
  });
});
