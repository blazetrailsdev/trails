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
      // Query EXTRA directly from information_schema — Mysql2Adapter#columns
      // doesn't surface auto_increment metadata on Column yet (separate gap).
      const isAutoIncrement = async (): Promise<boolean> => {
        const rows = (await adapter.execute(
          `SELECT EXTRA FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'delete_me' AND column_name = 'id'`,
        )) as Array<{ EXTRA?: string; extra?: string }>;
        const extra = String(rows[0]?.EXTRA ?? rows[0]?.extra ?? "").toLowerCase();
        return extra.includes("auto_increment");
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
