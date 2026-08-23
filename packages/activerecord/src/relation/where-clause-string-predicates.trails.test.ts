/**
 * WhereClause's String predicate arms (where_clause.rb:160, 167, 190, 203).
 *
 * Rails stores a bare String predicate — `build_where_clause`'s sanitize_sql
 * arm is `parts = [model.sanitize_sql(...)]` (query_methods.rb:1627) — and
 * WhereClause handles the String downstream. Ruby gets these arms for free
 * because SqlLiteral subclasses String; TypeScript needs them spelled out, so
 * they are covered here rather than in the Rails-mirrored file.
 */
import { describe, it, expect } from "vitest";
import { Table, Nodes } from "@blazetrails/arel";
import { WhereClause } from "./where-clause.js";

function table(): Table {
  return new Table("table");
}

describe("WhereClause String predicates (trails)", () => {
  it("wraps a String predicate in a Grouping around a SqlLiteral", () => {
    const ast = new WhereClause(["id = 1"]).ast;
    expect(ast).toBeInstanceOf(Nodes.Grouping);
    expect((ast as Nodes.Grouping).expr).toBeInstanceOf(Nodes.SqlLiteral);
  });

  it("inverts a String predicate into NOT of its SqlLiteral", () => {
    const inverted = new WhereClause(["id = 1"]).invert().predicates;
    expect(inverted).toHaveLength(1);
    const node = inverted[0] as Nodes.Not;
    expect(node).toBeInstanceOf(Nodes.Not);
    expect(node.expr).toBeInstanceOf(Nodes.SqlLiteral);
  });

  it("compares a String predicate equal to a SqlLiteral carrying the same SQL", () => {
    const asString = new WhereClause(["id = 1"]);
    const asLiteral = new WhereClause([new Nodes.SqlLiteral("id = 1")]);
    expect(asString.equals(asLiteral)).toBe(true);
    expect(asString.minus(asLiteral).isEmpty()).toBe(true);
    expect(asString.union(asLiteral).predicates).toHaveLength(1);
  });

  it("does not treat a String predicate as an equality node", () => {
    const clause = new WhereClause([table().get("id").eq(1), "id = 1"]);
    expect(Object.keys(clause.toH())).toEqual(["id"]);
  });
});
