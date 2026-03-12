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
} from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("mysql", () => {
    it("should escape LIMIT", () => {
      const mgr = users.project(star).take(10);
      expect(mgr.toSql()).toContain("LIMIT 10");
    });

    it("can handle subqueries", () => {
      const subquery = users.project(users.get("id"));
      const node = users.get("id").in(subquery);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("SELECT");
    });

    it("should know how to visit", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").in([1, 2, 3]);
      expect(visitor.compile(node)).toContain("IN");
    });

    it("should handle nil", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("name").eq(null);
      expect(visitor.compile(node)).toBe('"users"."name" IS NULL');
    });

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

    it("should construct a valid generic SQL statement", () => {
      const mgr = users.project(users.get("id")).where(users.get("id").gt(1));
      const sql = new Visitors.MySQL().compile(mgr.ast);
      expect(sql).toContain("SELECT");
      expect(sql).toContain("FROM");
      expect(sql).toContain("WHERE");
    });

    it("should handle column names on both sides", () => {
      const node = users.get("id").eq(posts.get("user_id"));
      const sql = new Visitors.MySQL().compile(node);
      expect(sql).toBe('"users"."id" = "posts"."user_id"');
    });

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
