import { describe, it, expect, beforeEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { describeIfMysqlAdapter, leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";
import { captureSql } from "../../testing/sql-capture.js";
import { isRowFormatDynamicByDefault } from "../../connection-adapters/mysql/schema-statements.js";
import { fixtures } from "../../test-fixtures.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });

  describe("ActiveSchemaTest", () => {
    fixtures(["people"], {
      usesTransaction: ["add index"],
    });

    it("add index", async () => {
      let sqls = await captureSql(() => adapter.addIndex("people", "last_name", { length: null }), {
        stub: adapter,
      });
      expect(sqls[0]).toBe("CREATE INDEX `index_people_on_last_name` ON `people` (`last_name`)");

      sqls = await captureSql(() => adapter.addIndex("people", "last_name", { length: 10 }), {
        stub: adapter,
      });
      expect(sqls[0]).toBe(
        "CREATE INDEX `index_people_on_last_name` ON `people` (`last_name`(10))",
      );

      sqls = await captureSql(
        () => adapter.addIndex("people", ["last_name", "first_name"], { length: 15 }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` ON `people` (`last_name`(15), `first_name`(15))",
      );

      sqls = await captureSql(
        () =>
          adapter.addIndex("people", ["last_name", "first_name"], { length: { last_name: 15 } }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` ON `people` (`last_name`(15), `first_name`)",
      );

      sqls = await captureSql(
        () =>
          adapter.addIndex("people", ["last_name", "first_name"], {
            length: { last_name: 15, first_name: 10 },
          }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` ON `people` (`last_name`(15), `first_name`(10))",
      );

      for (const type of ["SPATIAL", "FULLTEXT", "UNIQUE"]) {
        sqls = await captureSql(() => adapter.addIndex("people", "last_name", { type }), {
          stub: adapter,
        });
        expect(sqls[0]).toBe(
          `CREATE ${type} INDEX \`index_people_on_last_name\` ON \`people\` (\`last_name\`)`,
        );
      }

      for (const using of ["btree", "hash"]) {
        sqls = await captureSql(() => adapter.addIndex("people", "last_name", { using }), {
          stub: adapter,
        });
        expect(sqls[0]).toBe(
          `CREATE INDEX \`index_people_on_last_name\` USING ${using} ON \`people\` (\`last_name\`)`,
        );
      }

      sqls = await captureSql(
        () => adapter.addIndex("people", "last_name", { length: 10, using: "btree" }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe(
        "CREATE INDEX `index_people_on_last_name` USING btree ON `people` (`last_name`(10))",
      );

      for (const algorithm of ["default", "copy", "inplace", "instant"]) {
        sqls = await captureSql(
          () => adapter.addIndex("people", "last_name", { length: 10, using: "btree", algorithm }),
          { stub: adapter },
        );
        expect(sqls[0]).toBe(
          `CREATE INDEX \`index_people_on_last_name\` USING btree ON \`people\` (\`last_name\`(10)) ALGORITHM = ${algorithm.toUpperCase()}`,
        );
      }

      try {
        await adapter.addIndex("people", "first_name");
        expect(await adapter.indexExists("people", "first_name")).toBe(true);
        await expect(
          adapter.addIndex("people", "first_name", { ifNotExists: true }),
        ).resolves.toBeUndefined();
      } finally {
        await adapter.removeIndex("people", "first_name", { ifExists: true });
      }

      await expect(() =>
        adapter.addIndex("people", "last_name", { algorithm: "coyp" }),
      ).rejects.toThrow(ArgumentError);

      sqls = await captureSql(
        () =>
          adapter.addIndex("people", ["last_name", "first_name"], { length: 15, using: "btree" }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` USING btree ON `people` (`last_name`(15), `first_name`(15))",
      );
    });

    it("index in create", async () => {
      for (const type of ["SPATIAL", "FULLTEXT", "UNIQUE"]) {
        const sqls = await captureSql(
          () =>
            adapter.createTable("people", { id: false }, (t) => {
              t.index(["last_name"], { type });
            }),
          { stub: adapter },
        );
        expect(sqls[0]).toMatch(
          new RegExp(
            `^CREATE TABLE \`people\` \\(${type} INDEX \`index_people_on_last_name\` \\(\`last_name\`\\)\\)`,
          ),
        );
      }

      const sqls = await captureSql(
        () =>
          adapter.createTable("people", { id: false }, (t) => {
            t.index(["last_name"], { length: { last_name: 10 }, using: "btree" });
          }),
        { stub: adapter },
      );
      expect(sqls[0]).toMatch(
        /^CREATE TABLE `people` \(INDEX `index_people_on_last_name` USING btree \(`last_name`\(10\)\)\)/,
      );
    });
    it("index in bulk change", async () => {
      for (const type of ["SPATIAL", "FULLTEXT", "UNIQUE"]) {
        const sqls = await captureSql(
          () =>
            adapter.changeTable("people", { bulk: true }, (t) => {
              return t.index("last_name", { type });
            }),
          { stub: adapter },
        );
        expect(sqls[0]).toBe(
          `ALTER TABLE \`people\` ADD ${type} INDEX \`index_people_on_last_name\` (\`last_name\`)`,
        );
      }

      const sqls = await captureSql(
        () =>
          adapter.changeTable("people", { bulk: true }, (t) => {
            return t.index("last_name", { length: 10, using: "btree", algorithm: "copy" });
          }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe(
        "ALTER TABLE `people` ADD INDEX `index_people_on_last_name` USING btree (`last_name`(10)), ALGORITHM = COPY",
      );
    });

    it("drop table", async () => {
      // eslint-disable-next-line blazetrails/require-canonical-rebuild, blazetrails/require-table-teardown
      const sqls = await captureSql(() => adapter.dropTable("people"), { stub: adapter });
      expect(sqls[0]).toBe("DROP TABLE `people`");
    });

    it("drop tables", async () => {
      const sqls = await captureSql(() => adapter.dropTable("people", "sobrinho"), {
        stub: adapter,
      });
      expect(sqls[0]).toBe("DROP TABLE `people`, `sobrinho`");
    });

    it("create mysql database with encoding", async () => {
      // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors Rails' inline `if ActiveRecord::Base.lease_connection.send(:row_format_dynamic_by_default?)` (active_schema_test.rb:126-134)
      if (await isRowFormatDynamicByDefault.call(adapter)) {
        const sqls = await captureSql(() => adapter.createDatabase("matt"), { stub: adapter });
        expect(sqls[0]).toBe("CREATE DATABASE `matt` DEFAULT CHARACTER SET `utf8mb4`");
      } else {
        await expect(
          captureSql(() => adapter.createDatabase("matt"), { stub: adapter }),
        ).rejects.toThrow(
          "Configure a supported :charset and ensure innodb_large_prefix is enabled to support indexes on varchar(255) string columns.",
        );
      }

      let sqls = await captureSql(
        () => adapter.createDatabase("aimonetti", { charset: "latin1" }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe("CREATE DATABASE `aimonetti` DEFAULT CHARACTER SET `latin1`");

      sqls = await captureSql(
        () => adapter.createDatabase("matt_aimonetti", { collation: "utf8mb4_bin" }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe("CREATE DATABASE `matt_aimonetti` DEFAULT COLLATE `utf8mb4_bin`");
    });

    it("recreate mysql database with encoding", async () => {
      const sqls = await captureSql(() => adapter.recreateDatabase("luca", { charset: "latin1" }), {
        stub: adapter,
      });
      expect(sqls).toContain("DROP DATABASE IF EXISTS `luca`");
      expect(sqls).toContain("CREATE DATABASE `luca` DEFAULT CHARACTER SET `latin1`");
    });

    it("add column", async () => {
      const sqls = await captureSql(() => adapter.addColumn("people", "last_name", "string"), {
        stub: adapter,
      });
      expect(sqls[0]).toBe("ALTER TABLE `people` ADD `last_name` varchar(255)");
    });

    it("add column with limit", async () => {
      const sqls = await captureSql(
        () => adapter.addColumn("people", "key", "string", { limit: 32 }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe("ALTER TABLE `people` ADD `key` varchar(32)");
    });

    it("drop table with specific database", async () => {
      const sqls = await captureSql(() => adapter.dropTable("otherdb.people"), { stub: adapter });
      expect(sqls[0]).toBe("DROP TABLE `otherdb`.`people`");
    });

    it("drop tables with specific database", async () => {
      const sqls = await captureSql(() => adapter.dropTable("otherdb.people", "otherdb.sobrinho"), {
        stub: adapter,
      });
      expect(sqls[0]).toBe("DROP TABLE `otherdb`.`people`, `otherdb`.`sobrinho`");
    });

    it("add timestamps", async () => {
      const ss = adapter;
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
      const ss = adapter;
      try {
        await ss.createTable("delete_me", { force: true }, (t) => {
          t.timestamps({ null: true });
        });
        await ss.removeTimestamps("delete_me");
        expect(await ss.columnExists("delete_me", "updated_at")).toBe(false);
        expect(await ss.columnExists("delete_me", "created_at")).toBe(false);
      } finally {
        await ss.dropTable("delete_me", { ifExists: true });
      }
    });
    it("indexes in create", async () => {
      const sqls = await captureSql(
        () =>
          // eslint-disable-next-line blazetrails/require-table-teardown -- stub mode intercepts execute, so `temp` is never created (no teardown needed); mirrors Rails ActiveSchemaTest
          adapter.createTable(
            "temp",
            { temporary: true, as: "SELECT id, name, zip FROM a_really_complicated_query" },
            (t) => {
              t.index(["zip"]);
            },
          ),
        { stub: adapter },
      );
      expect(sqls[0]).toMatch(
        /^CREATE TEMPORARY TABLE `temp` \(INDEX `index_temp_on_zip` \(`zip`\)\)(?: ROW_FORMAT=DYNAMIC)? AS SELECT id, name, zip FROM a_really_complicated_query/,
      );
    });
  });
});
