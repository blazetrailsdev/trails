/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/bind_parameter_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, MysqlAdapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("AbstractMySQLAdapter", () => {
  let adapter: MysqlAdapter;
  beforeEach(async () => {
    adapter = new MysqlAdapter(MYSQL_TEST_URL);
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

    it.skip("update null bytes", () => {});
    it.skip("create null bytes", () => {});

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

    it.skip("where with float for string column using bind parameters", () => {});
    it.skip("where with boolean for string column using bind parameters", () => {});
    it.skip("where with decimal for string column using bind parameters", () => {});
    it.skip("where with rational for string column using bind parameters", () => {});
  });
});
