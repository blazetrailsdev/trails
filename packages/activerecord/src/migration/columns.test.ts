import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../base.js";
import type { Column } from "../connection-adapters/column.js";
import { ActiveRecordError, StatementInvalid, NotNullViolation } from "../errors.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { ambientConnection } from "../support/rocket-tables.js";
import { adapterType } from "../test-adapter.js";
import {
  isMariaDb,
  serverVersion,
  supportsDefaultExpression,
} from "../support/mysql-server-version.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { assertQueriesCount } from "../testing/query-assertions.js";
import { adapterSupports } from "../support/supports.js";

const mariaDbRejectsUniqueColumnDrop =
  adapterType === "mysql" && isMariaDb && serverVersion?.gte("10.2.8") === true;

const indexesSurvivingColumnDrop =
  adapterType === "postgres" ? [] : ["index_test_models_on_hat_style_and_hat_size"];

const expectedAlterQueryCount = adapterType === "sqlite" ? 14 : 1;

async function indexNames(conn: AbstractAdapter, table: string): Promise<string[]> {
  const indexes = (await conn.indexes(table)) as Array<{ name: string }>;
  return indexes.map((i) => i.name);
}

function indexNameLength(conn: AbstractAdapter): number {
  return (conn as unknown as { indexNameLength(): number }).indexNameLength();
}

class TestModel extends Base {
  static {
    this._tableName = "test_models";
  }
}

