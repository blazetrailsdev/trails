import { describe, it, expect, beforeEach } from "vitest";
import {
  Table,
  sql,
  star,
  SelectManager,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  Visitors,
  Collectors,
} from "./index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("insert-manager", () => {
    it("can create a ValuesList node", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.ast.columns = [users.get("name"), users.get("age")];
      mgr.values(
        new Nodes.ValuesList([
          [new Nodes.Quoted("dean"), new Nodes.Quoted(30)],
          [new Nodes.Quoted("sam"), new Nodes.Quoted(25)],
        ]),
      );
      expect(mgr.toSql()).toBe(
        `INSERT INTO "users" ("name", "age") VALUES ('dean', 30), ('sam', 25)`,
      );
    });

    it("allows sql literals", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([[users.get("name"), sql("NOW()")]]);
      expect(mgr.toSql()).toContain("NOW()");
    });

    it("works with multiple values", () => {
      const im = new InsertManager();
      im.into(users);
      im.insert([
        [users.get("name"), "alice"],
        [users.get("id"), 1],
      ]);
      const sql = im.toSql();
      expect(sql).toContain('"name"');
      expect(sql).toContain('"id"');
    });

    it("literals in multiple values are not escaped", () => {
      const im = new InsertManager();
      im.into(users);
      im.insert([[users.get("name"), new Nodes.SqlLiteral("DEFAULT")]]);
      const sql = im.toSql();
      expect(sql).toContain("DEFAULT");
      expect(sql).not.toContain("'DEFAULT'");
    });

    it("works with multiple single values", () => {
      const im = new InsertManager();
      im.into(users);
      im.insert([[users.get("name"), "bob"]]);
      const sql = im.toSql();
      expect(sql).toContain("'bob'");
    });

    it("inserts false", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([[users.get("active"), false]]);
      expect(mgr.toSql()).toContain("FALSE");
    });

    it("inserts null", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([[users.get("name"), null]]);
      expect(mgr.toSql()).toBe('INSERT INTO "users" ("name") VALUES (NULL)');
    });

    it("takes a list of lists", () => {
      const im = new InsertManager();
      im.into(users);
      const vl = im.createValuesList([[new Nodes.Quoted("alice")], [new Nodes.Quoted("bob")]]);
      im.values(vl);
      im.ast.columns = [users.get("name")];
      const sql = im.toSql();
      expect(sql).toContain("VALUES");
    });

    it("noop for empty list", () => {
      const im = new InsertManager();
      im.into(users);
      // No values set - should still generate partial SQL
      const sql = im.toSql();
      expect(sql).toContain("INSERT INTO");
    });

    it("takes a Table and chains", () => {
      const im = new InsertManager();
      const result = im.into(users);
      expect(result).toBe(im);
    });

    it("converts to sql", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([
        [users.get("name"), "dean"],
        [users.get("age"), 30],
      ]);
      expect(mgr.toSql()).toBe(`INSERT INTO "users" ("name", "age") VALUES ('dean', 30)`);
    });

    it("converts to sql", () => {
      const im = new InsertManager();
      im.into(users);
      im.insert([[users.get("id"), 1]]);
      const sql = im.toSql();
      expect(sql).toContain("INSERT INTO");
      expect(sql).toContain('"users"');
    });

    it("accepts sql literals", () => {
      const im = new InsertManager();
      im.into(users);
      im.insert([[users.get("name"), new Nodes.SqlLiteral("DEFAULT")]]);
      const sql = im.toSql();
      expect(sql).toContain("DEFAULT");
    });

    it("combines columns and values list in order", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([
        [users.get("name"), "Alice"],
        [users.get("email"), "alice@example.com"],
      ]);
      expect(mgr.columns.length).toBe(2);
    });

    it("accepts a select query in place of a VALUES clause", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.ast.columns = [users.get("name")];
      const selectMgr = posts.project(posts.get("title"));
      mgr.select(selectMgr);
      expect(mgr.toSql()).toContain("SELECT");
    });

    it("generates INSERT", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([
        [users.get("name"), "dean"],
        [users.get("age"), 30],
      ]);
      expect(mgr.toSql()).toBe(`INSERT INTO "users" ("name", "age") VALUES ('dean', 30)`);
    });

    it("inserts null", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([[users.get("name"), null]]);
      expect(mgr.toSql()).toBe(`INSERT INTO "users" ("name") VALUES (NULL)`);
    });

    it("can create a ValuesList node", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.ast.columns = [users.get("name"), users.get("age")];
      mgr.values(
        new Nodes.ValuesList([
          [new Nodes.Quoted("dean"), new Nodes.Quoted(30)],
          [new Nodes.Quoted("sam"), new Nodes.Quoted(25)],
        ]),
      );
      expect(mgr.toSql()).toBe(
        `INSERT INTO "users" ("name", "age") VALUES ('dean', 30), ('sam', 25)`,
      );
    });

    it("returns empty array before insert", () => {
      const manager = new InsertManager();
      expect(manager.columns).toEqual([]);
    });

    it("combines columns and values list in order", () => {
      const manager = new InsertManager();
      manager.into(users);
      manager.insert([
        [users.attr("name"), "Alice"],
        [users.attr("email"), "alice@example.com"],
      ]);
      expect(manager.columns.length).toBe(2);
    });

    it("should handle false", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([[users.get("active"), false]]);
      expect(mgr.toSql()).toContain("FALSE");
    });

    it.todo("inserts time", () => {});

    it.todo("defaults the table", () => {});

    it.todo("is chainable", () => {});
  });
});
