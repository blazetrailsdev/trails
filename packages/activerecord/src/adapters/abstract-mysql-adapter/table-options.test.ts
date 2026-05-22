/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/table_options_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Version } from "../../connection-adapters/abstract-adapter.js";
import { SchemaDumper } from "../../schema-dumper.js";
import type { SchemaSource } from "../../schema-dumper.js";
import {
  describeIfMysql,
  isMariaDb,
  mysqlVersion,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "./test-helper.js";

// Rails: `skip "..." if @connection.database_version >= "5.7.22"`. We add
// MariaDB to the skip list since MariaDB never supported NO_TABLE_OPTIONS.
// Probed at module load so the conditional can sit on it.skipIf instead of
// inside the test body (which the lint rule forbids).
const skipNoTableOptions =
  isMariaDb || mysqlVersion === "" || new Version(mysqlVersion.replace(/-.*$/, "")).gte("5.7.22");

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
      await adapter.createTable(
        "mysql_table_options",
        {
          force: true,
          id: false,
          primaryKey: ["id", "account_id"],
          charset: "utf8mb4",
          collation: "utf8mb4_bin",
          options: "ENGINE=InnoDB\n/*!50100 PARTITION BY HASH (`account_id`)\nPARTITIONS 128 */",
        },
        (t: any) => {
          t.bigint("id", { null: false });
          t.bigint("account_id", { null: false, unsigned: true });
        },
      );
      const output = await dumpTable(adapter, "mysql_table_options");
      expect(output).toMatch(/primaryKey:\s*\["id",\s*"account_id"\]/);
      expect(output).toMatch(/charset:\s*"utf8mb4"/);
      expect(output).toMatch(/collation:\s*"utf8mb4_bin"/);
      expect(output).toMatch(/PARTITION BY HASH/);
    });

    it.skipIf(skipNoTableOptions)("schema dump works with NO_TABLE_OPTIONS sql mode", async () => {
      const oldMode = await adapter.showVariable("sql_mode");
      expect(oldMode).not.toBeNull();
      await adapter.execute(`SET @@SESSION.sql_mode='${oldMode!},NO_TABLE_OPTIONS'`);
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
      // Rails 5.1 migrations add ENGINE=InnoDB explicitly to CREATE TABLE.
      // The schema dump should show charset: but strip bare ENGINE=InnoDB (the default),
      // matching Rails expected: /charset: "utf8mb4"(..., options: "ENGINE=InnoDB ROW_FORMAT=DYNAMIC")?, force: :cascade/
      // We simulate a legacy migration result by creating a table with explicit ENGINE=InnoDB.
      await adapter.createTable("mysql_table_options", {
        force: true,
        options: "ENGINE=InnoDB",
      });
      const output = await dumpTable(adapter, "mysql_table_options");
      expect(output).toMatch(/createTable\("mysql_table_options",\s*\{[^}]*charset:\s*"utf8mb4"/);
      // Bare ENGINE=InnoDB is stripped by parseTableOptions — it must not appear in options:
      expect(output).not.toMatch(/options:\s*"ENGINE=InnoDB"(?!\s*ROW_FORMAT)/);
    });
  });
});
