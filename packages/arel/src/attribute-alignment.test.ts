import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "./test-helpers/connection.js";
import { Table, Nodes, Visitors, Collectors } from "./index.js";

const users = new Table("users");
const compile = (n: Nodes.Node): string => new Visitors.ToSql(fakeRecordConnection).compile(n);

describe("Attribute aggregates return typed Function subclasses", () => {
  it("count compiles to COUNT(...) and is a Count", () => {
    const c = users.get("id").count();
    expect(c).toBeInstanceOf(Nodes.Count);
    expect(compile(c)).toBe('COUNT("users"."id")');
  });

  it("count(true) emits COUNT(DISTINCT ...)", () => {
    expect(compile(users.get("id").count(true))).toBe('COUNT(DISTINCT "users"."id")');
  });

  it("sum/maximum/minimum/average return typed subclasses", () => {
    expect(users.get("id").sum()).toBeInstanceOf(Nodes.Sum);
    expect(users.get("id").maximum()).toBeInstanceOf(Nodes.Max);
    expect(users.get("id").minimum()).toBeInstanceOf(Nodes.Min);
    expect(users.get("id").average()).toBeInstanceOf(Nodes.Avg);
  });
});

describe("Attribute concat / contains / overlaps return typed infix subclasses", () => {
  it("concat builds a Concat (SQL ||), not a CONCAT(...) function", () => {
    const c = users.get("first").concat(users.get("last"));
    expect(c).toBeInstanceOf(Nodes.Concat);
    const sql = compile(c);
    expect(sql).toBe('"users"."first" || "users"."last"');
    expect(sql).not.toContain("CONCAT(");
  });

  it("contains is a Contains (PostgreSQL @>)", () => {
    const arr = new Nodes.SqlLiteral("ARRAY[1,2]");
    const c = users.get("ids").contains(arr);
    expect(c).toBeInstanceOf(Nodes.Contains);
    expect(compile(c)).toContain("@>");
  });

  it("overlaps is an Overlaps (PostgreSQL &&)", () => {
    const arr = new Nodes.SqlLiteral("ARRAY[1,2]");
    const o = users.get("ids").overlaps(arr);
    expect(o).toBeInstanceOf(Nodes.Overlaps);
    expect(compile(o)).toContain("&&");
  });

  it("contains/overlaps route a scalar RHS through quotedNode (Casted)", () => {
    // Mirrors Rails' Predications#contains/#overlaps which call
    // `quoted_node(other)`. On Attribute that wraps the value in
    // Casted(value, this) so the visitor can apply column type-casting.
    const c = users.get("ids").contains([1, 2]);
    expect(c.right).toBeInstanceOf(Nodes.Casted);
    const o = users.get("ids").overlaps([1, 2]);
    expect(o.right).toBeInstanceOf(Nodes.Casted);
  });
});

describe("Attribute#quotedNode (the public PredicationHost contract)", () => {
  // Mirrors Rails' Arel::Predications#quoted_node — `build_quoted(other, self)`.
  // Passing the attribute means every non-pass-through value, nil included,
  // becomes Casted(value, this) and keeps the column type-cast path;
  // ActiveModel::Attribute instances become BindParam and raw Nodes pass through.
  it("wraps a scalar in Casted(value, attribute)", () => {
    const attr = users.get("id");
    const out = attr.quotedNode(42);
    expect(out).toBeInstanceOf(Nodes.Casted);
    expect((out as Nodes.Casted).value).toBe(42);
    expect((out as Nodes.Casted).attribute).toBe(attr);
  });

  it("wraps null/undefined in Casted(nil, attribute)", () => {
    for (const nil of [null, undefined]) {
      const attr = users.get("id");
      const out = attr.quotedNode(nil);
      expect(out).toBeInstanceOf(Nodes.Casted);
      expect((out as Nodes.Casted).attribute).toBe(attr);
      expect((out as Nodes.Casted).isNil()).toBe(true);
    }
  });

  it("passes through raw Nodes unchanged", () => {
    const lit = new Nodes.SqlLiteral("CURRENT_TIMESTAMP");
    expect(users.get("created_at").quotedNode(lit)).toBe(lit);
  });
});

describe("Per-class `as(name)` marks the alias SqlLiteral as retryable", () => {
  // Mirrors Arel::AliasPredication#as in Rails:
  //   Nodes::SqlLiteral.new(other, retryable: true)
  // The retryable flag tells the collector that the bare alias name
  // doesn't break parameterized-SQL retry-by-bind-cache. Without it,
  // visiting an `As(left, SqlLiteral("alias"))` would flip
  // collector.retryable to false.

  const collectorIsRetryableAfter = (n: Nodes.Node): boolean =>
    new Visitors.ToSql(fakeRecordConnection).accept(n, new Collectors.SQLString()).retryable;

  it("Attribute#as keeps the collector retryable", () => {
    expect(collectorIsRetryableAfter(users.get("id").as("aliased"))).toBe(true);
  });

  it("Binary subclass `as` (via Equality#as) keeps the collector retryable", () => {
    const eq = new Nodes.Equality(users.get("id"), new Nodes.SqlLiteral("1", { retryable: true }));
    expect(collectorIsRetryableAfter(eq.as("aliased"))).toBe(true);
  });

  it("Grouping#as keeps the collector retryable", () => {
    const g = new Nodes.Grouping(new Nodes.SqlLiteral("x", { retryable: true }));
    expect(collectorIsRetryableAfter(g.as("aliased"))).toBe(true);
  });
});