describe("Migration", () => {
  beforeEach(async () => {
    const connection = await ambientConnection();
    await connection.createTable("test_models", { force: true }, (t) => {
      t.timestamps({ null: true });
    });
    TestModel.resetColumnInformation();
  });

  afterEach(async () => {
    const connection = await ambientConnection();
    await connection.dropTable("test_models", { ifExists: true });
    TestModel.resetColumnInformation();
  });

  describe("ColumnsTest", () => {
    it("add rename", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "girlfriend", "string");
      TestModel.resetColumnInformation();

      await TestModel.create({ girlfriend: "bobette" });

      await connection.renameColumn("test_models", "girlfriend", "exgirlfriend");

      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      const bob = await TestModel.first();

      expect(bob?.exgirlfriend).toBe("bobette");
    });

    it("rename column using symbol arguments", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "first_name", "string");

      await TestModel.create({ first_name: "foo" });

      await connection.renameColumn("test_models", "first_name", "nick_name");
      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnNames()).toContain("nick_name");
      expect((await TestModel.all()).map((m) => m.nick_name)).toEqual(["foo"]);
    });

    it("rename column", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "first_name", "string");

      await TestModel.create({ first_name: "foo" });

      await connection.renameColumn("test_models", "first_name", "nick_name");
      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnNames()).toContain("nick_name");
      expect((await TestModel.all()).map((m) => m.nick_name)).toEqual(["foo"]);
    });

    it("rename column preserves default value not null", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "salary", "integer", { default: 70000 });

      const defaultBefore = (await connection.columns("test_models")).find(
        (c) => c.name === "salary",
      )?.default;
      expect(defaultBefore).toBe("70000");

      await connection.renameColumn("test_models", "salary", "annual_salary");

      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnNames()).toContain("annual_salary");
      const defaultAfter = (await connection.columns("test_models")).find(
        (c) => c.name === "annual_salary",
      )?.default;
      expect(defaultAfter).toBe("70000");
    });

    it("rename nonexistent column", async () => {
      const connection = await ambientConnection();
      const exception = adapterType === "postgres" ? StatementInvalid : ActiveRecordError;

      await expect(
        connection.renameColumn("test_models", "nonexistent", "should_fail"),
      ).rejects.toThrow(exception);
    });

    it("rename column with sql reserved word", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "first_name", "string");
      await connection.renameColumn("test_models", "first_name", "group");

      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnNames()).toContain("group");
    });

    it("rename column with an index", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "hat_name", "string");
      await connection.addIndex("test_models", "hat_name");

      expect((await connection.indexes("test_models")).length).toBe(1);
      await connection.renameColumn("test_models", "hat_name", "name");

      expect(await indexNames(connection, "test_models")).toEqual(["index_test_models_on_name"]);
    });

    it("rename column with multi column index", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "hat_size", "integer");
      await connection.addColumn("test_models", "hat_style", "string", { limit: 100 });
      await connection.addIndex("test_models", ["hat_style", "hat_size"], { unique: true });

      await connection.renameColumn("test_models", "hat_size", "size");
      expect(await indexNames(connection, "test_models")).toEqual([
        "index_test_models_on_hat_style_and_size",
      ]);

      await connection.renameColumn("test_models", "hat_style", "style");
      expect(await indexNames(connection, "test_models")).toEqual([
        "index_test_models_on_style_and_size",
      ]);
    });

    it("rename column does not rename custom named index", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "hat_name", "string");
      await connection.addIndex("test_models", "hat_name", { name: "idx_hat_name" });

      expect((await connection.indexes("test_models")).length).toBe(1);
      await connection.renameColumn("test_models", "hat_name", "name");
      expect(await indexNames(connection, "test_models")).toEqual(["idx_hat_name"]);
    });

    it("remove column with index", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "hat_name", "string");
      await connection.addIndex("test_models", "hat_name");

      expect((await connection.indexes("test_models")).length).toBe(1);
      await connection.removeColumn("test_models", "hat_name");
      expect((await connection.indexes("test_models")).length).toBe(0);
    });

    it.skipIf(mariaDbRejectsUniqueColumnDrop)("remove column with multi column index", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "hat_size", "integer");
      await connection.addColumn("test_models", "hat_style", "string", { limit: 100 });
      await connection.addIndex("test_models", ["hat_style", "hat_size"], { unique: true });

      expect((await connection.indexes("test_models")).length).toBe(1);
      await connection.removeColumn("test_models", "hat_size");

      expect(await indexNames(connection, "test_models")).toEqual(indexesSurvivingColumnDrop);
    });

    it("removing and renaming column preserves custom primary key", async () => {
      const connection = await ambientConnection();
      try {
        await connection.createTable(
          "my_table",
          { primaryKey: "my_table_id", force: true },
          (t) => {
            t.integer("col_one");
            t.string("col_two", { limit: 128, null: false });
          },
        );

        await connection.removeColumn("my_table", "col_two");
        await connection.renameColumn("my_table", "col_one", "col_three");

        expect(await connection.primaryKey("my_table")).toBe("my_table_id");
      } finally {
        await connection.dropTable("my_table", { ifExists: true });
      }
    });

    it("column with index", async () => {
      const connection = await ambientConnection();
      try {
        await connection.createTable("my_table", { force: true }, (t) => {
          t.string("item_number", { index: true });
        });

        expect(
          await connection.indexExists("my_table", "item_number", {
            name: "index_my_table_on_item_number",
          }),
        ).toBe(true);
      } finally {
        await connection.dropTable("my_table", { ifExists: true });
      }
    });

    it("change type of not null column", async () => {
      const connection = await ambientConnection();
      try {
        await connection.changeColumn("test_models", "updated_at", "datetime", { null: false });
        await connection.changeColumn("test_models", "updated_at", "datetime", { null: false });

        TestModel.resetColumnInformation();
        await TestModel.loadSchema();
        expect(TestModel.columnsHash()["updated_at"]?.null).toBe(false);
      } finally {
        await connection.changeColumn("test_models", "updated_at", "datetime", { null: true });
      }
    });

    it("change column nullability", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "funny", "boolean");
      await TestModel.loadSchema();
      expect(TestModel.columnsHash()["funny"]?.null).toBe(true);

      await connection.changeColumn("test_models", "funny", "boolean", {
        null: false,
        default: true,
      });

      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnsHash()["funny"]?.null).toBe(false);

      await connection.changeColumn("test_models", "funny", "boolean", { null: true });
      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnsHash()["funny"]?.null).toBe(true);
    });

    it("change column", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "age", "integer");
      await connection.addColumn("test_models", "approved", "boolean", { default: true });

      let oldColumns = await connection.columns(TestModel.tableName);

      expect(oldColumns.find((c) => c.name === "age" && c.type === "integer")).toBeTruthy();

      await connection.changeColumn("test_models", "age", "string");

      let newColumns = await connection.columns(TestModel.tableName);

      expect(newColumns.find((c) => c.name === "age" && c.type === "integer")).toBeFalsy();
      expect(newColumns.find((c) => c.name === "age" && c.type === "string")).toBeTruthy();

      const approvedDefault = async (columns: readonly Column[]): Promise<unknown> => {
        const column = columns.find((c) => c.name === "approved" && c.type === "boolean");
        if (!column) return undefined;
        const castType = await connection.lookupCastTypeFromColumn(column);
        return castType?.deserialize(column.default);
      };

      oldColumns = await connection.columns(TestModel.tableName);
      expect(await approvedDefault(oldColumns)).toBe(true);

      await connection.changeColumn("test_models", "approved", "boolean", { default: false });
      newColumns = await connection.columns(TestModel.tableName);

      expect(await approvedDefault(newColumns)).not.toBe(true);
      expect(await approvedDefault(newColumns)).toBe(false);
    });

    it("change column with nil default", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "contributor", "boolean", { default: true });
      await TestModel.loadSchema();
      expect(TestModel.new().queryAttribute("contributor")).toBe(true);

      await connection.changeColumn("test_models", "contributor", "boolean", { default: null });
      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().queryAttribute("contributor")).toBe(false);
      expect(TestModel.new().contributor).toBeNull();
    });

    it("change column to drop default with null false", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "contributor", "boolean", {
        default: true,
        null: false,
      });
      await TestModel.loadSchema();
      expect(TestModel.new().queryAttribute("contributor")).toBe(true);

      await connection.changeColumn("test_models", "contributor", "boolean", {
        default: null,
        null: false,
      });
      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().queryAttribute("contributor")).toBe(false);
      expect(TestModel.new().contributor).toBeNull();
    });

    it("change column with new default", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "administrator", "boolean", { default: true });
      await TestModel.loadSchema();
      expect(TestModel.new().queryAttribute("administrator")).toBe(true);

      await connection.changeColumn("test_models", "administrator", "boolean", { default: false });
      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().queryAttribute("administrator")).toBe(false);
    });

    it("change column with custom index name", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "category", "string");
      await connection.addIndex("test_models", "category", { name: "test_models_categories_idx" });

      expect(await indexNames(connection, "test_models")).toEqual(["test_models_categories_idx"]);
      await connection.changeColumn("test_models", "category", "string", {
        null: false,
        default: "article",
      });

      expect(await indexNames(connection, "test_models")).toEqual(["test_models_categories_idx"]);
    });

    it("change column with long index name", async () => {
      const connection = await ambientConnection();
      const tableNamePrefix = "test_models_";
      const longIndexName =
        tableNamePrefix + "x".repeat(indexNameLength(connection) - tableNamePrefix.length);
      await connection.addColumn("test_models", "category", "string");
      await connection.addIndex("test_models", "category", { name: longIndexName });

      await connection.changeColumn("test_models", "category", "string", {
        null: false,
        default: "article",
      });

      expect(await indexNames(connection, "test_models")).toEqual([longIndexName]);
    });

    it("change column default", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "first_name", "string");
      await connection.changeColumnDefault("test_models", "first_name", "Tester");

      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().first_name).toBe("Tester");
    });

    it("change column default to null", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "first_name", "string");
      await connection.changeColumnDefault("test_models", "first_name", null);

      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().first_name).toBeNull();
    });

    it("change column default to null with not null", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "first_name", "string", { null: false });
      await connection.addColumn("test_models", "age", "integer", { null: false });

      await connection.changeColumnDefault("test_models", "first_name", null);

      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().first_name).toBeNull();

      await connection.changeColumnDefault("test_models", "age", null);

      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().age).toBeNull();
    });

    it("change column default with from and to", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "first_name", "string");
      await connection.changeColumnDefault("test_models", "first_name", {
        from: null,
        to: "Tester",
      });

      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.new().first_name).toBe("Tester");
    });

    it.skipIf(adapterType !== "mysql")("mysql rename column preserves auto increment", async () => {
      const connection = await ambientConnection();
      try {
        await connection.renameColumn("test_models", "id", "id_test");
        const renamed = (await connection.columns("test_models")).find(
          (c) => c.name === "id_test",
        ) as (Column & { autoIncrement?: boolean }) | undefined;
        expect(renamed?.autoIncrement).toBe(true);
        TestModel.resetColumnInformation();
      } finally {
        await connection.renameColumn("test_models", "id_test", "id");
      }
    });

    it.skipIf(adapterType !== "sqlite")(
      "change column default preserves existing column default function",
      async () => {
        const connection = await ambientConnection();
        await connection.changeColumnDefault(
          "test_models",
          "created_at",
          () => "CURRENT_TIMESTAMP",
        );
        TestModel.resetColumnInformation();
        await TestModel.loadSchema();
        expect(TestModel.columnsHash()["created_at"].defaultFunction).toBe("CURRENT_TIMESTAMP");

        await connection.addColumn("test_models", "edited_at", "datetime");
        await connection.changeColumnDefault("test_models", "edited_at", () => "CURRENT_TIMESTAMP");
        TestModel.resetColumnInformation();
        await TestModel.loadSchema();
        expect(TestModel.columnsHash()["created_at"].defaultFunction).toBe("CURRENT_TIMESTAMP");
        expect(TestModel.columnsHash()["edited_at"].defaultFunction).toBe("CURRENT_TIMESTAMP");
      },
    );

    it.skipIf(adapterType !== "sqlite")(
      "change column default supports default function with concatenation operator",
      async () => {
        const connection = await ambientConnection();
        await connection.addColumn("test_models", "ruby_on_rails", "string");
        await connection.changeColumnDefault(
          "test_models",
          "ruby_on_rails",
          () => "('Ruby ' || 'on ' || 'Rails')",
        );
        TestModel.resetColumnInformation();
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
      const connection = await ambientConnection();
      const fn = isMariaDb ? "current_timestamp(6)" : "(now())";

      await connection.changeColumnDefault("test_models", "created_at", () => fn);
      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnsHash()["created_at"].defaultFunction).toBe(fn);

      await connection.changeColumnNull("test_models", "created_at", true);
      TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnsHash()["created_at"].defaultFunction).toBe(fn);
    });

    it("change column null false", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "first_name", "string");
      await connection.changeColumnNull("test_models", "first_name", false);
      TestModel.resetColumnInformation();

      await expect(TestModel.create({ first_name: null })).rejects.toThrow(NotNullViolation);
    });

    it("change column null true", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "first_name", "string");
      await connection.changeColumnNull("test_models", "first_name", true);
      TestModel.resetColumnInformation();

      const before = (await TestModel.count()) as number;
      await TestModel.create({ first_name: null });
      expect(await TestModel.count()).toBe(before + 1);
    });

    it("change column null with non boolean arguments raises", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "first_name", "string");
      await expect(
        connection.changeColumnNull("test_models", "first_name", {
          from: true,
          to: false,
        } as unknown as boolean),
      ).rejects.toThrow(
        "change_column_null expects a boolean value (true for NULL, false for NOT NULL). Got: {from: true, to: false}",
      );
    });

    it("remove column no second parameter raises exception", async () => {
      const connection = await ambientConnection();
      await expect(
        (connection.removeColumn as (t: string) => Promise<void>)("funny"),
      ).rejects.toThrow(ArgumentError);
    });

    it("add column without column name", async () => {
      const connection = await ambientConnection();
      try {
        await expect(
          connection.createTable("my_table", { force: true }, (t) => {
            (t.timestamp as () => unknown)();
          }),
        ).rejects.toThrow("Missing column name(s) for timestamp");
      } finally {
        await connection.dropTable("my_table", { ifExists: true });
      }
    });

    it("remove columns single statement", async () => {
      const connection = await ambientConnection();
      try {
        await connection.createTable("my_table", {}, (t) => {
          t.integer("col_one");
          t.integer("col_two");
        });

        await assertQueriesCount(expectedAlterQueryCount, false, async () => {
          await connection.removeColumns("my_table", "col_one", "col_two");
        });

        const columns = (await connection.columns("my_table")).map((c) => c.name);
        expect(columns).toEqual(["id"]);
      } finally {
        await connection.dropTable("my_table", { ifExists: true });
      }
    });

    it("add timestamps single statement", async () => {
      const connection = await ambientConnection();
      try {
        await connection.createTable("my_table");

        await assertQueriesCount(expectedAlterQueryCount, false, async () => {
          await connection.addTimestamps("my_table");
        });

        const columns = (await connection.columns("my_table")).map((c) => c.name);
        expect(columns).toEqual(["id", "created_at", "updated_at"]);
      } finally {
        await connection.dropTable("my_table", { ifExists: true });
      }
    });
  });
});
