import { describe, it, expect } from "vitest";
import { testConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors } from "../index.js";

describe("Arel::Nodes::OverTest", () => {
  const users = new Table("users");
  describe("as", () => {
    it("should alias the expression", () => {
      const over = users.get("id").count().over().as("foo");
      expect(new Visitors.ToSql(testConnection).compile(over)).toBe(
        'COUNT("users"."id") OVER () AS foo',
      );
    });
  });

  describe("with SQL literal", () => {
    it("should reference the window definition by name", () => {
      const over = users.get("id").count().over(new Nodes.SqlLiteral("foo"));
      expect(new Visitors.ToSql(testConnection).compile(over)).toBe('COUNT("users"."id") OVER foo');
    });
  });

  describe("with no expression", () => {
    it("should use empty definition", () => {
      const fn = new Nodes.NamedFunction("ROW_NUMBER", []);
      const over = new Nodes.Over(fn);
      const visitor = new Visitors.ToSql(testConnection);
      expect(visitor.compile(over)).toBe("ROW_NUMBER() OVER ()");
    });
  });

  describe("with expression", () => {
    it("should use definition in sub-expression", () => {
      const fn = new Nodes.NamedFunction("SUM", [users.get("amount")]);
      const w = new Nodes.Window();
      w.partition(users.get("department_id"));
      const over = new Nodes.Over(fn, w);
      const visitor = new Visitors.ToSql(testConnection);
      const result = visitor.compile(over);
      expect(result).toContain("SUM");
      expect(result).toContain("PARTITION BY");
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const a = users.get("id").eq(1);
      const b = users.get("id").eq(1);
      expect((a.left as Nodes.Attribute).name).toBe((b.left as Nodes.Attribute).name);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.And([users.get("id").eq(1)]);
      const b = new Nodes.And([users.get("id").eq(2)]);
      expect(a).not.toBe(b);
    });
  });

  describe("with literal", () => {
    it("should reference the window definition by name", () => {
      const sql = new Visitors.ToSql(testConnection).compile(users.get("id").count().over("foo"));
      expect(sql).toBe('COUNT("users"."id") OVER "foo"');
    });
  });
});
