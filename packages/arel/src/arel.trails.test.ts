import { describe, it, expect } from "vitest";
import { sql, Nodes, Visitors } from "./index.js";
import { testConnection } from "./test-helpers/connection.js";

describe("Arel.sql", () => {
  const compile = (node: Nodes.Node): string => new Visitors.ToSql(testConnection).compile(node);

  it("builds a SqlLiteral with no binds", () => {
    const literal = sql("id = 1");
    expect(literal).toBeInstanceOf(Nodes.SqlLiteral);
    expect(literal.retryable).toBe(false);
  });

  it("keeps the retryable kwarg out of the named binds", () => {
    const literal = sql("id = 1", { retryable: true });
    expect(literal).toBeInstanceOf(Nodes.SqlLiteral);
    expect(literal.retryable).toBe(true);
  });

  it("builds a BoundSqlLiteral from positional binds", () => {
    const literal = sql("id = ?", 1);
    expect(literal).toBeInstanceOf(Nodes.BoundSqlLiteral);
    expect(compile(literal as Nodes.Node)).toBe("id = ?");
  });

  it("builds a BoundSqlLiteral from named binds", () => {
    const literal = sql("id = :id", { id: 1 });
    expect(literal).toBeInstanceOf(Nodes.BoundSqlLiteral);
    expect(compile(literal as Nodes.Node)).toBe("id = ?");
  });
});
