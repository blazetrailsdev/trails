/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/bind_parameter_test.rb
 *
 * Tested at the adapter (`?`-bind / driver) layer — the convention for this
 * file and its sqlite3/postgresql siblings. Rails' `assert_quoted_as` pins a
 * *relation-layer* property: `Post.where("title = ?", value).to_sql` quotes a
 * typed value against a string column as a string literal (`0.0` → `'0.0'`,
 * `false` → `'0'`) so it does NOT match numerically. That type-aware quoting
 * happens in Arel, which knows `title`'s column type; the raw `?`-bind path
 * here has no such knowledge, so mysql2 sends a JS number as a numeric literal
 * and MySQL coerces. The `where with …` cases therefore assert coercion-based
 * matching, not Arel string-quoting — a faithful `match: 0` quoting assertion
 * is unreachable at this layer (it would need a relation-level `to_sql` test).
 * The `boolean` case is the closest to Rails' intent: it exercises the real
 * `mysqlBinds` `false → 0` normalization. `rational` has no JS equivalent, so
 * it degrades to a string-equality bind.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("AbstractMySQLAdapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("BindParameterTest", () => {
    beforeEach(async () => {
      await adapter.exec(
        "CREATE TABLE `bind_param_items` (`id` INT AUTO_INCREMENT PRIMARY KEY, `name` VARCHAR(255), `value` INT)",
      );
    });

    afterEach(async () => {
      try {
        await adapter.exec("DROP TABLE IF EXISTS `bind_param_items`");
      } catch {
        // ignore
      }
    });

    it("create question marks", async () => {
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        ["test?item", 42],
      );
      const rows = await adapter.execute("SELECT * FROM `bind_param_items`");
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("test?item");
      expect(rows[0].value).toBe(42);
    });

    it("update question marks", async () => {
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        ["original", 1],
      );
      await adapter.executeMutation("UPDATE `bind_param_items` SET `name` = ? WHERE `value` = ?", [
        "updated?name",
        1,
      ]);
      const rows = await adapter.execute("SELECT * FROM `bind_param_items` WHERE `value` = ?", [1]);
      expect(rows[0].name).toBe("updated?name");
    });

    it("update null bytes", async () => {
      const str = "foo\0bar";
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        ["original", 1],
      );
      await adapter.executeMutation("UPDATE `bind_param_items` SET `name` = ? WHERE `value` = ?", [
        str,
        1,
      ]);
      const rows = await adapter.execute("SELECT * FROM `bind_param_items` WHERE `value` = ?", [1]);
      expect(rows[0].name).toBe(str);
    });

    it("create null bytes", async () => {
      const str = "foo\0bar";
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        [str, 42],
      );
      const rows = await adapter.execute("SELECT * FROM `bind_param_items`");
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe(str);
    });

    it("where with string for string column using bind parameters", async () => {
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        ["hello", 1],
      );
      const rows = await adapter.execute("SELECT * FROM `bind_param_items` WHERE `name` = ?", [
        "hello",
      ]);
      expect(rows).toHaveLength(1);
    });

    it("where with integer for string column using bind parameters", async () => {
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        ["123", 1],
      );
      const rows = await adapter.execute(
        "SELECT * FROM `bind_param_items` WHERE `name` = ?",
        [123],
      );
      expect(rows).toHaveLength(1);
    });

    it("where with float for string column using bind parameters", async () => {
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        ["1.5", 1],
      );
      const rows = await adapter.execute(
        "SELECT * FROM `bind_param_items` WHERE `name` = ?",
        [1.5],
      );
      expect(rows).toHaveLength(1);
    });

    it("where with boolean for string column using bind parameters", async () => {
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        ["0", 1],
      );
      const rows = await adapter.execute("SELECT * FROM `bind_param_items` WHERE `name` = ?", [
        false,
      ]);
      expect(rows).toHaveLength(1);
    });

    it("where with decimal for string column using bind parameters", async () => {
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        ["99.99", 1],
      );
      const rows = await adapter.execute(
        "SELECT * FROM `bind_param_items` WHERE `name` = ?",
        [99.99],
      );
      expect(rows).toHaveLength(1);
    });

    it("where with rational for string column using bind parameters", async () => {
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        ["1/3", 1],
      );
      const rows = await adapter.execute("SELECT * FROM `bind_param_items` WHERE `name` = ?", [
        "1/3",
      ]);
      expect(rows).toHaveLength(1);
    });
  });
});
