import { describe, it, expect } from "vitest";
import { Table, star, Nodes, Visitors } from "../index.js";

describe("SqliteTest", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  describe("Nodes::IsDistinctFrom", () => {
    it("should handle nil", () => {
      const node = users.get("name").isDistinctFrom(null);
      const sql = new Visitors.SQLite().compile(node);
      // SQLite has no IS DISTINCT FROM; it uses IS NOT for null-aware !=.
      expect(sql).toBe('"users"."name" IS NOT NULL');
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
      // SQLite uses IS for null-aware equality (no IS NOT DISTINCT FROM).
      expect(sql).toBe('"users"."id" IS "posts"."user_id"');
    });

    it("should handle nil", () => {
      const node = users.get("name").isNotDistinctFrom(null);
      const sql = new Visitors.SQLite().compile(node);
      expect(sql).toBe('"users"."name" IS NULL');
    });

    it("should construct a valid generic SQL statement", () => {
      const node = users.get("name").isNotDistinctFrom(new Nodes.Quoted(1));
      const sql = new Visitors.SQLite().compile(node);
      expect(sql).toBe('"users"."name" IS 1');
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

  describe("set operations", () => {
    // SQLite rejects parens around SELECT operands of UNION/INTERSECT/EXCEPT.
    // Mirrors `sqlite.rb#infix_value_with_paren` — strip Grouping wrappers.
    const q1 = () => users.project(star);
    const q2 = () => users.project(star);

    it("UNION strips Grouping wrapped operands", () => {
      const node = new Nodes.Union(new Nodes.Grouping(q1().ast), new Nodes.Grouping(q2().ast));
      const sql = new Visitors.SQLite().compile(node);
      expect(sql).not.toContain("((");
      expect(sql).toContain("UNION");
      expect(sql).toBe('(SELECT * FROM "users" UNION SELECT * FROM "users")');
    });

    it("UNION ALL strips Grouping wrapped operands", () => {
      const node = new Nodes.UnionAll(new Nodes.Grouping(q1().ast), new Nodes.Grouping(q2().ast));
      const sql = new Visitors.SQLite().compile(node);
      expect(sql).toBe('(SELECT * FROM "users" UNION ALL SELECT * FROM "users")');
    });

    it("INTERSECT strips Grouping wrapped operands", () => {
      const node = new Nodes.Intersect(new Nodes.Grouping(q1().ast), new Nodes.Grouping(q2().ast));
      const sql = new Visitors.SQLite().compile(node);
      expect(sql).toBe('(SELECT * FROM "users" INTERSECT SELECT * FROM "users")');
    });

    it("EXCEPT strips Grouping wrapped operands", () => {
      const node = new Nodes.Except(new Nodes.Grouping(q1().ast), new Nodes.Grouping(q2().ast));
      const sql = new Visitors.SQLite().compile(node);
      expect(sql).toBe('(SELECT * FROM "users" EXCEPT SELECT * FROM "users")');
    });

    it("UNION without Grouping operands renders bare SELECTs", () => {
      const node = new Nodes.Union(q1().ast, q2().ast);
      const sql = new Visitors.SQLite().compile(node);
      expect(sql).toBe('(SELECT * FROM "users" UNION SELECT * FROM "users")');
    });

    it("union via SelectManager omits inner parens", () => {
      const sql = new Visitors.SQLite().compile(q1().union(q2()));
      expect(sql).not.toContain("((");
      expect(sql).toContain("UNION");
    });
  });
});
