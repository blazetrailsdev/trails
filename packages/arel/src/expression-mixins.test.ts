import { describe, it, expect } from "vitest";
import { Nodes, Visitors } from "./index.js";

const compile = (n: Nodes.Node): string => new Visitors.ToSql().compile(n);

// Behavior tests for the mixin surface added in this PR — Expressions,
// AliasPredication, OrderPredications, FilterPredications,
// WindowPredications, and the trailing Predications methods (when, concat,
// contains, overlaps, quotedArray). Verifies the methods are reachable on
// the right hosts AND build the AST shape Rails would.
//
// Receivers are SqlLiteral / Function / InfixOperation rather than
// Attribute, because Attribute pre-dates this PR and ships hand-rolled
// versions of count/sum/concat/contains/overlaps that return different
// node types (NamedFunction, generic InfixOperation). Aligning Attribute
// with Rails' Predications semantics is a separate refactor.

describe("Expressions mixin (on SqlLiteral)", () => {
  const lit = new Nodes.SqlLiteral("col");

  it("count/sum/maximum/minimum/average build the typed aggregate subclasses", () => {
    expect(lit.count()).toBeInstanceOf(Nodes.Count);
    expect(lit.sum()).toBeInstanceOf(Nodes.Sum);
    expect(lit.maximum()).toBeInstanceOf(Nodes.Max);
    expect(lit.minimum()).toBeInstanceOf(Nodes.Min);
    expect(lit.average()).toBeInstanceOf(Nodes.Avg);
  });

  it("count(true) emits COUNT(DISTINCT ...)", () => {
    expect(compile(lit.count())).toBe("COUNT(col)");
    expect(compile(lit.count(true))).toBe("COUNT(DISTINCT col)");
  });

  it("sum/max/min/avg compile to the expected SQL function call", () => {
    expect(compile(lit.sum())).toBe("SUM(col)");
    expect(compile(lit.maximum())).toBe("MAX(col)");
    expect(compile(lit.minimum())).toBe("MIN(col)");
    expect(compile(lit.average())).toBe("AVG(col)");
  });

  it("extract compiles to EXTRACT(field FROM expr)", () => {
    const e = lit.extract("year");
    expect(e).toBeInstanceOf(Nodes.Extract);
    expect(compile(e)).toBe("EXTRACT(YEAR FROM col)");
  });
});

describe("AliasPredication mixin", () => {
  it("on SqlLiteral wraps the receiver in an As node", () => {
    const aliased = new Nodes.SqlLiteral("MAX(x)").as("m");
    expect(aliased).toBeInstanceOf(Nodes.As);
  });

  it("on Function sets the alias and returns self (Rails Function#as)", () => {
    const sum = new Nodes.SqlLiteral("col").sum();
    const aliased = sum.as("total");
    expect(aliased).toBe(sum);
    expect(compile(aliased)).toBe("SUM(col) AS total");
  });
});

describe("OrderPredications mixin (on SqlLiteral)", () => {
  it("asc/desc wrap in Ascending / Descending", () => {
    const lit = new Nodes.SqlLiteral("col");
    expect(lit.asc()).toBeInstanceOf(Nodes.Ascending);
    expect(lit.desc()).toBeInstanceOf(Nodes.Descending);
  });
});

describe("WindowPredications.over (mixed into Function)", () => {
  const sum = new Nodes.SqlLiteral("col").sum();

  it("with no argument compiles to OVER ()", () => {
    expect(compile(sum.over())).toBe("SUM(col) OVER ()");
  });

  it("with a string emits OVER <name> as a raw SQL fragment", () => {
    // A bare string window name must render as SQL (`OVER w`), not as a
    // quoted value (`OVER 'w'`) — the latter is invalid SQL.
    expect(compile(sum.over("w"))).toBe("SUM(col) OVER w");
  });

  it("NamedFunction#over with a NamedWindow doubles embedded quotes in the name", () => {
    // Embedded `"` characters in a window name must be doubled when quoting
    // the identifier so they do not terminate it early.
    const fn = new Nodes.NamedFunction("MY_FN", [new Nodes.SqlLiteral("x")]);
    const win = new Nodes.NamedWindow('weird"name');
    expect(compile(fn.over(win))).toBe('MY_FN(x) OVER "weird""name"');
  });
});

describe("FilterPredications.filter (mixed into Function)", () => {
  it("wraps in a Filter node carrying the predicate", () => {
    const sum = new Nodes.SqlLiteral("col").sum();
    const f = sum.filter(new Nodes.SqlLiteral("active"));
    expect(f).toBeInstanceOf(Nodes.Filter);
  });
});

describe("Predications trailing methods on SqlLiteral", () => {
  const lit = new Nodes.SqlLiteral("col");

  it("when opens a Case", () => {
    expect(lit.when("active")).toBeInstanceOf(Nodes.Case);
  });

  it("concat builds a Concat infix node (Rails: ||)", () => {
    const c = lit.concat(new Nodes.SqlLiteral("other"));
    expect(c).toBeInstanceOf(Nodes.Concat);
  });

  it("contains / overlaps build the @> / && infix nodes", () => {
    const arr = new Nodes.SqlLiteral("ARRAY[1,2]");
    expect(lit.contains(arr)).toBeInstanceOf(Nodes.Contains);
    expect(lit.overlaps(arr)).toBeInstanceOf(Nodes.Overlaps);
  });

  it("quotedArray maps each element through quotedNode", () => {
    const out = lit.quotedArray([1, "x"]);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBe(2);
    expect(out[0]).toBeInstanceOf(Nodes.Node);
  });
});
