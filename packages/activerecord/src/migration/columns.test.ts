/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   The test class spells `include ActiveRecord::Migration::TestHelper` (migration/helper.rb:10); the
   empty class/interface merge carries the mixed-in methods onto its type. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { TestHelper, TestModel } from "../test-helpers/migration-helper.js";
import type { Column } from "../connection-adapters/column.js";
import type { Column as MysqlColumn } from "../connection-adapters/mysql/column.js";
import { ActiveRecordError, StatementInvalid, NotNullViolation } from "../errors.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { adapterType } from "../test-adapter.js";
import {
  isMariaDb,
  serverVersion,
  supportsDefaultExpression,
} from "../support/mysql-server-version.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { assertDifference, assertRaises } from "@blazetrails/activesupport";
import { assertQueriesCount } from "../testing/query-assertions.js";
import { adapterSupports } from "../support/supports.js";
import { rbInspect } from "@blazetrails/ruby-compat";

const mariaDbRejectsUniqueColumnDrop =
  adapterType === "mysql" && isMariaDb && (serverVersion?.compare("10.2.8") ?? -1) >= 0;

const expectedAlterQueryCount = adapterType === "sqlite" ? 14 : 1;

async function indexNames(conn: AbstractAdapter, table: string): Promise<string[]> {
  const indexes = (await conn.indexes(table)) as Array<{ name: string }>;
  return indexes.map((i) => i.name);
}

class ColumnsTest {}
interface ColumnsTest extends TestHelper {}
include(ColumnsTest, TestHelper);

