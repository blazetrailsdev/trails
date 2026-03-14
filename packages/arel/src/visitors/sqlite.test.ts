import { describe, it, expect } from "vitest";
import { Table, star, Nodes, Visitors } from "../index.js";

describe("SqliteTest", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  it("should handle nil", () => {
    const visitor = new Visitors.ToSql();
    const node = users.get("name").eq(null);
    expect(visitor.compile(node)).toBe('"users"."name" IS NULL');
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

  it("should construct a valid generic SQL statement", () => {
    const mgr = users.project(users.get("id"));
    const sql = new Visitors.SQLite().compile(mgr.ast);
    expect(sql).toContain("SELECT");
    expect(sql).toContain("FROM");
  });

  it("should handle column names on both sides", () => {
    const node = users.get("id").eq(posts.get("user_id"));
    const sql = new Visitors.SQLite().compile(node);
    expect(sql).toBe('"users"."id" = "posts"."user_id"');
  });
});
