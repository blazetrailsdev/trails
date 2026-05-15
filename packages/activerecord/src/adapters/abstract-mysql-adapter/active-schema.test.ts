/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/active_schema_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { captureSql } from "../../testing/sql-capture.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("ActiveSchemaTest", () => {
    it("add index", async () => {
      let sqls = await captureSql(() => adapter.addIndex("people", "last_name", { length: null }));
      expect(sqls[0]).toBe("CREATE INDEX `index_people_on_last_name` ON `people` (`last_name`)");

      sqls = await captureSql(() => adapter.addIndex("people", "last_name", { length: 10 }));
      expect(sqls[0]).toBe(
        "CREATE INDEX `index_people_on_last_name` ON `people` (`last_name`(10))",
      );

      sqls = await captureSql(() =>
        adapter.addIndex("people", ["last_name", "first_name"], { length: 15 }),
      );
      expect(sqls[0]).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` ON `people` (`last_name`(15), `first_name`(15))",
      );

      sqls = await captureSql(() =>
        adapter.addIndex("people", ["last_name", "first_name"], { length: { last_name: 15 } }),
      );
      expect(sqls[0]).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` ON `people` (`last_name`(15), `first_name`)",
      );

      sqls = await captureSql(() =>
        adapter.addIndex("people", ["last_name", "first_name"], {
          length: { last_name: 15, first_name: 10 },
        }),
      );
      expect(sqls[0]).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` ON `people` (`last_name`(15), `first_name`(10))",
      );

      for (const type of ["SPATIAL", "FULLTEXT", "UNIQUE"]) {
        sqls = await captureSql(() => adapter.addIndex("people", "last_name", { type }));
        expect(sqls[0]).toBe(
          `CREATE ${type} INDEX \`index_people_on_last_name\` ON \`people\` (\`last_name\`)`,
        );
      }

      for (const using of ["btree", "hash"]) {
        sqls = await captureSql(() => adapter.addIndex("people", "last_name", { using }));
        expect(sqls[0]).toBe(
          `CREATE INDEX \`index_people_on_last_name\` USING ${using} ON \`people\` (\`last_name\`)`,
        );
      }

      sqls = await captureSql(() =>
        adapter.addIndex("people", "last_name", { length: 10, using: "btree" }),
      );
      expect(sqls[0]).toBe(
        "CREATE INDEX `index_people_on_last_name` USING btree ON `people` (`last_name`(10))",
      );

      for (const algorithm of ["default", "copy", "inplace", "instant"]) {
        sqls = await captureSql(() =>
          adapter.addIndex("people", "last_name", { length: 10, using: "btree", algorithm }),
        );
        expect(sqls[0]).toBe(
          `CREATE INDEX \`index_people_on_last_name\` USING btree ON \`people\` (\`last_name\`(10)) ALGORITHM = ${algorithm.toUpperCase()}`,
        );
      }

      await expect(() =>
        adapter.addIndex("people", "last_name", { algorithm: "coyp" }),
      ).rejects.toThrow(ArgumentError);

      sqls = await captureSql(() =>
        adapter.addIndex("people", ["last_name", "first_name"], { length: 15, using: "btree" }),
      );
      expect(sqls[0]).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` USING btree ON `people` (`last_name`(15), `first_name`(15))",
      );
    });

    it.skip("index in create", () => {
      // BLOCKED: adapter-mysql — createTable callback form needed + index-in-create emission
      // ROOT-CAUSE: MySQL createTable does not wire up inline INDEX clauses from TableDefinition.index()
      // SCOPE: Slot C (mysql DDL parity)
    });
    it.skip("index in bulk change", () => {
      // BLOCKED: adapter-mysql — changeTable bulk-mode not implemented for MySQL
      // ROOT-CAUSE: AbstractMysqlAdapter bulk change_table path missing
      // SCOPE: Slot D (bulk change-table ALTER coalescing)
    });

    it("drop table", async () => {
      const sqls = await captureSql(() => adapter.dropTable("people"));
      expect(sqls[0]).toBe("DROP TABLE `people`");
    });

    it("drop tables", async () => {
      const sqls = await captureSql(() => adapter.dropTable("people", "sobrinho"));
      expect(sqls[0]).toBe("DROP TABLE `people`, `sobrinho`");
    });

    it("create mysql database with encoding", async () => {
      let sqls = await captureSql(() => adapter.createDatabase("aimonetti", { charset: "latin1" }));
      expect(sqls[0]).toBe("CREATE DATABASE `aimonetti` DEFAULT CHARACTER SET `latin1`");

      sqls = await captureSql(() =>
        adapter.createDatabase("matt_aimonetti", { collation: "utf8mb4_bin" }),
      );
      expect(sqls[0]).toBe("CREATE DATABASE `matt_aimonetti` DEFAULT COLLATE `utf8mb4_bin`");
    });

    it("recreate mysql database with encoding", async () => {
      const sqls = await captureSql(() => adapter.recreateDatabase("luca", { charset: "latin1" }));
      expect(sqls).toContain("DROP DATABASE IF EXISTS `luca`");
      expect(sqls).toContain("CREATE DATABASE `luca` DEFAULT CHARACTER SET `latin1`");
    });

    it("add column", async () => {
      const sqls = await captureSql(() =>
        adapter.schemaStatements().addColumn("people", "last_name", "string"),
      );
      expect(sqls[0]).toBe("ALTER TABLE `people` ADD `last_name` varchar(255)");
    });

    it("add column with limit", async () => {
      const sqls = await captureSql(() =>
        adapter.schemaStatements().addColumn("people", "key", "string", { limit: 32 }),
      );
      expect(sqls[0]).toBe("ALTER TABLE `people` ADD `key` varchar(32)");
    });

    it("drop table with specific database", async () => {
      const sqls = await captureSql(() => adapter.dropTable("otherdb.people"));
      expect(sqls[0]).toBe("DROP TABLE `otherdb`.`people`");
    });

    it("drop tables with specific database", async () => {
      const sqls = await captureSql(() => adapter.dropTable("otherdb.people", "otherdb.sobrinho"));
      expect(sqls[0]).toBe("DROP TABLE `otherdb`.`people`, `otherdb`.`sobrinho`");
    });

    it.skip("add timestamps", () => {
      // BLOCKED: adapter-mysql — requires a real MySQL connection (with_real_execute scope)
      // ROOT-CAUSE: addTimestamps needs a live table to add columns to; captureSql-only harness insufficient
      // SCOPE: Slot D (live-table tests)
    });
    it.skip("remove timestamps", () => {
      // BLOCKED: adapter-mysql — requires a real MySQL connection (with_real_execute scope)
      // ROOT-CAUSE: removeTimestamps needs a live table; captureSql-only harness insufficient
      // SCOPE: Slot D (live-table tests)
    });
    it.skip("indexes in create", () => {
      // BLOCKED: adapter-mysql — createTable TEMPORARY + AS SELECT not implemented
      // ROOT-CAUSE: createTable options.temporary and options.as not wired in MysqlSchemaCreation
      // SCOPE: Slot C (mysql DDL parity)
    });
  });
});
