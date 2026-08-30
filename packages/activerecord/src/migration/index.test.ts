import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "../base.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import type { AddIndexOptions } from "../connection-adapters/abstract/schema-definitions.js";
import { ambientConnection } from "../support/rocket-tables.js";
import { adapterSupports } from "../support/supports.js";
import { adapterType } from "../test-adapter.js";

function goodIndexName(connection: AbstractAdapter): string {
  return "x".repeat(connection.indexNameLength());
}

describe("Migration", () => {
  describe("IndexTest", () => {
    const tableName = "testings";

    beforeEach(async () => {
      const connection = await ambientConnection();

      await connection.createTable(tableName, { force: true }, (t) => {
        t.column("foo", "string", { limit: 100 });
        t.column("bar", "string", { limit: 100 });

        t.string("first_name");
        t.string("last_name", { limit: 100 });
        t.string("key", { limit: 100 });
        t.boolean("administrator");
      });
    });

    afterEach(async () => {
      const connection = await ambientConnection();
      await connection.dropTable(tableName, { ifExists: true });
      Base.primaryKeyPrefixType = null;
    });

    it("rename index", async () => {
      const connection = await ambientConnection();
      await connection.addIndex(tableName, ["foo"], { name: "old_idx" });
      await connection.renameIndex(tableName, "old_idx", "new_idx");

      expect(await connection.indexNameExists(tableName, "old_idx")).toBeFalsy();
      expect(await connection.indexNameExists(tableName, "new_idx")).toBeTruthy();
    });

    it("rename index with symbol", async () => {
      const connection = await ambientConnection();
      await connection.addIndex(tableName, ["foo"], { name: "old_idx" });
      await connection.renameIndex(tableName, "old_idx", "new_idx");

      expect(await connection.indexNameExists(tableName, "old_idx")).toBeFalsy();
      expect(await connection.indexNameExists(tableName, "new_idx")).toBeTruthy();
    });

    it("rename index too long", async () => {
      const connection = await ambientConnection();
      const tooLongIndexName = goodIndexName(connection) + "x";
      await connection.addIndex(tableName, ["foo"], { name: "old_idx" });
      await expect(connection.renameIndex(tableName, "old_idx", tooLongIndexName)).rejects.toThrow(
        new RegExp(`too long; the limit is ${connection.indexNameLength()} characters`),
      );

      expect(await connection.indexNameExists(tableName, "old_idx")).toBeTruthy();
    });

    it("remove nonexistent index", async () => {
      const connection = await ambientConnection();
      await expect(connection.removeIndex(tableName, "no_such_index")).rejects.toThrow(
        ArgumentError,
      );
    });

    it("add index works with long index names", async () => {
      const connection = await ambientConnection();
      await connection.addIndex(tableName, "foo", { name: goodIndexName(connection) });

      expect(await connection.indexNameExists(tableName, goodIndexName(connection))).toBeTruthy();
      await connection.removeIndex(tableName, { name: goodIndexName(connection) });
    });

    it("add index does not accept too long index names", async () => {
      const connection = await ambientConnection();
      const tooLongIndexName = goodIndexName(connection) + "x";

      await expect(
        connection.addIndex(tableName, "foo", { name: tooLongIndexName }),
      ).rejects.toThrow(
        new RegExp(`too long; the limit is ${connection.indexNameLength()} characters`),
      );

      expect(await connection.indexNameExists(tableName, tooLongIndexName)).toBeFalsy();
      await connection.addIndex(tableName, "foo", { name: goodIndexName(connection) });
    });

    it("add index which already exists does not raise error with option", async () => {
      const connection = await ambientConnection();
      await connection.addIndex(tableName, "foo");

      await connection.addIndex(tableName, "foo", { ifNotExists: true });

      expect(await connection.indexNameExists(tableName, "index_testings_on_foo")).toBeTruthy();
    });

    it("add index with if not exists matches exact index", async () => {
      const connection = await ambientConnection();
      await connection.addIndex(tableName, ["foo", "bar"], {
        unique: false,
        name: "index_testings_on_foo_bar",
      });

      expect(await connection.indexNameExists(tableName, "index_testings_on_foo_bar")).toBeTruthy();

      await connection.addIndex(tableName, ["foo", "bar"], { unique: true, ifNotExists: true });

      expect(
        await connection.indexNameExists(tableName, "index_testings_on_foo_and_bar"),
      ).toBeTruthy();
    });

    it("add index fallback to short name", async () => {
      const connection = await ambientConnection();
      await connection.addIndex(tableName, [
        "foo",
        "bar",
        "first_name",
        "last_name",
        "administrator",
      ]);
      expect(
        await connection.indexNameExists(
          tableName,
          "idx_on_foo_bar_first_name_last_name_administrator_5939248142",
        ),
      ).toBeTruthy();
    });

    it("remove index which does not exist doesnt raise with option", async () => {
      const connection = await ambientConnection();
      await connection.addIndex(tableName, "foo");

      await connection.removeIndex(tableName, "foo");

      await expect(connection.removeIndex(tableName, "foo")).rejects.toThrow(ArgumentError);

      await connection.removeIndex(tableName, "foo", { ifExists: true });
    });

    it("remove index with name which does not exist doesnt raise with option", async () => {
      const connection = await ambientConnection();
      await connection.addIndex(tableName, ["foo"], { name: "foo" });

      expect(await connection.indexExists(tableName, "foo", { name: "foo" })).toBeTruthy();

      await connection.removeIndex(tableName, undefined, { name: "foo", ifExists: true });

      expect(await connection.indexExists(tableName, "foo", { name: "foo" })).toBeFalsy();
    });

    it("remove index with column array which does not exist doesnt raise with option", async () => {
      const connection = await ambientConnection();
      await connection.addIndex(tableName, ["foo"], { name: "foo" });

      expect(await connection.indexExists(tableName, "foo", { name: "foo" })).toBeTruthy();

      await connection.removeIndex(tableName, { column: ["foo", "bar"], ifExists: true });

      expect(await connection.indexExists(tableName, "foo", { name: "foo" })).toBeTruthy();
      expect(
        await connection.indexExists(tableName, null, { column: ["foo", "bar"], name: "foo" }),
      ).toBeFalsy();
    });

    it("internal index with name matching database limit", async () => {
      const connection = await ambientConnection();
      const goodIndexName = "x".repeat(connection.indexNameLength());
      await connection.addIndex(tableName, "foo", { name: goodIndexName, internal: true });

      expect(await connection.indexNameExists(tableName, goodIndexName)).toBeTruthy();
      await connection.removeIndex(tableName, { name: goodIndexName });
    });

    it("index symbol names", async () => {
      const connection = await ambientConnection();
      await connection.addIndex(tableName, "foo", { name: "symbol_index_name" });
      expect(
        await connection.indexExists(tableName, "foo", { name: "symbol_index_name" }),
      ).toBeTruthy();

      await connection.removeIndex(tableName, { name: "symbol_index_name" });
      expect(
        await connection.indexExists(tableName, "foo", { name: "symbol_index_name" }),
      ).toBeFalsy();
    });

    it("index exists", async () => {
      const connection = await ambientConnection();
      await connection.addIndex("testings", "foo");

      expect(await connection.indexExists("testings", "foo")).toBeTruthy();
      expect(await connection.indexExists("testings", "bar")).toBeFalsy();
    });

    it("index exists on multiple columns", async () => {
      const connection = await ambientConnection();
      await connection.addIndex("testings", ["foo", "bar"]);

      expect(await connection.indexExists("testings", ["foo", "bar"])).toBeTruthy();
    });

    it("index exists with custom name checks columns", async () => {
      const connection = await ambientConnection();
      await connection.addIndex("testings", ["foo", "bar"], { name: "my_index" });
      expect(
        await connection.indexExists("testings", ["foo", "bar"], { name: "my_index" }),
      ).toBeTruthy();
      expect(await connection.indexExists("testings", [], { name: "my_index" })).toBeTruthy();
      expect(await connection.indexExists("testings", ["foo"], { name: "my_index" })).toBeFalsy();
    });

    it("valid index options", async () => {
      const connection = await ambientConnection();
      await expect(
        connection.addIndex("testings", "foo", { unqiue: true } as unknown as AddIndexOptions),
      ).rejects.toThrow(expect.objectContaining({ name: "ArgumentError" }));
    });

    it("unique index exists", async () => {
      const connection = await ambientConnection();
      await connection.addIndex("testings", "foo", { unique: true });

      expect(await connection.indexExists("testings", "foo", { unique: true })).toBeTruthy();
    });

    it("named index exists", async () => {
      const connection = await ambientConnection();
      await connection.addIndex("testings", "foo", { name: "custom_index_name" });

      expect(await connection.indexExists("testings", "foo")).toBeTruthy();
      expect(
        await connection.indexExists("testings", "foo", { name: "custom_index_name" }),
      ).toBeTruthy();
      expect(
        await connection.indexExists("testings", "foo", { name: "other_index_name" }),
      ).toBeFalsy();
    });

    it("remove named index", async () => {
      const connection = await ambientConnection();
      await connection.addIndex("testings", "foo", {
        name: "index_testings_on_custom_index_name",
      });

      expect(await connection.indexExists("testings", "foo")).toBeTruthy();

      await expect(connection.removeIndex("testings", "custom_index_name")).rejects.toThrow(
        ArgumentError,
      );

      await connection.removeIndex("testings", "foo");
      expect(await connection.indexExists("testings", "foo")).toBeFalsy();
    });

    it("add index attribute length limit", async () => {
      const connection = await ambientConnection();
      await connection.addIndex("testings", ["foo", "bar"], {
        length: { foo: 10, bar: null } as unknown as Record<string, number>,
      });

      expect(await connection.indexExists("testings", ["foo", "bar"])).toBeTruthy();
    });

    it("add index", async () => {
      const connection = await ambientConnection();
      await connection.addIndex("testings", "last_name");
      expect(await connection.indexExists("testings", "last_name")).toBeTruthy();
      await connection.removeIndex("testings", "last_name");
      expect(await connection.indexExists("testings", "last_name")).toBeFalsy();

      await connection.addIndex("testings", ["last_name", "first_name"]);
      await connection.removeIndex("testings", { column: ["last_name", "first_name"] });

      await connection.addIndex("testings", ["last_name", "first_name"]);
      await connection.removeIndex("testings", {
        name: "index_testings_on_last_name_and_first_name",
      });
      await connection.addIndex("testings", ["last_name", "first_name"]);
      await connection.removeIndex("testings", "last_name_and_first_name");

      await connection.addIndex("testings", ["last_name", "first_name"]);
      await connection.removeIndex("testings", ["last_name", "first_name"]);

      await connection.addIndex("testings", ["last_name"], { length: 10 });
      await connection.removeIndex("testings", "last_name");

      await connection.addIndex("testings", ["last_name"], { length: { last_name: 10 } });
      await connection.removeIndex("testings", ["last_name"]);

      await connection.addIndex("testings", ["last_name", "first_name"], { length: 10 });
      await connection.removeIndex("testings", ["last_name", "first_name"]);

      await connection.addIndex("testings", ["last_name", "first_name"], {
        length: { last_name: 10, first_name: 20 },
      });
      await connection.removeIndex("testings", ["last_name", "first_name"]);

      await connection.addIndex("testings", "key", { unique: true });
      await connection.removeIndex("testings", "key", { unique: true } as { name?: string });

      await connection.addIndex("testings", ["key"], { name: "key_idx", unique: true });
      await connection.removeIndex("testings", { name: "key_idx", unique: true } as {
        name?: string;
      });

      await connection.addIndex("testings", ["last_name", "first_name", "administrator"], {
        name: "named_admin",
      });
      await connection.removeIndex("testings", { name: "named_admin" });

      await connection.addIndex("testings", ["last_name"], { order: { last_name: "desc" } });
      await connection.removeIndex("testings", ["last_name"]);
      await connection.addIndex("testings", ["last_name", "first_name"], {
        order: { last_name: "desc" },
      });
      await connection.removeIndex("testings", ["last_name", "first_name"]);
      await connection.addIndex("testings", ["last_name", "first_name"], {
        order: { last_name: "desc", first_name: "asc" },
      });
      await connection.removeIndex("testings", ["last_name", "first_name"]);
      await connection.addIndex("testings", ["last_name", "first_name"], { order: "desc" });
      await connection.removeIndex("testings", ["last_name", "first_name"]);
    });

    it.skipIf(adapterType !== "postgres")("add partial index", async () => {
      const connection = await ambientConnection();
      await connection.addIndex("testings", "last_name", { where: "first_name = 'john doe'" });
      expect(await connection.indexExists("testings", "last_name")).toBeTruthy();

      await connection.removeIndex("testings", "last_name");
      expect(await connection.indexExists("testings", "last_name")).toBeFalsy();
    });

    it.skipIf(adapterType !== "postgres" || !adapterSupports("index_include"))(
      "add index with included column",
      async () => {
        const connection = await ambientConnection();
        await connection.addIndex("testings", "last_name", { include: ["foo"] });
        expect(
          await connection.indexExists("testings", "last_name", { include: ["foo"] }),
        ).toBeTruthy();

        await connection.removeIndex("testings", "last_name");
        expect(await connection.indexExists("testings", "last_name")).toBeFalsy();
      },
    );

    it.skipIf(adapterType !== "postgres" || !adapterSupports("index_include"))(
      "add index with multiple included columns",
      async () => {
        const connection = await ambientConnection();
        await connection.addIndex("testings", "last_name", { include: ["foo", "bar"] });
        expect(
          await connection.indexExists("testings", "last_name", { include: ["foo", "bar"] }),
        ).toBeTruthy();

        await connection.removeIndex("testings", "last_name");
        expect(await connection.indexExists("testings", "last_name")).toBeFalsy();
      },
    );

    it.skipIf(adapterType !== "postgres" || !adapterSupports("index_include"))(
      "add index with included column and where clause",
      async () => {
        const connection = await ambientConnection();
        await connection.addIndex("testings", "last_name", {
          include: ["foo"],
          where: "first_name = 'john doe'",
        });
        expect(
          await connection.indexExists("testings", "last_name", {
            include: ["foo"],
            where: "first_name = 'john doe'",
          }),
        ).toBeTruthy();

        await connection.removeIndex("testings", "last_name");
        expect(
          await connection.indexExists("testings", "last_name", {
            include: ["foo"],
            where: "first_name = 'john doe'",
          }),
        ).toBeFalsy();
      },
    );

    it.skipIf(adapterType !== "postgres" || !adapterSupports("nulls_not_distinct"))(
      "add index with nulls not distinct assert exists with same values",
      async () => {
        const connection = await ambientConnection();
        await connection.addIndex("testings", "last_name", { nullsNotDistinct: true });
        expect(
          await connection.indexExists("testings", "last_name", { nullsNotDistinct: true }),
        ).toBeTruthy();
      },
    );

    it.skipIf(adapterType !== "postgres" || !adapterSupports("nulls_not_distinct"))(
      "add index with nulls not distinct assert exists with different values",
      async () => {
        const connection = await ambientConnection();
        await connection.addIndex("testings", "last_name", { nullsNotDistinct: false });
        expect(
          await connection.indexExists("testings", "last_name", { nullsNotDistinct: true }),
        ).toBeFalsy();
      },
    );
  });
});
