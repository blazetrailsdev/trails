import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Logger } from "@blazetrails/activesupport";
import { Version } from "../../connection-adapters/abstract-adapter.js";
import type { SchemaSource } from "../../schema-dumper.js";
import { Base } from "../../base.js";
import { Migration, Migrator } from "../../migration.js";
import type { MigrationProxy } from "../../migration.js";
import {
  describeIfMysqlAdapter,
  isMariaDb,
  mysqlVersion,
  leaseMysqlAdapter,
  Mysql2Adapter,
} from "./test-helper.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";

const skipNoTableOptions =
  isMariaDb ||
  mysqlVersion === "" ||
  new Version(mysqlVersion.replace(/-.*$/, "")).compare("5.7.22") >= 0;

const dumpTable = (adapter: Mysql2Adapter, tableName: string) =>
  dumpTableSchema(adapter as unknown as SchemaSource, tableName);

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
      const expected =
        /createTable\("mysql_table_options", \{ charset: "utf8mb4"(?:, collation: "\w+")?, options: "ENGINE=MyISAM", force: "cascade" \}/;
      expect(output).toMatch(expected);
    });

    it("table options with ROW_FORMAT", async () => {
      await adapter.createTable("mysql_table_options", {
        force: true,
        options: "ROW_FORMAT=REDUNDANT",
      });
      const output = await dumpTable(adapter, "mysql_table_options");
      const expected =
        /createTable\("mysql_table_options", \{ charset: "utf8mb4"(?:, collation: "\w+")?, options: "ENGINE=InnoDB ROW_FORMAT=REDUNDANT", force: "cascade" \}/;
      expect(output).toMatch(expected);
    });

    it("table options with CHARSET", async () => {
      await adapter.createTable("mysql_table_options", { force: true, options: "CHARSET=latin1" });
      const output = await dumpTable(adapter, "mysql_table_options");
      const expected =
        /createTable\("mysql_table_options", \{ charset: "latin1"(?:, collation: "\w+")?, force: "cascade" \}/;
      expect(output).toMatch(expected);
    });

    it("table options with COLLATE", async () => {
      await adapter.createTable("mysql_table_options", {
        force: true,
        options: "COLLATE=utf8mb4_bin",
      });
      const output = await dumpTable(adapter, "mysql_table_options");
      const expected =
        /createTable\("mysql_table_options", \{ charset: "utf8mb4", collation: "utf8mb4_bin", force: "cascade" \}/;
      expect(output).toMatch(expected);
    });

    it("charset and collation options", async () => {
      await adapter.createTable("mysql_table_options", {
        force: true,
        charset: "utf8mb4",
        collation: "utf8mb4_bin",
      });
      const output = await dumpTable(adapter, "mysql_table_options");
      const expected =
        /createTable\("mysql_table_options", \{ charset: "utf8mb4", collation: "utf8mb4_bin"(?:, options: "ENGINE=InnoDB ROW_FORMAT=DYNAMIC")?, force: "cascade" \}/;
      expect(output).toMatch(expected);
    });

    it("charset and partitioned table options", async () => {
      await adapter.createTable(
        "mysql_table_options",
        {
          primaryKey: ["id", "account_id"],
          charset: "utf8mb4",
          collation: "utf8mb4_bin",
          options: "ENGINE=InnoDB\n/*!50100 PARTITION BY HASH (`account_id`)\nPARTITIONS 128 */",
          force: "cascade",
        },
        (t: any) => {
          t.bigint("id", { null: false, autoIncrement: true });
          t.bigint("account_id", { null: false, unsigned: true });
        },
      );
      const output = await dumpTable(adapter, "mysql_table_options");
      const expected =
        /createTable\("mysql_table_options", \{ primaryKey: \["id","account_id"\], charset: "utf8mb4", collation: "utf8mb4_bin", options: "ENGINE=InnoDB\\n(\/\*!50100)? PARTITION BY HASH \(`account_id`\)\\nPARTITIONS 128( \*\/)?", force: "cascade" \}/;
      expect(output).toMatch(expected);
    });

    it.skipIf(skipNoTableOptions)("schema dump works with NO_TABLE_OPTIONS sql mode", async () => {
      const oldSqlMode = await adapter.queryValue("SELECT @@SESSION.sql_mode");
      const newSqlMode = `${oldSqlMode as string},NO_TABLE_OPTIONS`;

      try {
        await adapter.execute(`SET @@SESSION.sql_mode='${newSqlMode}'`);

        await adapter.createTable("mysql_table_options", { force: true });
        const output = await dumpTable(adapter, "mysql_table_options");
        expect(output).not.toMatch(/options:/);
      } finally {
        await adapter.execute(`SET @@SESSION.sql_mode='${oldSqlMode as string}'`);
      }
    });
  });

  describe("DefaultEngineOptionTest", () => {
    let loggerWas: unknown;
    let log: string[];
    let verboseWas: boolean;

    beforeEach(() => {
      loggerWas = Base.logger;
      log = [];
      verboseWas = Migration.verbose;
      Base.logger = new Logger({ write: (s: string) => log.push(s) }) as any;
      Migration.verbose = false;
    });

    afterEach(async () => {
      Base.logger = loggerWas as any;
      Migration.verbose = verboseWas;
      await adapter.dropTable("mysql_table_options", { ifExists: true });
    });

    it("new migrations do not contain default ENGINE=InnoDB option", async () => {
      await adapter.createTable("mysql_table_options", { force: true });

      expect(log.join("")).not.toMatch(/ENGINE=InnoDB/);

      const output = await dumpTable(adapter, "mysql_table_options");
      const expected =
        /createTable\("mysql_table_options", \{ charset: "utf8mb4"(?:, collation: "\w+")?(?:, options: "ENGINE=InnoDB ROW_FORMAT=DYNAMIC")?, force: "cascade" \}/;
      expect(output).toMatch(expected);
    });

    // BLOCKED: assertions-mysql-legacy-migration-engine-innodb-option — Migration::Compatibility stops at V7_1, so Migration[5.1] has no counterpart.
    it.skip("legacy migrations contain default ENGINE=InnoDB option", async () => {
      class LegacyMigration extends Migration.get(5.1) {
        override async migrate(_x: unknown): Promise<void> {
          await this.createTable("mysql_table_options", { force: true });
        }
      }
      const migration = new LegacyMigration();

      const pool = Base.connectionPool();
      await new Migrator(
        "up",
        [migration as unknown as MigrationProxy],
        pool.schemaMigration,
        pool.internalMetadata,
      ).migrate();

      expect(log.join("")).toMatch(/ENGINE=InnoDB/);

      const output = await dumpTable(adapter, "mysql_table_options");
      const expected =
        /createTable\("mysql_table_options", \{ charset: "utf8mb4"(?:, collation: "\w+")?, force: "cascade" \}/;
      expect(output).toMatch(expected);
    });
  });
});
