import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("filter", () => {
    it("should add filter to expression", () => {
      const count = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
      const filter = new Nodes.Filter(count, users.get("active").eq(true));
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(filter)).toBe('COUNT(*) FILTER (WHERE "users"."active" = TRUE)');
    });

    it("should alias the expression", () => {
      const count = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
      const filter = new Nodes.Filter(count, users.get("active").eq(true));
      const aliased = filter.as("active_count");
      expect(aliased).toBeInstanceOf(Nodes.As);
    });

    it("should reference the window definition by name", () => {
      const fn = new Nodes.NamedFunction("ROW_NUMBER", []);
      const w = new Nodes.Window();
      w.order(users.get("id").asc());
      const over = new Nodes.Over(fn, w);
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(over);
      expect(result).toContain("OVER");
      expect(result).toContain("ORDER BY");
    });
  });
});
