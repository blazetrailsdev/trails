import { describe, it, expect } from "vitest";
import { Table, sql, SelectManager, InsertManager, Nodes } from "./index.js";
import { fakeRecordEngine, fakeRecordConnection } from "./test-helpers/connection.js";
import { mustBeLike } from "./test-helpers/must-be-like.js";

describe("InsertManagerTest", () => {
  describe("insert", () => {
    it("can create a ValuesList node", () => {
      const manager = new InsertManager();
      const values = manager.createValuesList([
        ["a", "b"],
        ["c", "d"],
      ]);

      expect(values).toBeInstanceOf(Nodes.ValuesList);
      expect(values.rows).toEqual([
        ["a", "b"],
        ["c", "d"],
      ]);
    });

    it("allows sql literals", () => {
      const manager = new InsertManager();
      manager.into(new Table("users"));
      manager.values = manager.createValues([sql("*")]);
      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" VALUES (*)
        `),
      );
    });

    it("works with multiple values", () => {
      const table = new Table("users");
      const manager = new InsertManager();
      manager.into(table);

      manager.columns.push(table.get("id"));
      manager.columns.push(table.get("name"));

      manager.values = manager.createValuesList([
        ["1", "david"],
        ["2", "kir"],
        ["3", sql("DEFAULT")],
      ]);

      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" ("id", "name") VALUES ('1', 'david'), ('2', 'kir'), ('3', DEFAULT)
        `),
      );
    });

    it("literals in multiple values are not escaped", () => {
      const table = new Table("users");
      const manager = new InsertManager();
      manager.into(table);

      manager.columns.push(table.get("name"));

      manager.values = manager.createValuesList([[sql("*")], [sql("DEFAULT")]]);

      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" ("name") VALUES (*), (DEFAULT)
        `),
      );
    });

    it("works with multiple single values", () => {
      const table = new Table("users");
      const manager = new InsertManager();
      manager.into(table);

      manager.columns.push(table.get("name"));

      manager.values = manager.createValuesList([["david"], ["kir"], [sql("DEFAULT")]]);

      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" ("name") VALUES ('david'), ('kir'), (DEFAULT)
        `),
      );
    });

    it("inserts false", () => {
      const table = new Table("users");
      const manager = new InsertManager();

      manager.insert([[table.get("bool"), false]]);
      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" ("bool") VALUES ('f')
        `),
      );
    });

    it("inserts null", () => {
      const table = new Table("users");
      const manager = new InsertManager();
      manager.insert([[table.get("id"), null]]);
      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" ("id") VALUES (NULL)
        `),
      );
    });

    it("inserts time", () => {
      const table = new Table("users");
      const manager = new InsertManager();

      const time = new Date();
      const attribute = table.get("created_at");

      manager.insert([[attribute, time]]);
      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" ("created_at") VALUES (${fakeRecordConnection.quote(time)})
        `),
      );
    });

    it("takes a list of lists", () => {
      const table = new Table("users");
      const manager = new InsertManager();
      manager.into(table);
      manager.insert([
        [table.get("id"), 1],
        [table.get("name"), "aaron"],
      ]);
      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" ("id", "name") VALUES (1, 'aaron')
        `),
      );
    });

    it("defaults the table", () => {
      const table = new Table("users");
      const manager = new InsertManager();
      manager.insert([
        [table.get("id"), 1],
        [table.get("name"), "aaron"],
      ]);
      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" ("id", "name") VALUES (1, 'aaron')
        `),
      );
    });

    it("noop for empty list", () => {
      const table = new Table("users");
      const manager = new InsertManager();
      manager.insert([[table.get("id"), 1]]);
      manager.insert([]);
      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" ("id") VALUES (1)
        `),
      );
    });

    it("is chainable", () => {
      const table = new Table("users");
      const manager = new InsertManager();
      const insertResult = manager.insert([[table.get("id"), 1]]);
      expect(insertResult).toEqual(manager);
    });
  });

  describe("into", () => {
    it("takes a Table and chains", () => {
      const manager = new InsertManager();
      expect(manager.into(new Table("users"))).toEqual(manager);
    });

    it("converts to sql", () => {
      const table = new Table("users");
      const manager = new InsertManager();
      manager.into(table);
      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users"
        `),
      );
    });
  });

  describe("columns", () => {
    it("converts to sql", () => {
      const table = new Table("users");
      const manager = new InsertManager();
      manager.into(table);
      manager.columns.push(table.get("id"));
      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" ("id")
        `),
      );
    });
  });

  describe("values", () => {
    it("converts to sql", () => {
      const table = new Table("users");
      const manager = new InsertManager();
      manager.into(table);

      manager.values = new Nodes.ValuesList([[1], [2]]);
      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" VALUES (1), (2)
        `),
      );
    });

    it("accepts sql literals", () => {
      const table = new Table("users");
      const manager = new InsertManager();
      manager.into(table);

      manager.values = sql("DEFAULT VALUES");
      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" DEFAULT VALUES
        `),
      );
    });
  });

  describe("combo", () => {
    it("combines columns and values list in order", () => {
      const table = new Table("users");
      const manager = new InsertManager();
      manager.into(table);

      manager.values = new Nodes.ValuesList([
        [1, "aaron"],
        [2, "david"],
      ]);
      manager.columns.push(table.get("id"));
      manager.columns.push(table.get("name"));
      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" ("id", "name") VALUES (1, 'aaron'), (2, 'david')
        `),
      );
    });
  });

  describe("select", () => {
    it("accepts a select query in place of a VALUES clause", () => {
      const table = new Table("users");

      const manager = new InsertManager();
      manager.into(table);

      const select = new SelectManager();
      select.project(sql("1"));
      select.project(sql('"aaron"'));

      manager.select(select);
      manager.columns.push(table.get("id"));
      manager.columns.push(table.get("name"));
      expect(mustBeLike(manager.toSql(fakeRecordEngine))).toBe(
        mustBeLike(`
          INSERT INTO "users" ("id", "name") (SELECT 1, "aaron")
        `),
      );
    });
  });
});
