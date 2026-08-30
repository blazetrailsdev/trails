import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../base.js";
import { ambientConnection } from "../support/rocket-tables.js";

class TestModel extends Base {
  static {
    this._tableName = "test_models";
  }
}

const tableName = "test_models";

describe("Migration", () => {
  describe("ReferencesStatementsTest", () => {
    beforeEach(async () => {
      const connection = await ambientConnection();
      await connection.createTable(tableName, { force: true }, (t) => {
        t.timestamps({ null: true });
      });
      void TestModel.resetColumnInformation();

      await connection.addColumn(tableName, "supplier_id", "integer");
      await connection.addIndex(tableName, "supplier_id");
    });

    afterEach(async () => {
      const connection = await ambientConnection();
      await connection.dropTable(tableName, { ifExists: true });
      void TestModel.resetColumnInformation();
    });

    async function withPolymorphicColumn(body: () => Promise<void>): Promise<void> {
      const connection = await ambientConnection();
      await connection.addColumn(tableName, "supplier_type", "string");
      await connection.addIndex(tableName, ["supplier_id", "supplier_type"]);

      await body();
    }

    it("creates reference id column", async () => {
      const connection = await ambientConnection();
      await connection.addReference(tableName, "user");
      expect(await connection.columnExists(tableName, "user_id", "integer")).toBeTruthy();
    });

    it("primary key and references columns should be identical type", async () => {
      const connection = await ambientConnection();
      await connection.addReference(tableName, "user");
      const pk = await connection.columnFor("users", "id");
      const ref = await connection.columnFor(tableName, "user_id");
      expect(ref.sqlType).toBe(pk.sqlType);
    });

    it("does not create reference type column", async () => {
      const connection = await ambientConnection();
      await connection.addReference(tableName, "taggable");
      expect(await connection.columnExists(tableName, "taggable_type", "string")).toBeFalsy();
    });

    it("creates reference type column", async () => {
      const connection = await ambientConnection();
      await connection.addReference(tableName, "taggable", { polymorphic: true });
      expect(await connection.columnExists(tableName, "taggable_type", "string")).toBeTruthy();
    });

    it("does not create reference id index if index is false", async () => {
      const connection = await ambientConnection();
      await connection.addReference(tableName, "user", { index: false });
      expect(await connection.indexExists(tableName, "user_id")).toBeFalsy();
    });

    it("create reference id index even if index option is not passed", async () => {
      const connection = await ambientConnection();
      await connection.addReference(tableName, "user");
      expect(await connection.indexExists(tableName, "user_id")).toBeTruthy();
    });

    it("creates polymorphic index", async () => {
      const connection = await ambientConnection();
      await connection.addReference(tableName, "taggable", { polymorphic: true, index: true });
      expect(
        await connection.indexExists(tableName, ["taggable_type", "taggable_id"]),
      ).toBeTruthy();
    });

    it("creates reference type column with default", async () => {
      const connection = await ambientConnection();
      await connection.addReference(tableName, "taggable", {
        polymorphic: { default: "Photo" },
        index: true,
      });
      expect(
        await connection.columnExists(tableName, "taggable_type", "string", { default: "Photo" }),
      ).toBeTruthy();
    });

    it("creates reference type column with not null", async () => {
      const connection = await ambientConnection();
      await connection.createTable(tableName, { force: true }, (t) => {
        t.references("taggable", { null: false, polymorphic: true });
      });
      expect(
        await connection.columnExists(tableName, "taggable_id", "integer", { null: false }),
      ).toBeTruthy();
      expect(
        await connection.columnExists(tableName, "taggable_type", "string", { null: false }),
      ).toBeTruthy();
    });

    it("does not share options with reference type column", async () => {
      const connection = await ambientConnection();
      await connection.addReference(tableName, "taggable", {
        type: "integer",
        limit: 2,
        polymorphic: true,
      });
      expect(
        await connection.columnExists(tableName, "taggable_id", "integer", { limit: 2 }),
      ).toBeTruthy();
      expect(await connection.columnExists(tableName, "taggable_type", "string")).toBeTruthy();
      expect(
        await connection.columnExists(tableName, "taggable_type", "string", { limit: 2 }),
      ).toBeFalsy();
    });

    it("creates named index", async () => {
      const connection = await ambientConnection();
      await connection.addReference(tableName, "tag", {
        index: { name: "index_taggings_on_tag_id" },
      });
      expect(
        await connection.indexExists(tableName, "tag_id", { name: "index_taggings_on_tag_id" }),
      ).toBeTruthy();
    });

    it("creates named unique index", async () => {
      const connection = await ambientConnection();
      await connection.addReference(tableName, "tag", {
        index: { name: "index_taggings_on_tag_id", unique: true },
      });
      expect(
        await connection.indexExists(tableName, "tag_id", {
          name: "index_taggings_on_tag_id",
          unique: true,
        }),
      ).toBeTruthy();
    });

    it("creates reference id with specified type", async () => {
      const connection = await ambientConnection();
      await connection.addReference(tableName, "user", { type: "string" });
      expect(await connection.columnExists(tableName, "user_id", "string")).toBeTruthy();
    });

    it("deletes reference id column", async () => {
      const connection = await ambientConnection();
      await connection.removeReference(tableName, "supplier");
      expect(await connection.columnExists(tableName, "supplier_id", "integer")).toBeFalsy();
    });

    it("deletes reference id index", async () => {
      const connection = await ambientConnection();
      await connection.removeReference(tableName, "supplier");
      expect(await connection.indexExists(tableName, "supplier_id")).toBeFalsy();
    });

    it("does not delete reference type column", async () => {
      const connection = await ambientConnection();
      await withPolymorphicColumn(async () => {
        await connection.removeReference(tableName, "supplier");

        expect(await connection.columnExists(tableName, "supplier_id", "integer")).toBeFalsy();
        expect(await connection.columnExists(tableName, "supplier_type", "string")).toBeTruthy();
      });
    });

    it("deletes reference type column", async () => {
      const connection = await ambientConnection();
      await withPolymorphicColumn(async () => {
        await connection.removeReference(tableName, "supplier", { polymorphic: true });
        expect(await connection.columnExists(tableName, "supplier_type", "string")).toBeFalsy();
      });
    });

    it("deletes polymorphic index", async () => {
      const connection = await ambientConnection();
      await withPolymorphicColumn(async () => {
        await connection.removeReference(tableName, "supplier", { polymorphic: true });
        expect(
          await connection.indexExists(tableName, ["supplier_id", "supplier_type"]),
        ).toBeFalsy();
      });
    });

    it("add belongs to alias", async () => {
      const connection = await ambientConnection();
      await connection.addBelongsTo(tableName, "user");
      expect(await connection.columnExists(tableName, "user_id", "integer")).toBeTruthy();
    });

    it("remove belongs to alias", async () => {
      const connection = await ambientConnection();
      await connection.removeBelongsTo(tableName, "supplier");
      expect(await connection.columnExists(tableName, "supplier_id", "integer")).toBeFalsy();
    });

    it("responds to if exists option", async () => {
      const connection = await ambientConnection();
      await withPolymorphicColumn(async () => {
        await expect(
          connection.removeReference(tableName, "nonexistent", {
            polymorphic: true,
            ifExists: true,
          }),
        ).resolves.not.toThrow();
      });
    });

    it("responds to if not exists option", async () => {
      const connection = await ambientConnection();
      await withPolymorphicColumn(async () => {
        await expect(
          connection.addReference(tableName, "supplier", {
            polymorphic: true,
            ifNotExists: true,
          }),
        ).resolves.not.toThrow();
      });
    });
  });
});
