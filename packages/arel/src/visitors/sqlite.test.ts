import { describe, it, expect } from "vitest";
import { Table, star, Nodes, Visitors } from "../index.js";

describe("SqliteTest", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  describe("Nodes::IsDistinctFrom", () => {
    it("should handle nil", () => {
      const node = users.get("name").isDistinctFrom(null);
      const sql = new Visitors.SQLite().compile(node);
      expect(sql).toContain("IS DISTINCT FROM");
    });
  });

  it("defaults limit to -1", () => {
    const mgr = users.project(star).skip(5);
    const sql = new Visitors.SQLite().compile(mgr.ast);
    expect(sql).toContain("LIMIT -1");
    expect(sql).toContain("OFFSET 5");
  });

  it("does not support locking", () => {
    const mgr = users.project(star).lock();
    const sql = new Visitors.SQLite().compile(mgr.ast);
    expect(sql).not.toContain("FOR UPDATE");
  });

  it("does not support boolean", () => {
    const visitor = new Visitors.SQLite();
    expect(visitor.compile(new Nodes.True())).toBe("1");
    expect(visitor.compile(new Nodes.False())).toBe("0");
    expect(visitor.compile(users.get("active").eq(true))).toBe('"users"."active" = 1');
    expect(visitor.compile(new Nodes.Equality(users.get("active"), true))).toBe(
      '"users"."active" = 1',
    );
  });

  describe("Nodes::IsNotDistinctFrom", () => {
    it("should handle column names on both sides", () => {
      const node = users.get("id").isNotDistinctFrom(posts.get("user_id"));
      const sql = new Visitors.SQLite().compile(node);
      expect(sql).toContain("IS NOT DISTINCT FROM");
      expect(sql).toContain('"users"."id"');
      expect(sql).toContain('"posts"."user_id"');
    });

    it("should handle nil", () => {
      const node = users.get("name").isNotDistinctFrom(null);
      const sql = new Visitors.SQLite().compile(node);
      expect(sql).toContain("IS NOT DISTINCT FROM");
      expect(sql).toContain('"users"."name"');
      expect(sql).toContain("NULL");
    });

    it("should construct a valid generic SQL statement", () => {
      const node = users.get("name").isNotDistinctFrom(new Nodes.Quoted(1));
      const sql = new Visitors.SQLite().compile(node);
      expect(sql).toBeDefined();
    });
  });

  describe("Nodes::IsDistinctFrom", () => {
    it("should handle column names on both sides", () => {
      const node = users.get("id").isDistinctFrom(posts.get("user_id"));
      const sql = new Visitors.SQLite().compile(node);
      expect(sql).toContain('"users"."id"');
      expect(sql).toContain('"posts"."user_id"');
    });
  });
});