describe("Migration", () => {
  const self = new ColumnsTest();

  beforeEach(() => self.setup());
  afterEach(() => self.teardown());

  describe("ColumnsTest", () => {
    it("add rename", async () => {
      await self.addColumn("test_models", "girlfriend", "string");
      void TestModel.resetColumnInformation();

      await TestModel.create({ girlfriend: "bobette" });

      await self.renameColumn("test_models", "girlfriend", "exgirlfriend");

      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      const bob = await TestModel.first();

      expect(bob?.exgirlfriend).toBe("bobette");
    });

    it("rename column using symbol arguments", async () => {
      await self.addColumn("test_models", "first_name", "string");

      await TestModel.create({ first_name: "foo" });

      await self.renameColumn("test_models", "first_name", "nick_name");
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnNames()).toContain("nick_name");
      expect((await TestModel.all()).map((m) => m.nick_name)).toEqual(["foo"]);
    });

    it("rename column", async () => {
      await self.addColumn("test_models", "first_name", "string");

      await TestModel.create({ first_name: "foo" });

      await self.renameColumn("test_models", "first_name", "nick_name");
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnNames()).toContain("nick_name");
      expect((await TestModel.all()).map((m) => m.nick_name)).toEqual(["foo"]);
    });

    it("rename column preserves default value not null", async () => {
      await self.addColumn("test_models", "salary", "integer", { default: 70000 });

      const defaultBefore = (await self.connection.columns("test_models")).find(
        (c) => c.name === "salary",
      )?.default;
      expect(defaultBefore).toBe("70000");

      await self.renameColumn("test_models", "salary", "annual_salary");

      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnNames()).toContain("annual_salary");
      const defaultAfter = (await self.connection.columns("test_models")).find(
        (c) => c.name === "annual_salary",
      )?.default;
      expect(defaultAfter).toBe("70000");
    });

    it("rename nonexistent column", async () => {
      const exception = adapterType === "postgres" ? StatementInvalid : ActiveRecordError;

      await expect(self.renameColumn("test_models", "nonexistent", "should_fail")).rejects.toThrow(
        exception,
      );
    });

    it("rename column with sql reserved word", async () => {
      await self.addColumn("test_models", "first_name", "string");
      await self.renameColumn("test_models", "first_name", "group");

      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnNames()).toContain("group");
    });

    it("rename column with an index", async () => {
      await self.addColumn("test_models", "hat_name", "string");
      await self.addIndex("test_models", "hat_name");

      expect((await self.connection.indexes("test_models")).length).toBe(1);
      await self.renameColumn("test_models", "hat_name", "name");

      expect(await indexNames(self.connection, "test_models")).toEqual([
        "index_test_models_on_name",
      ]);
    });

    it("rename column with multi column index", async () => {
      await self.addColumn("test_models", "hat_size", "integer");
      await self.addColumn("test_models", "hat_style", "string", { limit: 100 });
      await self.addIndex("test_models", ["hat_style", "hat_size"], { unique: true });

      await self.renameColumn("test_models", "hat_size", "size");
      expect(await indexNames(self.connection, "test_models")).toEqual([
        "index_test_models_on_hat_style_and_size",
      ]);

      await self.renameColumn("test_models", "hat_style", "style");
      expect(await indexNames(self.connection, "test_models")).toEqual([
        "index_test_models_on_style_and_size",
      ]);
    });

    it("rename column does not rename custom named index", async () => {
      await self.addColumn("test_models", "hat_name", "string");
      await self.addIndex("test_models", "hat_name", { name: "idx_hat_name" });

      expect((await self.connection.indexes("test_models")).length).toBe(1);
      await self.renameColumn("test_models", "hat_name", "name");
      expect(await indexNames(self.connection, "test_models")).toEqual(["idx_hat_name"]);
    });

    it("remove column with index", async () => {
      await self.addColumn("test_models", "hat_name", "string");
      await self.addIndex("test_models", "hat_name");

      expect((await self.connection.indexes("test_models")).length).toBe(1);
      await self.removeColumn("test_models", "hat_name");
      expect((await self.connection.indexes("test_models")).length).toBe(0);
    });

    it.skipIf(mariaDbRejectsUniqueColumnDrop)("remove column with multi column index", async () => {
      await self.addColumn("test_models", "hat_size", "integer");
      await self.addColumn("test_models", "hat_style", "string", { limit: 100 });
      await self.addIndex("test_models", ["hat_style", "hat_size"], { unique: true });

      expect((await self.connection.indexes("test_models")).length).toBe(1);
      await self.removeColumn("test_models", "hat_size");

      if (adapterType === "postgres") {
        expect(await indexNames(self.connection, "test_models")).toEqual([]);
      } else {
        expect(await indexNames(self.connection, "test_models")).toEqual([
          "index_test_models_on_hat_style_and_hat_size",
        ]);
      }
    });

    it("removing and renaming column preserves custom primary key", async () => {
      try {
        await self.connection.createTable(
          "my_table",
          { primaryKey: "my_table_id", force: true },
          (t) => {
            t.integer("col_one");
            t.string("col_two", { limit: 128, null: false });
          },
        );

        await self.removeColumn("my_table", "col_two");
        await self.renameColumn("my_table", "col_one", "col_three");

        expect(await self.connection.primaryKey("my_table")).toBe("my_table_id");
      } finally {
        await self.connection.dropTable("my_table", { ifExists: true });
      }
    });

    it("column with index", async () => {
      try {
        await self.connection.createTable("my_table", { force: true }, (t) => {
          t.string("item_number", { index: true });
        });

        expect(
          await self.indexExists("my_table", "item_number", {
            name: "index_my_table_on_item_number",
          }),
        ).toBeTruthy();
      } finally {
        await self.connection.dropTable("my_table", { ifExists: true });
      }
    });

    it("change type of not null column", async () => {
      try {
        await self.changeColumn("test_models", "updated_at", "datetime", { null: false });
        await self.changeColumn("test_models", "updated_at", "datetime", { null: false });

        void TestModel.resetColumnInformation();
        await TestModel.loadSchema();
        expect(TestModel.columnsHash()["updated_at"]?.null).toBe(false);
      } finally {
        await self.changeColumn("test_models", "updated_at", "datetime", { null: true });
      }
    });

    it("change column nullability", async () => {
      await self.addColumn("test_models", "funny", "boolean");
      await TestModel.loadSchema();
      expect(TestModel.columnsHash()["funny"]?.null).toBeTruthy();

      await self.changeColumn("test_models", "funny", "boolean", {
        null: false,
        default: true,
      });

      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnsHash()["funny"]?.null).toBeFalsy();

      await self.changeColumn("test_models", "funny", "boolean", { null: true });
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnsHash()["funny"]?.null).toBeTruthy();
    });

    it("change column", async () => {
      await self.addColumn("test_models", "age", "integer");
      await self.addColumn("test_models", "approved", "boolean", { default: true });

      let oldColumns = await self.connection.columns(TestModel.tableName);

      expect(oldColumns.find((c) => c.name === "age" && c.type === "integer")).toBeTruthy();

      await self.changeColumn("test_models", "age", "string");

      let newColumns = await self.connection.columns(TestModel.tableName);

      expect(newColumns.find((c) => c.name === "age" && c.type === "integer")).toBeFalsy();
      expect(newColumns.find((c) => c.name === "age" && c.type === "string")).toBeTruthy();

      const findApproved = async (
        columns: readonly Column[],
        expected: unknown,
      ): Promise<Column | undefined> => {
        for (const c of columns) {
          const castType = await self.connection.lookupCastTypeFromColumn(c);
          const defaultValue = castType?.deserialize(c.default);
          if (c.name === "approved" && c.type === "boolean" && defaultValue === expected) return c;
        }
        return undefined;
      };

      oldColumns = await self.connection.columns(TestModel.tableName);
      expect(await findApproved(oldColumns, true)).toBeTruthy();

      await self.changeColumn("test_models", "approved", "boolean", { default: false });
      newColumns = await self.connection.columns(TestModel.tableName);

      expect(await findApproved(newColumns, true)).toBeFalsy();
      expect(await findApproved(newColumns, false)).toBeTruthy();
      await self.changeColumn("test_models", "approved", "boolean", { default: true });
    });

    it("change column with nil default", async () => {
      await self.addColumn("test_models", "contributor", "boolean", { default: true });
      await TestModel.loadSchema();
      expect(TestModel.new().queryAttribute("contributor")).toBeTruthy();

      await self.changeColumn("test_models", "contributor", "boolean", { default: null });
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().queryAttribute("contributor")).toBeFalsy();
      expect(TestModel.new().contributor).toBeNull();
    });

    it("change column to drop default with null false", async () => {
      await self.addColumn("test_models", "contributor", "boolean", {
        default: true,
        null: false,
      });
      await TestModel.loadSchema();
      expect(TestModel.new().queryAttribute("contributor")).toBeTruthy();

      await self.changeColumn("test_models", "contributor", "boolean", {
        default: null,
        null: false,
      });
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().queryAttribute("contributor")).toBeFalsy();
      expect(TestModel.new().contributor).toBeNull();
    });

    it("change column with new default", async () => {
      await self.addColumn("test_models", "administrator", "boolean", { default: true });
      await TestModel.loadSchema();
      expect(TestModel.new().queryAttribute("administrator")).toBeTruthy();

      await self.changeColumn("test_models", "administrator", "boolean", { default: false });
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().queryAttribute("administrator")).toBeFalsy();
    });

    it("change column with custom index name", async () => {
      await self.addColumn("test_models", "category", "string");
      await self.addIndex("test_models", "category", { name: "test_models_categories_idx" });

      expect(await indexNames(self.connection, "test_models")).toEqual([
        "test_models_categories_idx",
      ]);
      await self.changeColumn("test_models", "category", "string", {
        null: false,
        default: "article",
      });

      expect(await indexNames(self.connection, "test_models")).toEqual([
        "test_models_categories_idx",
      ]);
    });

    it("change column with long index name", async () => {
      const tableNamePrefix = "test_models_";
      const longIndexName =
        tableNamePrefix + "x".repeat(self.connection.indexNameLength() - tableNamePrefix.length);
      await self.addColumn("test_models", "category", "string");
      await self.addIndex("test_models", "category", { name: longIndexName });

      await self.changeColumn("test_models", "category", "string", {
        null: false,
        default: "article",
      });

      expect(await indexNames(self.connection, "test_models")).toEqual([longIndexName]);
    });

    it("change column default", async () => {
      await self.addColumn("test_models", "first_name", "string");
      await self.connection.changeColumnDefault("test_models", "first_name", "Tester");

      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().first_name).toBe("Tester");
    });

    it("change column default to null", async () => {
      await self.addColumn("test_models", "first_name", "string");
      await self.connection.changeColumnDefault("test_models", "first_name", null);

      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().first_name).toBeNull();
    });

    it("change column default to null with not null", async () => {
      await self.addColumn("test_models", "first_name", "string", { null: false });
      await self.addColumn("test_models", "age", "integer", { null: false });

      await self.connection.changeColumnDefault("test_models", "first_name", null);

      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().first_name).toBeNull();

      await self.connection.changeColumnDefault("test_models", "age", null);

      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().age).toBeNull();
    });

    it("change column default with from and to", async () => {
      await self.addColumn("test_models", "first_name", "string");
      await self.connection.changeColumnDefault("test_models", "first_name", {
        from: null,
        to: "Tester",
      });

      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().first_name).toBe("Tester");
    });

    it.skipIf(adapterType !== "mysql")("mysql rename column preserves auto increment", async () => {
      try {
        await self.renameColumn("test_models", "id", "id_test");
        const renamed = (await self.connection.columns("test_models")).find(
          (c) => c.name === "id_test",
        ) as MysqlColumn | undefined;
        expect(renamed?.isAutoIncrement()).toBeTruthy();
        void TestModel.resetColumnInformation();
      } finally {
        await self.renameColumn("test_models", "id_test", "id");
      }
    });

    it.skipIf(adapterType !== "sqlite")(
      "change column default preserves existing column default function",
      async () => {
        await self.connection.changeColumnDefault(
          "test_models",
          "created_at",
          () => "CURRENT_TIMESTAMP",
        );
        void TestModel.resetColumnInformation();
        await TestModel.loadSchema();
        expect(TestModel.columnsHash()["created_at"].defaultFunction).toBe("CURRENT_TIMESTAMP");

        await self.addColumn("test_models", "edited_at", "datetime");
        await self.connection.changeColumnDefault(
          "test_models",
          "edited_at",
          () => "CURRENT_TIMESTAMP",
        );
        void TestModel.resetColumnInformation();
        await TestModel.loadSchema();
        expect(TestModel.columnsHash()["created_at"].defaultFunction).toBe("CURRENT_TIMESTAMP");
        expect(TestModel.columnsHash()["edited_at"].defaultFunction).toBe("CURRENT_TIMESTAMP");
      },
    );

    it.skipIf(adapterType !== "sqlite")(
      "change column default supports default function with concatenation operator",
      async () => {
        await self.addColumn("test_models", "ruby_on_rails", "string");
        await self.connection.changeColumnDefault(
          "test_models",
          "ruby_on_rails",
          () => "('Ruby ' || 'on ' || 'Rails')",
        );
        void TestModel.resetColumnInformation();
        await TestModel.loadSchema();
        expect(TestModel.columnsHash()["ruby_on_rails"].defaultFunction).toBe(
          "'Ruby ' || 'on ' || 'Rails'",
        );
      },
    );

    it.skipIf(
      adapterType !== "mysql" ||
        !adapterSupports("default_expression") ||
        !supportsDefaultExpression,
    )("change column null does not change default functions", async () => {
      const fn = isMariaDb ? "current_timestamp(6)" : "(now())";

      await self.connection.changeColumnDefault("test_models", "created_at", () => fn);
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnsHash()["created_at"].defaultFunction).toBe(fn);

      await self.connection.changeColumnNull("test_models", "created_at", true);
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnsHash()["created_at"].defaultFunction).toBe(fn);
    });

    it("change column null false", async () => {
      await self.addColumn("test_models", "first_name", "string");
      await self.connection.changeColumnNull("test_models", "first_name", false);
      void TestModel.resetColumnInformation();

      await expect(TestModel.create({ first_name: null })).rejects.toThrow(NotNullViolation);
    });

    it("change column null true", async () => {
      await self.addColumn("test_models", "first_name", "string");
      await self.connection.changeColumnNull("test_models", "first_name", true);
      void TestModel.resetColumnInformation();

      await assertDifference(
        new Map([[async () => (await TestModel.count()) as number, 1]]),
        null,
        async () => {
          await TestModel.create({ first_name: null });
        },
      );
    });

    it("change column null with non boolean arguments raises", async () => {
      await self.addColumn("test_models", "first_name", "string");
      const e = await assertRaises([ArgumentError], {}, () =>
        self.connection.changeColumnNull("test_models", "first_name", {
          from: true,
          to: false,
        } as unknown as boolean),
      );
      expect(e.message).toBe(
        `change_column_null expects a boolean value (true for NULL, false for NOT NULL). Got: ${rbInspect({ from: true, to: false })}`,
      );
    });

    it("remove column no second parameter raises exception", async () => {
      await expect(
        (self as unknown as { removeColumn(t: string): Promise<void> }).removeColumn("funny"),
      ).rejects.toThrow(ArgumentError);
    });

    it("add column without column name", async () => {
      try {
        const e = await assertRaises([ArgumentError], {}, () =>
          self.connection.createTable("my_table", { force: true }, (t) => {
            (t.timestamp as () => unknown)();
          }),
        );
        expect(e.message).toBe("Missing column name(s) for timestamp");
      } finally {
        await self.connection.dropTable("my_table", { ifExists: true });
      }
    });

    it("remove columns single statement", async () => {
      try {
        await self.connection.createTable("my_table", {}, (t) => {
          t.integer("col_one");
          t.integer("col_two");
        });

        await assertQueriesCount(expectedAlterQueryCount, false, async () => {
          await self.connection.removeColumns("my_table", "col_one", "col_two");
        });

        const columns = (await self.connection.columns("my_table")).map((c) => c.name);
        expect(columns).toEqual(["id"]);
      } finally {
        await self.connection.dropTable("my_table", { ifExists: true });
      }
    });

    it("add timestamps single statement", async () => {
      try {
        await self.connection.createTable("my_table");

        await assertQueriesCount(expectedAlterQueryCount, false, async () => {
          await self.connection.addTimestamps("my_table");
        });

        const columns = (await self.connection.columns("my_table")).map((c) => c.name);
        expect(columns).toEqual(["id", "created_at", "updated_at"]);
      } finally {
        await self.connection.dropTable("my_table", { ifExists: true });
      }
    });
  });
});
