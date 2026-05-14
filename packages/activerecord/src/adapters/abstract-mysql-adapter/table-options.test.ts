/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/table_options_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SchemaDumper } from "../../schema-dumper.js";
import type { SchemaSource } from "../../schema-dumper.js";
import { describeIfMysql, isMariaDb, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";

const dumpTable = (adapter: Mysql2Adapter, tableName: string) =>
  SchemaDumper.dumpTableSchema(adapter as unknown as SchemaSource, tableName);

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("TableOptionsTest", () => {
    afterEach(async () => {
      await adapter.dropTable("mysql_table_options", { ifExists: true });
    });

    it("table options with ENGINE", async () => {
      await adapter.createTable("mysql_table_options", { force: true, options: "ENGINE=MyISAM" });
      const output = await dumpTable(adapter, "mysql_table_options");
      expect(output).toMatch(/createTable\("mysql_table_options",\s*\{[^}]*charset:\s*"utf8mb4"/);
      expect(output).toMatch(/options:\s*"ENGINE=MyISAM"/);
      expect(output).toMatch(/force:\s*"cascade"/);
    });

    it("table options with ROW_FORMAT", async () => {
      await adapter.createTable("mysql_table_options", {
        force: true,
        options: "ROW_FORMAT=REDUNDANT",
      });
      const output = await dumpTable(adapter, "mysql_table_options");
      expect(output).toMatch(/createTable\("mysql_table_options",\s*\{[^}]*charset:\s*"utf8mb4"/);
      expect(output).toMatch(/options:\s*"ENGINE=InnoDB ROW_FORMAT=REDUNDANT"/);
    });

    it("table options with CHARSET", async () => {
      await adapter.createTable("mysql_table_options", { force: true, options: "CHARSET=latin1" });
      const output = await dumpTable(adapter, "mysql_table_options");
      expect(output).toMatch(/createTable\("mysql_table_options",\s*\{[^}]*charset:\s*"latin1"/);
      expect(output).not.toMatch(/options:/);
    });

    it("table options with COLLATE", async () => {
      await adapter.createTable("mysql_table_options", {
        force: true,
        options: "COLLATE=utf8mb4_bin",
      });
      const output = await dumpTable(adapter, "mysql_table_options");
      expect(output).toMatch(/createTable\("mysql_table_options",\s*\{[^}]*charset:\s*"utf8mb4"/);
      expect(output).toMatch(/collation:\s*"utf8mb4_bin"/);
    });

    it("charset and collation options", async () => {
      await adapter.createTable("mysql_table_options", {
        force: true,
        options: "DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin",
      });
      const output = await dumpTable(adapter, "mysql_table_options");
      expect(output).toMatch(/createTable\("mysql_table_options",\s*\{[^}]*charset:\s*"utf8mb4"/);
      expect(output).toMatch(/collation:\s*"utf8mb4_bin"/);
    });

    it("charset and partitioned table options", async () => {
      // Use raw SQL to create composite-PK + partitioned table since our createTable
      // DSL does not yet support composite primary keys as a table option.
      await adapter.dropTable("mysql_table_options", { ifExists: true });
      await adapter.execute(
        "CREATE TABLE `mysql_table_options` (" +
          "`id` BIGINT NOT NULL AUTO_INCREMENT, " +
          "`account_id` BIGINT UNSIGNED NOT NULL, " +
          "PRIMARY KEY (`id`, `account_id`)" +
          ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin\n" +
          "/*!50100 PARTITION BY HASH (`account_id`)\nPARTITIONS 128 */",
      );
      const output = await dumpTable(adapter, "mysql_table_options");
      expect(output).toMatch(/primaryKey:\s*\["id",\s*"account_id"\]/);
      expect(output).toMatch(/charset:\s*"utf8mb4"/);
      expect(output).toMatch(/collation:\s*"utf8mb4_bin"/);
      expect(output).toMatch(/PARTITION BY HASH/);
    });

    it("schema dump works with NO_TABLE_OPTIONS sql mode", async () => {
      // As of MySQL 5.7.22, NO_TABLE_OPTIONS is deprecated and removed in MySQL 8+
      // Skip on MariaDB and newer MySQL where the mode doesn't exist
      if (!isMariaDb) {
        const version = await adapter.showVariable("version");
        if (!version || version >= "5.7.22") return;
      } else {
        return; // MariaDB doesn't support NO_TABLE_OPTIONS
      }

      const oldMode = await adapter.showVariable("sql_mode");
      if (!oldMode) return;
      await adapter.execute(`SET @@SESSION.sql_mode='${oldMode},NO_TABLE_OPTIONS'`);
      try {
        await adapter.createTable("mysql_table_options", { force: true });
        const output = await dumpTable(adapter, "mysql_table_options");
        expect(output).not.toMatch(/options:/);
      } finally {
        await adapter.execute(`SET @@SESSION.sql_mode='${oldMode}'`);
      }
    });
  });

  describe("DefaultEngineOptionTest", () => {
    afterEach(async () => {
      await adapter.dropTable("mysql_table_options", { ifExists: true });
    });

    it("new migrations do not contain default ENGINE=InnoDB option", async () => {
      await adapter.createTable("mysql_table_options", { force: true });
      const output = await dumpTable(adapter, "mysql_table_options");
      expect(output).toMatch(/createTable\("mysql_table_options",\s*\{[^}]*charset:\s*"utf8mb4"/);
      expect(output).not.toMatch(/ENGINE=InnoDB(?!.*ROW_FORMAT)/);
    });

    it("legacy migrations contain default ENGINE=InnoDB option", async () => {
      // Rails 5.1 migration format adds ENGINE=InnoDB explicitly.
      // We simulate by creating with explicit options string.
      await adapter.createTable("mysql_table_options", {
        force: true,
        options: "ENGINE=InnoDB ROW_FORMAT=COMPACT",
      });
      const output = await dumpTable(adapter, "mysql_table_options");
      expect(output).toMatch(/createTable\("mysql_table_options",\s*\{[^}]*charset:\s*"utf8mb4"/);
      expect(output).toMatch(/options:\s*"ENGINE=InnoDB ROW_FORMAT=COMPACT"/);
    });
  });
});
