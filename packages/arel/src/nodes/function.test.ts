import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";
import { SqlLiteral } from "./sql-literal.js";

describe("Arel::Nodes::FunctionTest", () => {
  describe("alias= setter wraps strings in SqlLiteral", () => {
    it("wraps a string via the setter", () => {
      const fn = new Nodes.NamedFunction("COUNT", []);
      fn.alias = "total";
      expect(fn.alias).toBeInstanceOf(Nodes.SqlLiteral);
      expect((fn.alias as Nodes.SqlLiteral).value).toBe("total");
    });

    it("accepts a Node directly", () => {
      const fn = new Nodes.NamedFunction("COUNT", []);
      const lit = new Nodes.SqlLiteral("total");
      fn.alias = lit;
      expect(fn.alias).toBe(lit);
    });

    it("accepts null", () => {
      const fn = new Nodes.NamedFunction("COUNT", []);
      fn.alias = null;
      expect(fn.alias).toBeNull();
    });
  });
});

describe("Arel::Nodes::RollUpTest", () => {
  it("RollUp is the canonical class name", () => {
    expect(Nodes.RollUp).toBeDefined();
    expect(new Nodes.RollUp([]) instanceof Nodes.RollUp).toBe(true);
  });

  it("Rollup is a deprecated alias for RollUp", () => {
    expect(Nodes.Rollup).toBe(Nodes.RollUp);
  });
});

describe("Arel::Nodes::WithTest", () => {
  it("children getter returns expr slot", () => {
    const users = new Table("users");
    const cte = new Nodes.Cte("t", users.project(new SqlLiteral("1")).ast);
    const w = new Nodes.With([cte]);
    expect(w.children).toStrictEqual([cte]);
    expect((w as { expr: unknown }).expr).toBe(w.children);
  });
});

describe("Arel::Nodes::ExistsTest", () => {
  const users = new Table("users");

  it("is a Function subclass", () => {
    const inner = users.project(users.get("id")).ast;
    const node = new Nodes.Exists(inner);
    expect(node).toBeInstanceOf(Nodes.Function);
  });

  it("wraps expression in array", () => {
    const inner = users.project(users.get("id")).ast;
    const node = new Nodes.Exists(inner);
    expect(Array.isArray(node.expressions)).toBe(true);
    expect(node.expressions[0]).toBe(inner);
  });

  it("renders EXISTS(subquery) correctly", () => {
    const inner = users.project(users.get("id")).ast;
    const node = new Nodes.Exists(inner);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe('EXISTS (SELECT "users"."id" FROM "users")');
  });
});
