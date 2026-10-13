import { RuntimeError, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { describeIfMysqlAdapter, leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";
import { resetConnection } from "../../support/connection-helper.js";
import { assertQueriesMatch } from "../../testing/query-assertions.js";
import { assertNothingRaised, assertRaises, Notifications } from "@blazetrails/activesupport";
import {
  defaultRowFormat,
  isRowFormatDynamicByDefault,
} from "../../connection-adapters/mysql/schema-statements.js";
import { fixtures } from "../../test-helpers/use-fixtures.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;

  describe("ActiveSchemaTest", () => {
    beforeEach(async () => {
      adapter = await leaseMysqlAdapter();
      await defaultRowFormat.call(adapter as never);
      const singletonClass = rbObjSingletonClass(adapter) as typeof Mysql2Adapter;
      singletonClass.prototype.execute = async function (sql: string, name: string | null = null) {
        return Notifications.instrumenter.instrument(
          "sql.active_record",
          { sql, name, connection: this },
          () => sql,
        );
      };
    });

    afterEach(async () => {
      await resetConnection();
    });

    fixtures(["people"], {
      usesTransaction: ["add index"],
    });

    it("add index", async () => {
      expect(await adapter.addIndex("people", "last_name", { length: null })).toBe(
        "CREATE INDEX `index_people_on_last_name` ON `people` (`last_name`)",
      );

      expect(await adapter.addIndex("people", "last_name", { length: 10 })).toBe(
        "CREATE INDEX `index_people_on_last_name` ON `people` (`last_name`(10))",
      );

      expect(await adapter.addIndex("people", ["last_name", "first_name"], { length: 15 })).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` ON `people` (`last_name`(15), `first_name`(15))",
      );
      expect(await adapter.addIndex("people", ["last_name", "first_name"], { length: 15 })).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` ON `people` (`last_name`(15), `first_name`(15))",
      );

      expect(
        await adapter.addIndex("people", ["last_name", "first_name"], {
          length: { last_name: 15 },
        }),
      ).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` ON `people` (`last_name`(15), `first_name`)",
      );
      expect(
        await adapter.addIndex("people", ["last_name", "first_name"], {
          length: { last_name: 15 },
        }),
      ).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` ON `people` (`last_name`(15), `first_name`)",
      );

      expect(
        await adapter.addIndex("people", ["last_name", "first_name"], {
          length: { last_name: 15, first_name: 10 },
        }),
      ).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` ON `people` (`last_name`(15), `first_name`(10))",
      );
      expect(
        await adapter.addIndex("people", ["last_name", "first_name"], {
          length: { last_name: 15, first_name: 10 },
        }),
      ).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` ON `people` (`last_name`(15), `first_name`(10))",
      );

      for (const type of ["SPATIAL", "FULLTEXT", "UNIQUE"]) {
        expect(await adapter.addIndex("people", "last_name", { type })).toBe(
          `CREATE ${type} INDEX \`index_people_on_last_name\` ON \`people\` (\`last_name\`)`,
        );
      }

      for (const using of ["btree", "hash"]) {
        expect(await adapter.addIndex("people", "last_name", { using })).toBe(
          `CREATE INDEX \`index_people_on_last_name\` USING ${using} ON \`people\` (\`last_name\`)`,
        );
      }

      expect(await adapter.addIndex("people", "last_name", { length: 10, using: "btree" })).toBe(
        "CREATE INDEX `index_people_on_last_name` USING btree ON `people` (`last_name`(10))",
      );

      for (const algorithm of ["default", "copy", "inplace", "instant"]) {
        expect(
          await adapter.addIndex("people", "last_name", { length: 10, using: "btree", algorithm }),
        ).toBe(
          `CREATE INDEX \`index_people_on_last_name\` USING btree ON \`people\` (\`last_name\`(10)) ALGORITHM = ${algorithm.toUpperCase()}`,
        );
      }

      await withRealExecute(async () => {
        await adapter.addIndex("people", "first_name");
        expect(await adapter.indexExists("people", "first_name")).toBeTruthy();

        await assertNothingRaised(async () => {
          await adapter.addIndex("people", "first_name", { ifNotExists: true });
        });
      });

      await expect(() =>
        adapter.addIndex("people", "last_name", { algorithm: "coyp" }),
      ).rejects.toThrow(ArgumentError);

      expect(
        await adapter.addIndex("people", ["last_name", "first_name"], {
          length: 15,
          using: "btree",
        }),
      ).toBe(
        "CREATE INDEX `index_people_on_last_name_and_first_name` USING btree ON `people` (`last_name`(15), `first_name`(15))",
      );
    });

    it("index in create", async () => {
      for (const type of ["SPATIAL", "FULLTEXT", "UNIQUE"]) {
        expect(
          await adapter.createTable("people", { id: false }, (t) => {
            t.index("last_name", { type });
          }),
        ).toMatch(
          new RegExp(
            `^CREATE TABLE \`people\` \\(${type} INDEX \`index_people_on_last_name\` \\(\`last_name\`\\)\\)`,
          ),
        );
      }

      expect(
        await adapter.createTable("people", { id: false }, (t) => {
          t.index("last_name", { length: 10, using: "btree" });
        }),
      ).toMatch(
        /^CREATE TABLE `people` \(INDEX `index_people_on_last_name` USING btree \(`last_name`\(10\)\)\)/,
      );
    });
    it("index in bulk change", async () => {
      for (const type of ["SPATIAL", "FULLTEXT", "UNIQUE"]) {
        const expected = `ALTER TABLE \`people\` ADD ${type} INDEX \`index_people_on_last_name\` (\`last_name\`)`;
        await assertQueriesMatch(expected, undefined, false, () =>
          adapter.changeTable("people", { bulk: true }, (t) => {
            return t.index("last_name", { type });
          }),
        );
      }

      const expected =
        "ALTER TABLE `people` ADD INDEX `index_people_on_last_name` USING btree (`last_name`(10)), ALGORITHM = COPY";
      await assertQueriesMatch(expected, undefined, false, () =>
        adapter.changeTable("people", { bulk: true }, (t) => {
          return t.index("last_name", { length: 10, using: "btree", algorithm: "copy" });
        }),
      );
    });

    it("drop table", async () => {
      // eslint-disable-next-line blazetrails/require-table-teardown
      expect(await adapter.dropTable("people")).toBe("DROP TABLE `people`");
    });

    it("drop tables", async () => {
      expect(await adapter.dropTable("people", "sobrinho")).toBe("DROP TABLE `people`, `sobrinho`");
    });

    it("create mysql database with encoding", async () => {
      // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' inline `if ActiveRecord::Base.lease_connection.send(:row_format_dynamic_by_default?)` (active_schema_test.rb:126-134)
      if (await isRowFormatDynamicByDefault.call(adapter)) {
        expect(await adapter.createDatabase("matt")).toBe(
          "CREATE DATABASE `matt` DEFAULT CHARACTER SET `utf8mb4`",
        );
      } else {
        const error = await assertRaises([RuntimeError], {}, () => adapter.createDatabase("matt"));
        const expected =
          "Configure a supported :charset and ensure innodb_large_prefix is enabled to support indexes on varchar(255) string columns.";
        expect(error.message).toBe(expected);
      }

      expect(await adapter.createDatabase("aimonetti", { charset: "latin1" })).toBe(
        "CREATE DATABASE `aimonetti` DEFAULT CHARACTER SET `latin1`",
      );

      expect(await adapter.createDatabase("matt_aimonetti", { collation: "utf8mb4_bin" })).toBe(
        "CREATE DATABASE `matt_aimonetti` DEFAULT COLLATE `utf8mb4_bin`",
      );
    });

    it("recreate mysql database with encoding", async () => {
      await adapter.createDatabase("luca", { charset: "latin1" });
      expect(await adapter.recreateDatabase("luca", { charset: "latin1" })).toBe(
        "CREATE DATABASE `luca` DEFAULT CHARACTER SET `latin1`",
      );
    });

    it("add column", async () => {
      expect(await adapter.addColumn("people", "last_name", "string")).toBe(
        "ALTER TABLE `people` ADD `last_name` varchar(255)",
      );
    });

    it("add column with limit", async () => {
      expect(await adapter.addColumn("people", "key", "string", { limit: 32 })).toBe(
        "ALTER TABLE `people` ADD `key` varchar(32)",
      );
    });

    it("drop table with specific database", async () => {
      expect(await adapter.dropTable("otherdb.people")).toBe("DROP TABLE `otherdb`.`people`");
    });

    it("drop tables with specific database", async () => {
      expect(await adapter.dropTable("otherdb.people", "otherdb.sobrinho")).toBe(
        "DROP TABLE `otherdb`.`people`, `otherdb`.`sobrinho`",
      );
    });

    it("add timestamps", async () => {
      const ss = adapter;
      await withRealExecute(async () => {
        try {
          await ss.createTable("delete_me");
          await ss.addTimestamps("delete_me", { null: true });
          expect(await ss.columnExists("delete_me", "updated_at", "datetime")).toBeTruthy();
          expect(await ss.columnExists("delete_me", "created_at", "datetime")).toBeTruthy();
        } finally {
          await ss.dropTable("delete_me").catch(() => null);
        }
      });
    });
    it("remove timestamps", async () => {
      const ss = adapter;
      await withRealExecute(async () => {
        try {
          await ss.createTable("delete_me", undefined, (t) => {
            t.timestamps({ null: true });
          });
          await ss.removeTimestamps("delete_me", { null: true });
          expect(await ss.columnExists("delete_me", "updated_at", "datetime")).toBeFalsy();
          expect(await ss.columnExists("delete_me", "created_at", "datetime")).toBeFalsy();
        } finally {
          await ss.dropTable("delete_me").catch(() => null);
        }
      });
    });
    it("indexes in create", async () => {
      // eslint-disable-next-line blazetrails/require-table-teardown -- stub mode intercepts execute, so `temp` is never created (no teardown needed); mirrors Rails ActiveSchemaTest
      const actual = await adapter.createTable(
        "temp",
        { temporary: true, as: "SELECT id, name, zip FROM a_really_complicated_query" },
        (t) => {
          t.index("zip");
        },
      );
      expect(actual).toMatch(
        /^CREATE TEMPORARY TABLE `temp` \(INDEX `index_temp_on_zip` \(`zip`\)\)(?: ROW_FORMAT=DYNAMIC)? AS SELECT id, name, zip FROM a_really_complicated_query/,
      );
    });

    async function withRealExecute(fn: () => Promise<void>): Promise<void> {
      const singletonClass = rbObjSingletonClass(adapter) as typeof Mysql2Adapter;
      const executeWithStub = singletonClass.prototype.execute;
      delete (singletonClass.prototype as Partial<Mysql2Adapter>).execute;
      try {
        await fn();
      } finally {
        singletonClass.prototype.execute = executeWithStub;
      }
    }
  });
});
