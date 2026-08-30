import { describe, it, expect, afterEach } from "vitest";
import { ambientConnection } from "../support/rocket-tables.js";

const tableName = "testings";

describe("Migration", () => {
  describe("ReferencesIndexTest", () => {
    afterEach(async () => {
      const connection = await ambientConnection();
      await connection.dropTable(tableName, { ifExists: true });
    });

    it("creates index", async () => {
      const connection = await ambientConnection();
      await connection.createTable(tableName, (t) => {
        t.references("foo", { index: true });
      });

      expect(
        await connection.indexExists(tableName, "foo_id", { name: "index_testings_on_foo_id" }),
      ).toBeTruthy();
    });

    it("creates index by default even if index option is not passed", async () => {
      const connection = await ambientConnection();
      await connection.createTable(tableName, (t) => {
        t.references("foo");
      });

      expect(
        await connection.indexExists(tableName, "foo_id", { name: "index_testings_on_foo_id" }),
      ).toBeTruthy();
    });

    it("does not create index explicit", async () => {
      const connection = await ambientConnection();
      await connection.createTable(tableName, (t) => {
        t.references("foo", { index: false });
      });

      expect(
        await connection.indexExists(tableName, "foo_id", { name: "index_testings_on_foo_id" }),
      ).toBeFalsy();
    });

    it("creates index with options", async () => {
      const connection = await ambientConnection();
      await connection.createTable(tableName, (t) => {
        t.references("foo", { index: { name: "index_testings_on_yo_momma" } });
        t.references("bar", { index: { unique: true } });
      });

      expect(
        await connection.indexExists(tableName, "foo_id", { name: "index_testings_on_yo_momma" }),
      ).toBeTruthy();
      expect(
        await connection.indexExists(tableName, "bar_id", {
          name: "index_testings_on_bar_id",
          unique: true,
        }),
      ).toBeTruthy();
    });

    it("creates polymorphic index", async () => {
      const connection = await ambientConnection();
      await connection.createTable(tableName, (t) => {
        t.references("foo", { polymorphic: true, index: true });
      });

      expect(
        await connection.indexExists(tableName, ["foo_type", "foo_id"], {
          name: "index_testings_on_foo",
        }),
      ).toBeTruthy();
    });

    it("creates polymorphic index with custom name", async () => {
      const connection = await ambientConnection();
      await connection.createTable(tableName, (t) => {
        t.references("foo", { polymorphic: true, index: { name: "testings_foo_index" } });
      });

      expect(
        await connection.indexExists(tableName, ["foo_type", "foo_id"], {
          name: "testings_foo_index",
        }),
      ).toBeTruthy();
    });

    it("creates index for existing table", async () => {
      const connection = await ambientConnection();
      await connection.createTable(tableName);
      await connection.changeTable(tableName, async (t) => {
        await t.references("foo", { index: true });
      });

      expect(
        await connection.indexExists(tableName, "foo_id", { name: "index_testings_on_foo_id" }),
      ).toBeTruthy();
    });

    it("creates index for existing table even if index option is not passed", async () => {
      const connection = await ambientConnection();
      await connection.createTable(tableName);
      await connection.changeTable(tableName, async (t) => {
        await t.references("foo");
      });

      expect(
        await connection.indexExists(tableName, "foo_id", { name: "index_testings_on_foo_id" }),
      ).toBeTruthy();
    });

    it("does not create index for existing table explicit", async () => {
      const connection = await ambientConnection();
      await connection.createTable(tableName);
      await connection.changeTable(tableName, async (t) => {
        await t.references("foo", { index: false });
      });

      expect(
        await connection.indexExists(tableName, "foo_id", { name: "index_testings_on_foo_id" }),
      ).toBeFalsy();
    });

    it("creates polymorphic index for existing table", async () => {
      const connection = await ambientConnection();
      await connection.createTable(tableName);
      await connection.changeTable(tableName, async (t) => {
        await t.references("foo", { polymorphic: true, index: true });
      });

      expect(
        await connection.indexExists(tableName, ["foo_type", "foo_id"], {
          name: "index_testings_on_foo",
        }),
      ).toBeTruthy();
    });

    it("creates polymorphic index for existing table with custom name", async () => {
      const connection = await ambientConnection();
      await connection.createTable(tableName);
      await connection.changeTable(tableName, async (t) => {
        await t.references("foo", { polymorphic: true, index: { name: "testings_foo_index" } });
      });

      expect(
        await connection.indexExists(tableName, ["foo_type", "foo_id"], {
          name: "testings_foo_index",
        }),
      ).toBeTruthy();
    });
  });
});
