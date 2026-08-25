import { describe, it, expect } from "vitest";
import { testConnection } from "../test-helpers/connection.js";
import { Table, star, Nodes, Visitors } from "../index.js";

describe("SQLite visitor boolean casting", () => {
  const users = new Table("users");

  it("does not support boolean", () => {
    const visitor = new Visitors.SQLite(testConnection);
    // `eq` wraps the raw `true` via quotedNode into a Casted node, which is
    // how a boolean reaches the visitor; a raw `true` placed straight into
    // Equality raises UnsupportedVisitError, as it does in Rails.
    expect(visitor.compile(users.get("active").eq(true))).toBe('"users"."active" = 1');
  });
});

describe("SQLite visitor set operations", () => {
  const users = new Table("users");

  // SQLite rejects parens around SELECT operands of UNION/INTERSECT/EXCEPT.
  // Mirrors `sqlite.rb#infix_value_with_paren` — strip Grouping wrappers.
  const q1 = () => users.project(star());
  const q2 = () => users.project(star());

  it("UNION strips Grouping wrapped operands", () => {
    const node = new Nodes.Union(new Nodes.Grouping(q1().ast), new Nodes.Grouping(q2().ast));
    const sql = new Visitors.SQLite(testConnection).compile(node);
    expect(sql).not.toContain("((");
    expect(sql).toContain("UNION");
    expect(sql).toBe('( SELECT * FROM "users" UNION SELECT * FROM "users" )');
  });

  it("UNION ALL strips Grouping wrapped operands", () => {
    const node = new Nodes.UnionAll(new Nodes.Grouping(q1().ast), new Nodes.Grouping(q2().ast));
    const sql = new Visitors.SQLite(testConnection).compile(node);
    expect(sql).toBe('( SELECT * FROM "users" UNION ALL SELECT * FROM "users" )');
  });

  it("INTERSECT strips Grouping wrapped operands", () => {
    const node = new Nodes.Intersect(new Nodes.Grouping(q1().ast), new Nodes.Grouping(q2().ast));
    const sql = new Visitors.SQLite(testConnection).compile(node);
    expect(sql).toBe('( (SELECT * FROM "users") INTERSECT (SELECT * FROM "users") )');
  });

  it("EXCEPT strips Grouping wrapped operands", () => {
    const node = new Nodes.Except(new Nodes.Grouping(q1().ast), new Nodes.Grouping(q2().ast));
    const sql = new Visitors.SQLite(testConnection).compile(node);
    expect(sql).toBe('( (SELECT * FROM "users") EXCEPT (SELECT * FROM "users") )');
  });

  it("UNION without Grouping operands renders bare SELECTs", () => {
    const node = new Nodes.Union(q1().ast, q2().ast);
    const sql = new Visitors.SQLite(testConnection).compile(node);
    expect(sql).toBe('( SELECT * FROM "users" UNION SELECT * FROM "users" )');
  });

  it("nested unions are flattened (Rails-style)", () => {
    const q3 = users.project(star());
    const node = new Nodes.Union(q1().ast, new Nodes.Union(q2().ast, q3.ast));
    const sql = new Visitors.SQLite(testConnection).compile(node);
    expect(sql).toBe(
      '( SELECT * FROM "users" UNION SELECT * FROM "users" UNION SELECT * FROM "users" )',
    );
  });

  it("union via SelectManager omits inner parens", () => {
    const sql = new Visitors.SQLite(testConnection).compile(q1().union(q2()));
    expect(sql).not.toContain("((");
    expect(sql).toContain("UNION");
  });
});
