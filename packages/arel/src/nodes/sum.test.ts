import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";

describe("Arel::Nodes::SumTest", () => {
  const users = new Table("users");
  describe("as", () => {
    it("should alias the sum", () => {
      const sum = users.get("age").sum();
      const aliased = sum.as("total_age");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(aliased)).toBe('SUM("users"."age") AS total_age');
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const w1 = new Nodes.Window();
      const w2 = new Nodes.Window();
      expect(w1.orders.length).toBe(w2.orders.length);
      expect(w1.partitions.length).toBe(w2.partitions.length);
    });

    it("is not equal with different ivars", () => {
      const s1 = new Nodes.NamedFunction("SUM", [users.get("id")]);
      const s2 = new Nodes.NamedFunction("SUM", [users.get("name")]);
      expect(s1.expressions[0]).not.toBe(s2.expressions[0]);
    });
  });

  it("should order the sum via sql", () => {
    const sum = users.get("age").sum();
    expect(users.project(sum).order(users.get("name").asc()).toSql()).toContain("ORDER BY");
  });

  describe("order", () => {
    it("should order the sum", () => {
      const win = new Nodes.Window().order(users.get("name").asc());
      const sumOver = users.get("age").sum().over(win);
      const sql = users.project(sumOver).toSql();
      expect(sql).toContain("OVER");
      expect(sql).toContain("ORDER BY");
    });
  });
});
