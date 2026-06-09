import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "./index.js";

describe("PredicationsMixin", () => {
  const users = new Table("users");

  describe("on InfixOperation (Math chain)", () => {
    it("Division#subtract chains via the Math mixin", () => {
      // arel-24: users[:age] / 3 - users[:other]
      const expr = users.get("age").divide(3).subtract(users.get("other"));
      const sql = new Visitors.ToSql().compile(expr);
      expect(sql).toBe('("users"."age" / 3 - "users"."other")');
    });

    it("BitwiseAnd#gt produces a GROUP BY / HAVING-style comparison", () => {
      // arel-25: (users[:bitmap] & 16).gt(0)
      const expr = users.get("bitmap").bitwiseAnd(16).gt(0);
      const sql = new Visitors.ToSql().compile(expr);
      expect(sql).toBe('("users"."bitmap" & 16) > 0');
    });

    it("BitwiseShiftLeft#gt chains through Predications", () => {
      // arel-28: (users[:bitmap] << 1).gt(0)
      const expr = users.get("bitmap").bitwiseShiftLeft(1).gt(0);
      const sql = new Visitors.ToSql().compile(expr);
      expect(sql).toBe('("users"."bitmap" << 1) > 0');
    });
  });

  describe("on UnaryOperation (via NodeExpression mixin)", () => {
    it("BitwiseNot#gt produces a predicate", () => {
      // arel-30: (~users[:bitmap]).gt(0)
      const expr = new Nodes.BitwiseNot(users.get("bitmap")).gt(0);
      const sql = new Visitors.ToSql().compile(expr);
      expect(sql).toBe(' ~ "users"."bitmap" > 0');
    });

    it("BitwiseNot#eq produces an equality predicate", () => {
      const expr = new Nodes.BitwiseNot(users.get("flags")).eq(0);
      const sql = new Visitors.ToSql().compile(expr);
      expect(sql).toBe(' ~ "users"."flags" = 0');
    });
  });

  describe("edge cases (via the mixin, not Attribute's inline predications)", () => {
    const bn = new Nodes.BitwiseNot(users.get("flags"));

    it("eqAny([]) does not crash and renders as NULL (Rails 3-valued logic)", () => {
      // Rails' `Or.inject` on [] returns nil and the visitor renders
      // NULL — we preserve that, since NULL is not the same as FALSE
      // under SQL three-valued logic.
      const sql = new Visitors.ToSql().compile(bn.eqAny([]));
      expect(sql).toBe("(NULL)");
    });

    it("eqAll([]) does not crash and renders as an empty grouped AND", () => {
      // Matches Attribute#groupedAll: an empty And inside a Grouping
      // visits to `()`, the same as Rails' empty-And rendering.
      const sql = new Visitors.ToSql().compile(bn.eqAll([]));
      expect(sql).toBe("()");
    });

    it("in(scalar) wraps the scalar (Rails quoted_node fallthrough)", () => {
      const sql = new Visitors.ToSql().compile(bn.in(7));
      expect(sql).toBe(' ~ "users"."flags" IN (7)');
    });
  });

  describe("on NamedFunction (via Function → NodeExpression mixin)", () => {
    it("count().gt(n) produces HAVING-ready comparison", () => {
      // arel-47: photos[:id].count.gt(5)
      const expr = users.get("id").count().gt(5);
      const sql = new Visitors.ToSql().compile(expr);
      expect(sql).toBe('COUNT("users"."id") > 5');
    });

    it("NamedFunction#in accepts a value list", () => {
      const fn = new Nodes.NamedFunction("LOWER", [users.get("name")]);
      const sql = new Visitors.ToSql().compile(fn.in(["a", "b"]));
      expect(sql).toBe("LOWER(\"users\".\"name\") IN ('a', 'b')");
    });
  });
});
