import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("postgres", () => {
    it("should know how to visit", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").in([1, 2, 3]);
      expect(visitor.compile(node)).toContain("IN");
    });

    it("should escape LIMIT", () => {
      const mgr = users.project(star).take(10);
      expect(mgr.toSql()).toContain("LIMIT 10");
    });

    it("should handle nil", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("name").eq(null);
      expect(visitor.compile(node)).toBe('"users"."name" IS NULL');
    });

    it("can handle subqueries", () => {
      const subquery = users.project(users.get("id"));
      const node = users.get("id").in(subquery);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("SELECT");
    });

    it("can handle ESCAPE", () => {
      const node = users.get("name").matches("foo%", true, "\\");
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("LIKE");
    });

    it.todo("defaults to FOR UPDATE", () => {});
    it.todo("allows a custom string to be used as a lock", () => {});
    it.todo("should support DISTINCT ON", () => {});
    it.todo("should support DISTINCT", () => {});
    it.todo("encloses LATERAL queries in parens", () => {});
    it.todo("produces LATERAL queries with alias", () => {});
    it.todo("should know how to visit case sensitive", () => {});
    it.todo("can handle case insensitive", () => {});
    it.todo("increments each bind param", () => {});
    it.todo("should know how to visit with array arguments", () => {});
    it.todo("should know how to visit with CubeDimension Argument", () => {});
    it.todo("should know how to generate parenthesis when supplied with many Dimensions", () => {});
    it.todo("should construct a valid generic SQL statement", () => {});
    it.todo("should handle column names on both sides", () => {});
    it.todo("should handle Contains", () => {});
    it.todo("should handle Overlaps", () => {});
  });
});
