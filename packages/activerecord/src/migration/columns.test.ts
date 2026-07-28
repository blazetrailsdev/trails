/**
 * Port of `test_rename_column` and `test_change_column` from
 * `ActiveRecord::Migration::ColumnsTest`
 * (vendor/rails/activerecord/test/cases/migration/columns_test.rb:43-51,
 * :181-204). The rest of columns_test.rb is unported.
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
import { ambientConnection } from "../support/rocket-tables.js";

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
      // `reset_column_information` is lazy in Rails; trails' schema load is
      // async, so the reflection is pulled explicitly before reading it.
      await TestModel.loadSchema();
      expect(TestModel.columnNames()).toContain("nick_name");
      expect((await TestModel.all()).map((m) => m.nick_name)).toEqual(["foo"]);
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

      // Rails deserializes `c.default` inline in each block; `lookupCastTypeFromColumn`
      // is async here, so the boolean `approved` default is resolved up front.
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
