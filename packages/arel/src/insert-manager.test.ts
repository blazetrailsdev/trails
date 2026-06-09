import { describe, it, expect } from "vitest";
import { Table, sql, InsertManager, Nodes } from "./index.js";

describe("InsertManagerTest", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  describe("insert", () => {
    it("can create a ValuesList node", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.ast.columns = [users.get("name"), users.get("age")];
      mgr.values = new Nodes.ValuesList([
        [new Nodes.Quoted("dean"), new Nodes.Quoted(30)],
        [new Nodes.Quoted("sam"), new Nodes.Quoted(25)],
      ]);
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
      im.values = vl;
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
  });

  describe("into", () => {
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
  });

  describe("values", () => {
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
  });

  describe("combo", () => {
    it("combines columns and values list in order", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([
        [users.get("name"), "Alice"],
        [users.get("email"), "alice@example.com"],
      ]);
      expect(mgr.columns.length).toBe(2);
    });
  });

  describe("select", () => {
    it("accepts a select query in place of a VALUES clause", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.ast.columns = [users.get("name")];
      const selectMgr = posts.project(posts.get("title"));
      mgr.select(selectMgr);
      expect(mgr.toSql()).toContain("SELECT");
    });
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

  describe("insert", () => {
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
      mgr.values = new Nodes.ValuesList([
        [new Nodes.Quoted("dean"), new Nodes.Quoted(30)],
        [new Nodes.Quoted("sam"), new Nodes.Quoted(25)],
      ]);
      expect(mgr.toSql()).toBe(
        `INSERT INTO "users" ("name", "age") VALUES ('dean', 30), ('sam', 25)`,
      );
    });
  });

  it("returns empty array before insert", () => {
    const manager = new InsertManager();
    expect(manager.columns).toEqual([]);
  });

  describe("insert", () => {
    it("inserts false", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([[users.get("active"), false]]);
      expect(mgr.toSql()).toContain("FALSE");
    });

    it("inserts time", () => {
      const mgr = new InsertManager(users);
      const at = new Date(2020, 0, 2, 12, 34, 56);
      mgr.insert([[users.get("created_at"), at]]);
      expect(mgr.toSql()).toContain("2020-01-02");
    });

    it("defaults the table", () => {
      const mgr = new InsertManager(users);
      mgr.insert([[users.get("name"), "dean"]]);
      expect(mgr.toSql()).toContain('INSERT INTO "users"');
    });

    it("is chainable", () => {
      const mgr = new InsertManager();
      expect(mgr.into(users)).toBe(mgr);
      expect(mgr.insert([[users.get("name"), "dean"]])).toBe(mgr);
      expect(mgr.toSql()).toContain("INSERT");
    });
  });

  // Mirrors Rails: `Arel::InsertManager#insert` (insert_manager.rb).
  describe("insert (Rails parity)", () => {
    it("is a no-op for an empty fields array", () => {
      const mgr = new InsertManager();
      mgr.insert([]);
      expect(mgr.ast.values).toBeNull();
      expect(mgr.ast.relation).toBeNull();
      expect(mgr.ast.columns).toEqual([]);
    });

    it("stores a string `fields` value as a SqlLiteral on ast.values", () => {
      const mgr = new InsertManager(users);
      mgr.insert("foo");
      expect(mgr.ast.values).toBeInstanceOf(Nodes.SqlLiteral);
      expect((mgr.ast.values as Nodes.SqlLiteral).value).toBe("foo");
    });

    it("infers ast.relation from the first column when not yet set", () => {
      const mgr = new InsertManager();
      mgr.insert([[users.get("name"), "alice"]]);
      expect(mgr.ast.relation).toBe(users);
    });

    it("preserves an explicit ast.relation rather than inferring", () => {
      const mgr = new InsertManager(posts);
      mgr.insert([[users.get("name"), "alice"]]);
      expect(mgr.ast.relation).toBe(posts);
    });
  });

  // Mirrors Rails: `InsertManager#select` stores the manager itself
  // (insert_manager.rb), not its inner `.ast`. The visitor handles
  // the SelectManager-shaped duck-type via `visitNodeOrValue`.
  describe("select (Rails parity)", () => {
    it("stores the SelectManager itself on ast.select", () => {
      const mgr = new InsertManager(users);
      mgr.ast.columns = [users.get("name")];
      const selectMgr = posts.project(posts.get("title"));
      mgr.select(selectMgr);
      expect(mgr.ast.select).toBe(selectMgr);
      expect(mgr.toSql()).toContain("SELECT");
    });
  });
});
