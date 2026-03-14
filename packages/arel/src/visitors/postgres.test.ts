import { describe, it, expect } from "vitest";
import { Table, star, SelectManager, Nodes, Visitors } from "../index.js";

describe("PostgresTest", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  describe("Nodes::NotRegexp", () => {
    it("should know how to visit", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").in([1, 2, 3]);
      expect(visitor.compile(node)).toContain("IN");
    });
  });

  it("should escape LIMIT", () => {
    const mgr = users.project(star).take(10);
    expect(mgr.toSql()).toContain("LIMIT 10");
  });

  describe("Nodes::IsDistinctFrom", () => {
    it("should handle nil", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("name").isDistinctFrom(null);
      expect(visitor.compile(node)).toContain("IS DISTINCT FROM");
    });
  });

  describe("Nodes::NotRegexp", () => {
    it("can handle subqueries", () => {
      const node = users.get("id").notIn([1, 2, 3]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("NOT IN");
    });
  });

  describe("Nodes::DoesNotMatch", () => {
    it("can handle ESCAPE", () => {
      const node = users.get("name").doesNotMatch("foo%", true, "\\");
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("NOT LIKE");
    });
  });

  describe("locking", () => {
    it("defaults to FOR UPDATE", () => {
      const mgr = users.project(star).lock();
      const sql = new Visitors.PostgreSQL().compile(mgr.ast);
      expect(sql).toContain("FOR UPDATE");
    });

    it("allows a custom string to be used as a lock", () => {
      const mgr = users.project(star).lock("FOR SHARE");
      const sql = new Visitors.PostgreSQL().compile(mgr.ast);
      expect(sql).toContain("FOR SHARE");
    });
  });

  it("should support DISTINCT ON", () => {
    const mgr = new SelectManager(users).project(star).distinctOn(users.get("id"));
    const sql = new Visitors.PostgreSQL().compile(mgr.ast);
    expect(sql).toContain("DISTINCT ON");
  });

  it("should support DISTINCT", () => {
    const mgr = new SelectManager(users).project(star).distinct();
    const sql = new Visitors.PostgreSQL().compile(mgr.ast);
    expect(sql).toContain("SELECT DISTINCT");
  });

  it("encloses LATERAL queries in parens", () => {
    const sub = users.project(users.get("id"));
    const lat = sub.lateral();
    const sql = new Visitors.PostgreSQL().compile(lat);
    expect(sql).toContain("LATERAL (");
    expect(sql).toContain(")");
  });

  it("produces LATERAL queries with alias", () => {
    const sub = users.project(users.get("id"));
    const lat = sub.lateral("t");
    const sql = new Visitors.PostgreSQL().compile(lat);
    expect(sql).toContain("LATERAL (");
    expect(sql).toContain('"t"');
  });

  describe("Nodes::DoesNotMatch", () => {
    it("should know how to visit case sensitive", () => {
      const node = users.get("name").doesNotMatch("foo%", true);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("NOT LIKE");
    });
  });

  describe("Nodes::NotRegexp", () => {
    it("can handle case insensitive", () => {
      const node = users.get("name").doesNotMatchRegexp("foo%");
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("!~");
    });
  });

  describe("Nodes::BindParam", () => {
    it("increments each bind param", () => {
      const visitor = new Visitors.PostgreSQLWithBinds();
      const a = users.get("id").eq(new Nodes.BindParam());
      const b = users.get("name").eq(new Nodes.BindParam());
      const sql = visitor.compile(new Nodes.And([a, b]));
      expect(sql).toContain("$1");
      expect(sql).toContain("$2");
    });
  });

  describe("Nodes::RollUp", () => {
    it("should know how to visit with array arguments", () => {
      const node = users.get("id").in([1, 2, 3]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("IN (1, 2, 3)");
    });

    it("should know how to visit with CubeDimension Argument", () => {
      const mgr = users.project(star).group(new Nodes.Cube([users.get("id")]));
      const sql = new Visitors.PostgreSQL().compile(mgr.ast);
      expect(sql).toContain("CUBE(");
    });

    it("should know how to generate parenthesis when supplied with many Dimensions", () => {
      const mgr = users.project(star).group(new Nodes.Cube([users.get("id"), users.get("name")]));
      const sql = new Visitors.PostgreSQL().compile(mgr.ast);
      expect(sql).toContain('CUBE("users"."id", "users"."name")');
    });
  });

  describe("Nodes::IsNotDistinctFrom", () => {
    it("should handle nil", () => {
      const node = users.get("name").isNotDistinctFrom(null);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("IS NOT DISTINCT FROM");
    });
  });

  describe("Nodes::IsDistinctFrom", () => {
    it("should handle column names on both sides", () => {
      const node = users.get("id").isDistinctFrom(posts.get("user_id"));
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("IS DISTINCT FROM");
    });
  });

  describe("Nodes::InfixOperation", () => {
    it("should handle Contains", () => {
      const visitor = new Visitors.ToSql();
      const products = new Table("products");
      const node = products.get("metadata").contains('{"foo":"bar"}');
      expect(visitor.compile(node)).toBe(`"products"."metadata" @> '{"foo":"bar"}'`);
    });

    it("should handle Overlaps", () => {
      const visitor = new Visitors.ToSql();
      const products = new Table("products");
      const node = products.get("tags").overlaps("{foo,bar,baz}");
      expect(visitor.compile(node)).toBe(`"products"."tags" && '{foo,bar,baz}'`);
    });
  });
});
