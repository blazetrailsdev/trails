/**
 * Port of `test_rename_column`, the rename/remove-column index cluster and
 * `test_change_column` from `ActiveRecord::Migration::ColumnsTest`
 * (vendor/rails/activerecord/test/cases/migration/columns_test.rb:43-51,
 * :96-155, :181-204). The rest of columns_test.rb is unported.
 *
 * Driven by the ambient connection, mirroring Rails'
 * `@connection = ActiveRecord::Base.lease_connection`. `test_models` is not a
 * canonical-schema table in Rails either — `Migration::TestHelper`'s setup
 * creates and drops it (migration/helper.rb:20-34) — so this mirrors that
 * rather than reaching for the canonical schema.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../base.js";
import type { Column } from "../connection-adapters/column.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { ambientConnection } from "../support/rocket-tables.js";
import { adapterType } from "../test-adapter.js";
import { isMariaDb, serverVersion } from "../support/mysql-server-version.js";

const mariaDbRejectsUniqueColumnDrop =
  adapterType === "mysql" && isMariaDb && serverVersion?.gte("10.2.8") === true;

const indexesSurvivingColumnDrop =
  adapterType === "postgres" ? [] : ["index_test_models_on_hat_style_and_hat_size"];

async function indexNames(conn: AbstractAdapter, table: string): Promise<string[]> {
  const indexes = (await conn.indexes(table)) as Array<{ name: string }>;
  return indexes.map((i) => i.name);
}

/** `ActiveRecord::Migration::TestHelper::TestModel`, migration/helper.rb:16-18. */
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
  });
});
