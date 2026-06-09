import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";

describe("FilterTest", () => {
  const users = new Table("users");
  describe("Filter", () => {
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

    describe("over", () => {
      it("should reference the window definition by name", () => {
        const count = users.get("id").count();
        const filter = new Nodes.Filter(count, users.get("income").gteq(40000));
        const window = new Nodes.Window();
        window.partition(users.get("year"));
        const over = new Nodes.Over(filter, window);
        const sql = new Visitors.ToSql().compile(over);
        expect(sql).toContain("FILTER");
        expect(sql).toContain("OVER");
        expect(sql).toContain("PARTITION BY");
      });
    });

    describe("as", () => {
      it("should alias the expression", () => {
        const count = users.get("id").count();
        const filter = new Nodes.Filter(count, users.get("income").gteq(40000));
        const aliased = filter.as("rich_users_count");
        const sql = new Visitors.ToSql().compile(aliased);
        expect(sql).toContain("FILTER");
        expect(sql).toContain("AS rich_users_count");
      });
    });
  });
});
