import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";
import { testConnection } from "../test-helpers/connection.js";

// TS-only: no Rails counterpart. Pins that a `Cte` whose name is a
// `SqlLiteral` (as produced by `TableAlias#toCte`) preserves the literal
// through `toTable()`, matching Rails' `Arel::Table.new(name)` pass-through
// (cte.rb:31-32) — the resulting table name renders bare, not quoted.
describe("Cte#toTable", () => {
  it("preserves a SqlLiteral name as a bare table name", () => {
    const cte = new Nodes.Cte(
      new Nodes.SqlLiteral("expr1"),
      new Table("bar").project(new Nodes.SqlLiteral("*")).ast,
    );
    const sql = new Visitors.ToSql(testConnection).compile(cte.toTable());
    expect(sql).toBe("expr1");
  });

  it("quotes a plain-string name as an identifier", () => {
    const cte = new Nodes.Cte("expr1", new Table("bar").project(new Nodes.SqlLiteral("*")).ast);
    const sql = new Visitors.ToSql(testConnection).compile(cte.toTable());
    expect(sql).toBe('"expr1"');
  });
});
