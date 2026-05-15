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

    it("index in create", async () => {
      for (const type of ["SPATIAL", "FULLTEXT", "UNIQUE"]) {
        const sqls = await captureSql(() =>
          adapter.schemaStatements().createTable("people", { id: false }, (t) => {
            t.index(["last_name"], { type });
          }),
        );
        expect(sqls[0]).toMatch(
          new RegExp(
            `^CREATE TABLE \`people\` \\(${type} INDEX \`index_people_on_last_name\` \\(\`last_name\`\\)\\)`,
          ),
        );
      }

      const sqls = await captureSql(() =>
        adapter.schemaStatements().createTable("people", { id: false }, (t) => {
          t.index(["last_name"], { length: { last_name: 10 }, using: "btree" });
        }),
      );
      expect(sqls[0]).toMatch(
        /^CREATE TABLE `people` \(INDEX `index_people_on_last_name` USING btree \(`last_name`\(10\)\)\)/,
      );
    });
    it("index in bulk change", async () => {
      for (const type of ["SPATIAL", "FULLTEXT", "UNIQUE"]) {
        const sqls = await captureSql(() =>
          adapter.schemaStatements().changeTable("people", { bulk: true }, (t) => {
            return t.index("last_name", { type });
          }),
        );
        expect(sqls[0]).toBe(
          `ALTER TABLE \`people\` ADD ${type} INDEX \`index_people_on_last_name\` (\`last_name\`)`,
        );
      }

      const sqls = await captureSql(() =>
        adapter.schemaStatements().changeTable("people", { bulk: true }, (t) => {
          return t.index("last_name", { length: 10, using: "btree", algorithm: "copy" });
        }),
      );
      expect(sqls[0]).toBe(
        "ALTER TABLE `people` ADD INDEX `index_people_on_last_name` USING btree (`last_name`(10)), ALGORITHM = COPY",
      );
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

    it("add timestamps", async () => {
      const ss = adapter.schemaStatements();
      try {
        await ss.createTable("delete_me", { force: true });
        await ss.addTimestamps("delete_me", { null: true });
        expect(await ss.columnExists("delete_me", "updated_at")).toBe(true);
        expect(await ss.columnExists("delete_me", "created_at")).toBe(true);
      } finally {
        await ss.dropTable("delete_me", { ifExists: true });
      }
    });
    it("remove timestamps", async () => {
      const ss = adapter.schemaStatements();
      try {
        await ss.createTable("delete_me", { force: true }, (t) => {
          return t.timestamps({ null: true });
        });
        await ss.removeTimestamps("delete_me");
        expect(await ss.columnExists("delete_me", "updated_at")).toBe(false);
        expect(await ss.columnExists("delete_me", "created_at")).toBe(false);
      } finally {
        await ss.dropTable("delete_me", { ifExists: true });
      }
    });
    it("indexes in create", async () => {
      const sqls = await captureSql(() =>
        adapter
          .schemaStatements()
          .createTable(
            "temp",
            { temporary: true, as: "SELECT id, name, zip FROM a_really_complicated_query" },
            (t) => {
              t.index(["zip"]);
            },
          ),
      );
      expect(sqls[0]).toMatch(
        /^CREATE TEMPORARY TABLE `temp` \(INDEX `index_temp_on_zip` \(`zip`\)\) AS SELECT id, name, zip FROM a_really_complicated_query/,
      );
    });
  });
});
