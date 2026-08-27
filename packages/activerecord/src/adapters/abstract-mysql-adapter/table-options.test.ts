import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Version } from "../../connection-adapters/abstract-adapter.js";
import { SchemaDumper } from "../../schema-dumper.js";
import type { SchemaSource } from "../../schema-dumper.js";
import {
  describeIfMysqlAdapter,
  isMariaDb,
  mysqlVersion,
  leaseMysqlAdapter,
  Mysql2Adapter,
} from "./test-helper.js";

const skipNoTableOptions =
  isMariaDb ||
  mysqlVersion === "" ||
  new Version(mysqlVersion.replace(/-.*$/, "")).compare("5.7.22") >= 0;

const dumpTable = (adapter: Mysql2Adapter, tableName: string) =>
  SchemaDumper.dumpTableSchema(adapter as unknown as SchemaSource, tableName);

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
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
      await adapter.createTable("mysql_table_options", {
        force: true,
        options: "ENGINE=InnoDB",
      });
      const output = await dumpTable(adapter, "mysql_table_options");
      expect(output).toMatch(/createTable\("mysql_table_options",\s*\{[^}]*charset:\s*"utf8mb4"/);
      expect(output).not.toMatch(/options:\s*"ENGINE=InnoDB"(?!\s*ROW_FORMAT)/);
    });
  });
});
