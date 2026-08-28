import { describe, it, expect, beforeEach } from "vitest";
import { Table, UpdateManager, Nodes } from "./index.js";
import { fakeRecordEngine } from "./test-helpers/connection.js";
import { mustBeLike } from "./test-helpers/must-be-like.js";

describe("UpdateManagerTest", () => {
  it("should not quote sql literals", () => {
    const table = new Table("users");
    const um = new UpdateManager();
    um.table(table);
    um.set([[table.get("name"), new Nodes.BindParam(1)]]);
    expect(mustBeLike(um.toSql(fakeRecordEngine))).toBe(
      mustBeLike(` UPDATE "users" SET "name" =  ? `),
    );
  });

  it("handles limit properly", () => {
    const table = new Table("users");
    const um = new UpdateManager();
    um.key = "id";
    um.take(10);
    um.table(table);
    um.set([[table.get("name"), null]]);
    expect(um.toSql(fakeRecordEngine)).toMatch(/LIMIT 10/);
  });

  describe("having", () => {
    it("sets having", () => {
      const usersTable = new Table("users");
      const postsTable = new Table("posts");
      const joinSource = new Nodes.InnerJoin(usersTable, postsTable);

      const updateManager = new UpdateManager();
      updateManager.table(joinSource);
      updateManager.group(["posts.id"]);
      updateManager.having("count(posts.id) >= 2");

      expect(updateManager.ast.havings).toEqual([new Nodes.SqlLiteral("count(posts.id) >= 2")]);
    });
  });

  describe("group", () => {
    it("adds columns to the AST when group value is a String", () => {
      const usersTable = new Table("users");
      const postsTable = new Table("posts");
      const joinSource = new Nodes.InnerJoin(usersTable, postsTable);

      const updateManager = new UpdateManager();
      updateManager.table(joinSource);
      updateManager.group(["posts.id"]);
      updateManager.having("count(posts.id) >= 2");

      expect(updateManager.ast.groups.length).toEqual(1);
      const groupAst = updateManager.ast.groups[0] as Nodes.Group;
      expect(groupAst).toBeInstanceOf(Nodes.Group);
      expect(String(groupAst.expr)).toEqual("posts.id");
      expect(updateManager.ast.havings).toEqual([new Nodes.SqlLiteral("count(posts.id) >= 2")]);
    });

    it("adds columns to the AST when group value is a Symbol", () => {
      const usersTable = new Table("users");
      const postsTable = new Table("posts");
      const joinSource = new Nodes.InnerJoin(usersTable, postsTable);

      const updateManager = new UpdateManager();
      updateManager.table(joinSource);
      updateManager.group([":posts.id"]);
      updateManager.having("count(posts.id) >= 2");

      expect(updateManager.ast.groups.length).toEqual(1);
      const groupAst = updateManager.ast.groups[0] as Nodes.Group;
      expect(groupAst).toBeInstanceOf(Nodes.Group);
      expect(String(groupAst.expr)).toEqual("posts.id");
      expect(updateManager.ast.havings).toEqual([new Nodes.SqlLiteral("count(posts.id) >= 2")]);
    });
  });

  describe("set", () => {
    it("updates with null", () => {
      const table = new Table("users");
      const um = new UpdateManager();
      um.table(table);
      um.set([[table.get("name"), null]]);
      expect(mustBeLike(um.toSql(fakeRecordEngine))).toBe(
        mustBeLike(` UPDATE "users" SET "name" =  NULL `),
      );
    });

    it("takes a string", () => {
      const table = new Table("users");
      const um = new UpdateManager();
      um.table(table);
      um.set(new Nodes.SqlLiteral("foo = bar"));
      expect(mustBeLike(um.toSql(fakeRecordEngine))).toBe(
        mustBeLike(` UPDATE "users" SET foo = bar `),
      );
    });

    it("takes a list of lists", () => {
      const table = new Table("users");
      const um = new UpdateManager();
      um.table(table);
      um.set([
        [table.get("id"), 1],
        [table.get("name"), "hello"],
      ]);
      expect(mustBeLike(um.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          UPDATE "users" SET "id" = 1, "name" =  'hello'
        `),
      );
    });

    it("chains", () => {
      const table = new Table("users");
      const um = new UpdateManager();
      expect(
        um.set([
          [table.get("id"), 1],
          [table.get("name"), "hello"],
        ]),
      ).toEqual(um);
    });
  });

  describe("table", () => {
    it("generates an update statement", () => {
      const um = new UpdateManager();
      um.table(new Table("users"));
      expect(mustBeLike(um.toSql(fakeRecordEngine))).toBe(mustBeLike(` UPDATE "users" `));
    });

    it("chains", () => {
      const um = new UpdateManager();
      expect(um.table(new Table("users"))).toEqual(um);
    });

    it("generates an update statement with joins", () => {
      const um = new UpdateManager();

      const table = new Table("users");
      const joinSource = new Nodes.JoinSource(table, [table.createJoin(new Table("posts"))]);

      um.table(joinSource);
      expect(mustBeLike(um.toSql(fakeRecordEngine))).toBe(
        mustBeLike(` UPDATE "users" INNER JOIN "posts" `),
      );
    });
  });

  describe("where", () => {
    it("generates a where clause", () => {
      const table = new Table("users");
      const um = new UpdateManager();
      um.table(table);
      um.where(table.get("id").eq(1));
      expect(mustBeLike(um.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          UPDATE "users" WHERE "users"."id" = 1
        `),
      );
    });

    it("chains", () => {
      const table = new Table("users");
      const um = new UpdateManager();
      um.table(table);
      expect(um.where(table.get("id").eq(1))).toEqual(um);
    });
  });

  describe("key", () => {
    let table: Table;
    let um: UpdateManager;

    beforeEach(() => {
      table = new Table("users");
      um = new UpdateManager();
      um.key = table.get("foo");
    });

    it("can be set", () => {
      expect(um.ast.key).toEqual(table.get("foo"));
    });

    it("can be accessed", () => {
      expect(um.key).toEqual(table.get("foo"));
    });
  });
});
