import { describe, it, expect } from "vitest";
import { isPresent } from "@blazetrails/activesupport";
import { assertPredicate } from "@blazetrails/activesupport";
import { ambientConnection } from "../support/rocket-tables.js";
import { adapterType } from "../test-adapter.js";
import type { AbstractMysqlAdapter } from "../connection-adapters/abstract-mysql-adapter.js";
import type { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import type { SchemaStatements } from "../connection-adapters/abstract/schema-statements.js";

describe("Migration", () => {
  describe("SchemaDefinitionsTest", () => {
    it("build create table definition with block", async () => {
      const connection = (await ambientConnection()) as unknown as SchemaStatements;
      const td = await connection.buildCreateTableDefinition("test", {}, (t) => {
        t.column("foo", "string");
      });

      const idColumn = td.columns.find((col) => col.name === "id");
      assertPredicate(idColumn, isPresent);

      const fooColumn = td.columns.find((col) => col.name === "foo");
      assertPredicate(fooColumn, isPresent);
    });

    it("build create table definition without block", async () => {
      const connection = (await ambientConnection()) as unknown as SchemaStatements;
      const td = await connection.buildCreateTableDefinition("test");

      const idColumn = td.columns.find((col) => col.name === "id");
      assertPredicate(idColumn, isPresent);
    });

    it("build create join table definition with block", async () => {
      const connection = (await ambientConnection()) as unknown as SchemaStatements;
      expect(await connection.tableExists("posts")).toBeTruthy();
      expect(await connection.tableExists("comments")).toBeTruthy();

      const joinTd = await connection.buildCreateJoinTableDefinition(
        "posts",
        "comments",
        {},
        (t) => {
          t.column("another_col", "string");
        },
      );

      expect(joinTd.name).toBe("comments_posts");
      expect(joinTd.columns.map((c) => c.name).sort()).toEqual([
        "another_col",
        "comment_id",
        "post_id",
      ]);
    });

    it("build create join table definition without block", async () => {
      const connection = (await ambientConnection()) as unknown as SchemaStatements;
      expect(await connection.tableExists("posts")).toBeTruthy();
      expect(await connection.tableExists("comments")).toBeTruthy();

      const joinTd = await connection.buildCreateJoinTableDefinition("posts", "comments");

      expect(joinTd.name).toBe("comments_posts");
      expect(joinTd.columns.map((c) => c.name).sort()).toEqual(["comment_id", "post_id"]);
    });

    it("build create index definition", async () => {
      const connection = await ambientConnection();
      try {
        await connection.createTable("test", (t) => {
          t.column("foo", "string");
        });
        const createIndex = await connection.buildCreateIndexDefinition("test", "foo");

        expect(createIndex!.index.name).toBe("index_test_on_foo");
      } finally {
        if (await connection.tableExists("test")) await connection.dropTable("test");
      }
    });

    it.skipIf(adapterType !== "mysql")(
      "build create index definition for existing index",
      async () => {
        const connection = (await ambientConnection()) as AbstractMysqlAdapter;
        try {
          await connection.createTable("test", (t) => {
            t.column("foo", "string");
          });
          await connection.addIndex("test", "foo");

          const createIndex = await connection.buildCreateIndexDefinition("test", "foo", {
            ifNotExists: true,
          });
          expect(createIndex).toBeUndefined();
        } finally {
          if (await connection.tableExists("test")) await connection.dropTable("test");
        }
      },
    );

    it.skipIf(adapterType === "sqlite")("build change column definition", async () => {
      const connection = (await ambientConnection()) as PostgreSQLAdapter;
      try {
        await connection.createTable("test", (t) => {
          t.column("foo", "string");
        });

        const changeCd = await connection.buildChangeColumnDefinition("test", "foo", "integer");
        const changeCol = changeCd.column;
        expect(String(changeCol.name)).toBe("foo");
      } finally {
        if (await connection.tableExists("test")) await connection.dropTable("test");
      }
    });

    it.skipIf(adapterType === "sqlite")("build change column default definition", async () => {
      const connection = (await ambientConnection()) as unknown as SchemaStatements;
      try {
        await connection.createTable("test", (t) => {
          t.column("foo", "string");
        });

        const changeDefaultCd = (await connection.buildChangeColumnDefaultDefinition(
          "test",
          "foo",
          "new",
        ))!;
        expect(changeDefaultCd.default).toBe("new");

        const changeCol = changeDefaultCd.column;
        expect(String(changeCol.name)).toBe("foo");
      } finally {
        if (await connection.tableExists("test")) await connection.dropTable("test");
      }
    });
  });
});
