import { describe, it, expect } from "vitest";
import { Table, SelectManager, Nodes } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("as", () => {
    it("makes an AS node", () => {
      const node = users.get("name").as("n");
      expect(node).toBeInstanceOf(Nodes.As);
    });

    it("converts right to SqlLiteral if a string", () => {
      const mgr = new SelectManager();
      mgr.from("raw_table");
      const sql = mgr.toSql();
      expect(sql).toContain("raw_table");
    });

    it("is equal with equal ivars", () => {
      const a = new Nodes.Not(users.get("id").eq(1));
      const b = new Nodes.Not(users.get("id").eq(1));
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.Extract(users.get("created_at"), "YEAR");
      const b = new Nodes.Extract(users.get("created_at"), "MONTH");
      expect(a.field).not.toBe(b.field);
    });

    it("returns a Cte node using the LHS's name and the RHS as the relation", () => {
      const selectAst = users.project(users.get("id")).ast;
      const asNode = new Nodes.As(selectAst, new Nodes.SqlLiteral("cte_name"));
      const cte = asNode.toCte();
      expect(cte).toBeInstanceOf(Nodes.Cte);
      expect((cte as Nodes.Cte).name).toBe("cte_name");
    });
  });
});
