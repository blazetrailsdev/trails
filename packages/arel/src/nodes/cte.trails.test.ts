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
      new Table("bar").project(new Nodes.SqlLiteral("*")),
    );
    const sql = new Visitors.ToSql(testConnection).compile(cte.toTable());
    expect(sql).toBe("expr1");
  });

  it("quotes a plain-string name as an identifier", () => {
    const cte = new Nodes.Cte("expr1", new Table("bar").project(new Nodes.SqlLiteral("*")));
    const sql = new Visitors.ToSql(testConnection).compile(cte.toTable());
    expect(sql).toBe('"expr1"');
  });
});

// TS-only: Ruby gets this for free from `alias :name :left` (cte.rb:6-7) and
// `alias :relation :left` / `alias :name :right` (table_alias.rb:6-7) — one
// ivar per pair, so `Binary#eql` (binary.rb:19-27) sees a write through either
// spelling.
describe("Cte / TableAlias alias the Binary slots", () => {
  it("Cte#name and #relation are the left/right slots", () => {
    const relation = new Table("bar").project(new Nodes.SqlLiteral("*"));
    const cte = new Nodes.Cte("foo", relation);
    expect(cte.left).toBe("foo");
    expect(cte.right).toBe(relation);

    cte.left = "renamed";
    expect(cte.name).toBe("renamed");
    cte.name = "again";
    expect(cte.left).toBe("again");

    const other = new Nodes.Cte("again", relation);
    expect(cte.eql(other)).toBe(true);
  });

  it("TableAlias#relation and #name are the left/right slots", () => {
    const relation = new Table("users");
    const tableAlias = new Nodes.TableAlias(relation, "u1");
    expect(tableAlias.left).toBe(relation);
    expect(tableAlias.right).toBe("u1");

    tableAlias.right = "u2";
    expect(tableAlias.name).toBe("u2");
    expect(tableAlias.tableAlias).toBe("u2");
    tableAlias.name = "u3";
    expect(tableAlias.right).toBe("u3");

    expect(tableAlias.eql(new Nodes.TableAlias(relation, "u3"))).toBe(true);
  });
});
