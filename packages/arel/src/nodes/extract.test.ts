import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";

describe("Arel::Nodes::ExtractTest", () => {
  const users = new Table("users");
  it("should extract field", () => {
    const createdAt = users.get("created_at");
    const node = new Nodes.Extract(createdAt, "YEAR");
    const visitor = new Visitors.ToSql();
    const sql = visitor.compile(node);
    expect(sql).toBe('EXTRACT(YEAR FROM "users"."created_at")');
  });

  it("uppercases a lowercase field to match Rails", () => {
    // Rails' visit_Arel_Nodes_Extract does `o.field.to_s.upcase`, so the
    // field identifier in the emitted SQL is always uppercased regardless
    // of how it was constructed.
    const createdAt = users.get("created_at");
    const node = new Nodes.Extract(createdAt, "month");
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe('EXTRACT(MONTH FROM "users"."created_at")');
  });

  // Mirrors Rails: `Expressions#extract` calls `Nodes::Extract.new [self], field`,
  // wrapping the receiver in an array (expressions.rb). The visitor renders
  // the array via `inject_join`, so a single-element array still produces
  // the same SQL as a bare expression.
  it("expressions.extract wraps the receiver in an array", () => {
    const createdAt = users.get("created_at");
    const node = createdAt.extract("year");
    expect(Array.isArray(node.expr)).toBe(true);
    expect((node.expr as Nodes.Node[])[0]).toBe(createdAt);
    expect(new Visitors.ToSql().compile(node)).toBe('EXTRACT(YEAR FROM "users"."created_at")');
  });

  describe("as", () => {
    it("should alias the extract", () => {
      const createdAt = users.get("created_at");
      const node = new Nodes.Extract(createdAt, "MONTH").as("birth_month");
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(node);
      expect(sql).toBe('EXTRACT(MONTH FROM "users"."created_at") AS birth_month');
    });

    it("should not mutate the extract", () => {
      const original = new Nodes.Extract(users.get("created_at"), "YEAR");
      const aliased = original.as("y");
      // Original should remain unchanged (aliased is a new As node)
      expect(original).toBeInstanceOf(Nodes.Extract);
      expect(aliased).toBeInstanceOf(Nodes.As);
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const a = new Nodes.TableAlias(users, "u");
      const b = new Nodes.TableAlias(users, "u");
      expect(a.name).toBe(b.name);
      expect(a.relation).toBe(b.relation);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.Not(users.get("id").eq(1));
      const b = new Nodes.Not(users.get("id").eq(2));
      expect(a).not.toBe(b);
    });
  });
});
