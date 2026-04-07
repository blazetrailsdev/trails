import { describe, it, expect } from "vitest";
import { Table, star, SelectManager, Nodes, Visitors } from "../index.js";

describe("MysqlTest", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  it("should escape LIMIT", () => {
    const mgr = users.project(star).take(10);
    expect(mgr.toSql()).toContain("LIMIT 10");
  });

  describe("Nodes::Regexp", () => {
    it("should know how to visit", () => {
      const node = users.get("name").matchesRegexp("bar");
      expect(node).toBeInstanceOf(Nodes.Regexp);
      expect(node.left).toHaveProperty("name", "name");
    });

    it("can handle subqueries", () => {
      const node = users.get("name").matchesRegexp("foo.*");
      expect(node).toBeInstanceOf(Nodes.Regexp);
      expect(node.left).toHaveProperty("name", "name");
    });
  });

  describe("Nodes::NotRegexp", () => {
    it("can handle subqueries", () => {
      const node = users.get("name").doesNotMatchRegexp("foo.*");
      expect(node).toBeInstanceOf(Nodes.NotRegexp);
      expect(node.left).toHaveProperty("name", "name");
    });

    it("should know how to visit", () => {
      const node = users.get("name").doesNotMatchRegexp("bar");
      expect(node).toBeInstanceOf(Nodes.NotRegexp);
      expect(node.left).toHaveProperty("name", "name");
    });
  });

  describe("Nodes::IsDistinctFrom", () => {
    it("should handle nil", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("name").isDistinctFrom(null);
      expect(visitor.compile(node)).toContain("IS DISTINCT FROM");
    });
  });

  describe("Nodes::Ordering", () => {
    it("should handle nulls first", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").asc().nullsFirst();
      expect(visitor.compile(node)).toContain("NULLS FIRST");
    });

    it("should handle nulls last", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").asc().nullsLast();
      expect(visitor.compile(node)).toContain("NULLS LAST");
    });

    it("should handle nulls first reversed", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").asc().nullsLast().reverse();
      expect(visitor.compile(node)).toContain("NULLS FIRST");
    });

    it("should handle nulls last reversed", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").asc().nullsFirst().reverse();
      expect(visitor.compile(node)).toContain("NULLS LAST");
    });
  });

  describe("Nodes::NullsFirst / NullsLast (MySQL emulation)", () => {
    it("emulates NULLS FIRST with IS NOT NULL", () => {
      const visitor = new Visitors.MySQL();
      const node = users.get("id").asc().nullsFirst();
      const sql = visitor.compile(node);
      expect(sql).toContain('"users"."id" IS NOT NULL');
      expect(sql).toContain('"users"."id" ASC');
    });

    it("emulates NULLS LAST with IS NULL", () => {
      const visitor = new Visitors.MySQL();
      const node = users.get("id").asc().nullsLast();
      const sql = visitor.compile(node);
      expect(sql).toContain('"users"."id" IS NULL');
      expect(sql).toContain('"users"."id" ASC');
    });

    it("emulates NULLS FIRST with DESC ordering", () => {
      const visitor = new Visitors.MySQL();
      const node = users.get("id").desc().nullsFirst();
      const sql = visitor.compile(node);
      expect(sql).toContain('"users"."id" IS NOT NULL');
      expect(sql).toContain('"users"."id" DESC');
    });

    it("emulates NULLS LAST with DESC ordering", () => {
      const visitor = new Visitors.MySQL();
      const node = users.get("id").desc().nullsLast();
      const sql = visitor.compile(node);
      expect(sql).toContain('"users"."id" IS NULL');
      expect(sql).toContain('"users"."id" DESC');
    });
  });

  it("defaults limit to 18446744073709551615", () => {
    const mgr = users.project(star).skip(5);
    const sql = new Visitors.MySQL().compile(mgr.ast);
    expect(sql).toContain("LIMIT 18446744073709551615");
    expect(sql).toContain("OFFSET 5");
  });

  it("uses DUAL for empty from", () => {
    const mgr = new SelectManager();
    mgr.project("1");
    const sql = new Visitors.MySQL().compile(mgr.ast);
    expect(sql).toContain("FROM DUAL");
  });

  describe("locking", () => {
    it("defaults to FOR UPDATE when locking", () => {
      const mgr = users.project(star).lock();
      const sql = new Visitors.MySQL().compile(mgr.ast);
      expect(sql).toContain("FOR UPDATE");
    });

    it("allows a custom string to be used as a lock", () => {
      const mgr = users.project(star).lock("LOCK IN SHARE MODE");
      const sql = new Visitors.MySQL().compile(mgr.ast);
      expect(sql).toContain("LOCK IN SHARE MODE");
    });
  });

  describe("concat", () => {
    it("concats columns", () => {
      const node = new Nodes.Concat(users.get("name"), users.get("email"));
      const sql = new Visitors.MySQL().compile(node);
      expect(sql).toBe('CONCAT("users"."name", "users"."email")');
    });

    it("concats a string", () => {
      const node = new Nodes.Concat(users.get("name"), new Nodes.Quoted("x"));
      const sql = new Visitors.MySQL().compile(node);
      expect(sql).toBe('CONCAT("users"."name", \'x\')');
    });
  });

  describe("Nodes::IsNotDistinctFrom", () => {
    it("should handle column names on both sides", () => {
      const node = users.get("id").isNotDistinctFrom(posts.get("user_id"));
      const sql = new Visitors.MySQL().compile(node);
      expect(sql).toContain("IS NOT DISTINCT FROM");
      expect(sql).toContain('"users"."id"');
      expect(sql).toContain('"posts"."user_id"');
    });

    it("should handle nil", () => {
      const node = users.get("name").isNotDistinctFrom(null);
      const sql = new Visitors.MySQL().compile(node);
      expect(sql).toContain("IS NOT DISTINCT FROM");
      expect(sql).toContain('"users"."name"');
      expect(sql).toContain("NULL");
    });

    it("should construct a valid generic SQL statement", () => {
      const node = users.get("name").isNotDistinctFrom(new Nodes.Quoted(1));
      const sql = new Visitors.MySQL().compile(node);
      expect(sql).toContain("IS NOT DISTINCT FROM");
    });
  });

  describe("Nodes::IsDistinctFrom", () => {
    it("should handle column names on both sides", () => {
      const node = users.get("id").isDistinctFrom(posts.get("user_id"));
      const sql = new Visitors.MySQL().compile(node);
      expect(sql).toContain("IS DISTINCT FROM");
    });
  });

  describe("Nodes::Cte", () => {
    it("ignores MATERIALIZED modifiers", () => {
      const cte = new Nodes.Cte("t", users.project(users.get("id")).ast, "materialized");
      const stmt = new SelectManager().with(cte).project("1");
      const sql = new Visitors.MySQL().compile(stmt.ast);
      expect(sql).not.toContain("MATERIALIZED");
    });

    it("ignores NOT MATERIALIZED modifiers", () => {
      const cte = new Nodes.Cte("t", users.project(users.get("id")).ast, "not_materialized");
      const stmt = new SelectManager().with(cte).project("1");
      const sql = new Visitors.MySQL().compile(stmt.ast);
      expect(sql).not.toContain("NOT MATERIALIZED");
    });
  });
});
