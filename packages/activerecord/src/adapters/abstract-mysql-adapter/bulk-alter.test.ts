/**
 * Mirrors Rails activerecord/test/cases/migration_test.rb
 * BulkAlterTableMigrationsTest — MySQL/Trilogy-only cases.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("Migration", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
    await adapter.exec("DROP TABLE IF EXISTS delete_me");
    await adapter.exec("CREATE TABLE delete_me (id INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (id))");
  });
  afterEach(async () => {
    await adapter.exec("DROP TABLE IF EXISTS delete_me");
    await adapter.close();
  });

  describe("BulkAlterTableMigrationsTest", () => {
    it("updating auto increment", async () => {
      const isAutoIncrement = async (): Promise<boolean> => {
        const cols = await adapter.columns("delete_me");
        const id = cols.find((c) => c.name === "id");
        return (id as { autoIncrement?: boolean })?.autoIncrement === true;
      };

      const ss = adapter.schemaStatements();
      await ss.changeTable("delete_me", { bulk: true }, (t: any) => {
        t.change("id", "bigint", { autoIncrement: true });
      });
      expect(await isAutoIncrement()).toBe(true);

      await ss.changeTable("delete_me", { bulk: true }, (t: any) => {
        t.change("id", "bigint", { autoIncrement: false });
      });
      expect(await isAutoIncrement()).toBe(false);
    });
  });
});
