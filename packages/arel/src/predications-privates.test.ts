import { describe, it, expect } from "vitest";
import { Table, Nodes, SelectManager } from "./index.js";
import { Predications } from "./predications.js";

// Audit follow-up: cover the Predications private helpers that mirror
// Arel::Predications' private API (grouping_any, grouping_all,
// infinity?, unboundable?, open_ended?). Trails surfaces them on the
// mixin object for Rails-fidelity / api:compare privates coverage;
// these tests pin their behavior. The three predicate helpers delegate to
// the single implementation in predications-range.ts.

const users = new Table("users");

describe("Predications.groupingAny / groupingAll", () => {
  it("groupingAny dispatches by method-id and folds with OR (Grouping)", () => {
    const out = Predications.groupingAny.call(users.attr("id"), "eq", [1, 2, 3]);
    expect(out).toBeInstanceOf(Nodes.Grouping);
    // The grouped expression is an Or chain over three Equality nodes.
    const inner = out.expr as Nodes.Or;
    expect(inner).toBeInstanceOf(Nodes.Or);
  });

  it("groupingAll dispatches by method-id and folds with AND", () => {
    const out = Predications.groupingAll.call(users.attr("id"), "gt", [1, 2]);
    expect(out).toBeInstanceOf(Nodes.Grouping);
    expect(out.expr).toBeInstanceOf(Nodes.And);
  });

  it("groupingAny accepts a closure variant (no stringly-typed dispatch)", () => {
    const attr = users.attr("id");
    const out = Predications.groupingAny.call(attr, (expr: unknown) => attr.eq(expr), [10, 20]);
    expect(out).toBeInstanceOf(Nodes.Grouping);
  });

  it("groupingAny throws a clear TypeError when the method-id isn't callable", () => {
    // Regression for the dispatch-safety concern: a typo in the
    // method-id should fail loudly, not blow up with "Cannot read
    // property 'call' of undefined".
    const attr = users.attr("id");
    expect(() => Predications.groupingAny.call(attr, "noSuchMethod", [1])).toThrowError(
      /noSuchMethod.*Attribute/,
    );
  });
});

describe("Predications.isInfinity / isUnboundable / isOpenEnded", () => {
  // A PredicationHost carrying the mixin's own isInfinity / isUnboundable, as a
  // class including Predications would — isOpenEnded dispatches through `this`.
  const host = {
    quotedNode: (v: unknown): Nodes.Node => v as Nodes.Node,
    isInfinity(this: unknown, v: unknown): 1 | -1 | 0 {
      return Predications.isInfinity.call(this as never, v);
    },
    isUnboundable(this: unknown, v: unknown): 1 | -1 | 0 {
      return Predications.isUnboundable.call(this as never, v);
    },
  };
  const isInfinity = (v: unknown) => Predications.isInfinity.call(host, v);
  const isUnboundable = (v: unknown) => Predications.isUnboundable.call(host, v);
  const isOpenEnded = (v: unknown) => Predications.isOpenEnded.call(host, v);

  it("isInfinity yields the sign for ±Infinity, 0 otherwise", () => {
    // Mirrors `Float#infinite?` returning 1 / -1 / nil — the sign is what
    // Predications#between reads to pick which side of the range collapses.
    expect(isInfinity(Infinity)).toBe(1);
    expect(isInfinity(-Infinity)).toBe(-1);
    expect(isInfinity(0)).toBe(0);
    expect(isInfinity("x")).toBe(0);
  });

  it("isInfinity duck-types a value exposing isInfinite()", () => {
    expect(isInfinity(new Nodes.Quoted(-Infinity))).toBe(-1);
    expect(isInfinity({ isInfinite: () => 1 as const })).toBe(1);
  });

  it("isInfinity reaches a Quoted through its own infinite?, not a structural unwrap", () => {
    // casted.rb:43-45 duck-types the wrapped value, so a Quoted around anything
    // answering `infinite?` (e.g. a QueryAttribute) reports the sign. predications.rb:248-250
    // is a plain dispatch — it does not know Quoted exists.
    expect(isInfinity(new Nodes.Quoted({ isInfinite: () => 1 as const }))).toBe(1);
    expect(isInfinity(new Nodes.Quoted({ isInfinite: () => -1 as const }))).toBe(-1);
    expect(isInfinity(new Nodes.Quoted(3))).toBe(0);
  });

  it("isInfinity does not unwrap Casted, which defines no infinite? in Rails", () => {
    // casted.rb:5-35 — Casted has no `infinite?`, so open_ended?(Casted(INFINITY))
    // is false in Rails and must stay false here.
    expect(isInfinity(new Nodes.Casted(Infinity, users.attr("id")))).toBe(0);
    expect(isOpenEnded(new Nodes.Casted(Infinity, users.attr("id")))).toBe(false);
  });

  it("isUnboundable duck-types the protocol and yields the sign", () => {
    expect(isUnboundable({ isUnboundable: () => 1 as const })).toBe(1);
    expect(isUnboundable({ isUnboundable: () => -1 as const })).toBe(-1);
    expect(isUnboundable({ isUnboundable: () => false as const })).toBe(0);
  });

  it("isUnboundable is 0 for values with no unboundable? — including ±Infinity", () => {
    // Float has no `unboundable?` in Ruby, so a bare ±Infinity is open-ended
    // via infinity?, NOT unboundable.
    expect(isUnboundable(Infinity)).toBe(0);
    expect(isUnboundable(undefined)).toBe(0);
    expect(isUnboundable(1)).toBe(0);
  });

  it("isOpenEnded is true for null/undefined/Infinity/unboundable, false otherwise", () => {
    expect(isOpenEnded(null)).toBe(true);
    expect(isOpenEnded(undefined)).toBe(true);
    expect(isOpenEnded(Infinity)).toBe(true);
    expect(isOpenEnded(-Infinity)).toBe(true);
    expect(isOpenEnded({ isUnboundable: () => 1 as const })).toBe(true);
    expect(isOpenEnded(0)).toBe(false);
    expect(isOpenEnded("x")).toBe(false);
  });

  it("isOpenEnded dispatches infinity?/unboundable? through `this` so host overrides win", () => {
    // predications.rb:255-257 calls both on self, so an including class that
    // overrides either is honored.
    const overridden = { ...host, isInfinity: () => 1 as const };
    expect(Predications.isOpenEnded.call(overridden, 42)).toBe(true);
    expect(Predications.isOpenEnded.call(host, 42)).toBe(false);
  });

  it("isOpenEnded dispatches Ruby's leading `value.nil?` onto the node", () => {
    // predications.rb:255-257 opens with `value.nil?`, which the node classes
    // override to report on the wrapped value (bind_param.rb:23-25,
    // casted.rb:16,41) — so a nil-wrapping bound is open-ended, and
    // between(BindParam(nil), 3) is lteq(3) rather than a Between over a nil bind.
    expect(isOpenEnded(new Nodes.BindParam(null))).toBe(true);
    expect(isOpenEnded(new Nodes.Quoted(null))).toBe(true);
    expect(isOpenEnded(new Nodes.Casted(null, users.attr("id")))).toBe(true);
    expect(isOpenEnded(new Nodes.Quoted(3))).toBe(false);
    expect(isOpenEnded(new Nodes.Casted(3, users.attr("id")))).toBe(false);
  });
});

describe("Attribute private helpers (mirror Predications)", () => {
  // The helpers are `protected` for Rails-fidelity / api:compare
  // coverage, not as a public surface. Tests cast to access them —
  // same pattern as HomogeneousIn#ivars / SelectManager#collapse.
  type AttributePrivates = Nodes.Attribute & {
    groupingAny: (methodId: string, others: unknown[]) => Nodes.Grouping;
    groupingAll: (methodId: string, others: unknown[]) => Nodes.Grouping;
    isInfinity: (value: unknown) => 1 | -1 | 0;
    isUnboundable: (value: unknown) => 1 | -1 | 0;
    isOpenEnded: (value: unknown) => boolean;
  };

  it("groupingAny / groupingAll work via method dispatch on Attribute", () => {
    const attr = users.attr("id") as AttributePrivates;
    expect(attr.groupingAny("eq", [1, 2])).toBeInstanceOf(Nodes.Grouping);
    expect(attr.groupingAll("eq", [1, 2])).toBeInstanceOf(Nodes.Grouping);
  });

  it("isInfinity / isUnboundable / isOpenEnded match Predications semantics", () => {
    const attr = users.attr("id") as AttributePrivates;
    expect(attr.isInfinity(Infinity)).toBe(1);
    expect(attr.isInfinity(-Infinity)).toBe(-1);
    expect(attr.isInfinity(0)).toBe(0);
    expect(attr.isUnboundable(0)).toBe(0);
    expect(attr.isOpenEnded(null)).toBe(true);
    expect(attr.isOpenEnded(Infinity)).toBe(true);
    expect(attr.isOpenEnded(0)).toBe(false);
  });

  it("isUnboundable duck-types the protocol rather than always returning false", () => {
    // Regression for the stub these delegated to: it hardcoded `false`, so
    // anything routing `between` through Attribute#isOpenEnded silently lost
    // unboundable collapse (#4433). They now share the real implementation.
    const attr = users.attr("id") as AttributePrivates;
    expect(attr.isUnboundable({ isUnboundable: () => -1 as const })).toBe(-1);
    expect(attr.isOpenEnded({ isUnboundable: () => 1 as const })).toBe(true);
  });
});

describe("between / notBetween self-dispatch (mirror Rails' implicit self)", () => {
  // predications.rb:38-51 calls unboundable? / open_ended? / infinity? on self,
  // exactly as open_ended? (255-257) calls infinity? / unboundable? on self — so
  // an including class that overrides one is honored by the decision tree too.
  class OverridingAttribute extends Nodes.Attribute {
    protected override isInfinity(_value: unknown): 1 | -1 | 0 {
      return 1;
    }
  }

  it("between honors a host override of isInfinity", () => {
    const attr = new OverridingAttribute(users, "id");
    // Both bounds read as open-ended, and begin reports +Infinity -> in([]).
    expect(attr.between({ begin: 1, end: 2, excludeEnd: false })).toBeInstanceOf(Nodes.In);
  });

  it("notBetween honors a host override of isInfinity", () => {
    const attr = new OverridingAttribute(users, "id");
    expect(attr.notBetween({ begin: 1, end: 2, excludeEnd: false })).toBeInstanceOf(Nodes.NotIn);
  });

  it("an un-overridden attribute is unaffected", () => {
    const attr = users.attr("id");
    expect(attr.between({ begin: 1, end: 2, excludeEnd: false })).toBeInstanceOf(Nodes.Between);
  });
});

describe("SelectManager#collapse (Rails-fidelity helper)", () => {
  // Mirrors Arel::SelectManager#collapse — compacts a list of exprs,
  // wraps bare strings as SqlLiteral, returns the single survivor or
  // an `And` of all of them.
  class TestManager extends SelectManager {
    callCollapse(exprs: unknown[]): Nodes.Node {
      return (this as unknown as { collapse(e: unknown[]): Nodes.Node }).collapse(exprs);
    }
  }

  const mgr = new TestManager(users);

  it("returns the single survivor when there's only one non-null expr", () => {
    const out = mgr.callCollapse([null, users.attr("id").eq(1), undefined]);
    expect(out).toBeInstanceOf(Nodes.Equality);
  });

  it("wraps a bare string as SqlLiteral", () => {
    const out = mgr.callCollapse(["LOWER(name) = 'x'"]);
    expect(out).toBeInstanceOf(Nodes.SqlLiteral);
    expect((out as Nodes.SqlLiteral).value).toBe("LOWER(name) = 'x'");
  });

  it("folds multiple exprs into an And via createAnd", () => {
    const out = mgr.callCollapse([users.attr("id").eq(1), users.attr("name").eq("a")]);
    expect(out).toBeInstanceOf(Nodes.And);
    expect((out as Nodes.And).children).toHaveLength(2);
  });

  it("returns an empty And when every input is null/undefined (Rails parity)", () => {
    // Mirrors Rails: `exprs.compact` then `create_and exprs` — an
    // empty array hits the `else` branch and yields an empty `And`
    // node. Rails-side `WHERE ()` is similarly invalid for the same
    // reason; the limitation is shared with Rails. Callers are
    // expected to filter empty conditions before reaching `where`.
    const out = mgr.callCollapse([null, undefined]);
    expect(out).toBeInstanceOf(Nodes.And);
    expect((out as Nodes.And).children).toHaveLength(0);
  });
});

describe("HomogeneousIn#ivars (Rails-fidelity helper)", () => {
  it("returns the [attribute, values, type] tuple Rails uses for hash/eql", () => {
    const attr = users.attr("id");
    const node = new Nodes.HomogeneousIn([1, 2, 3], attr, "in");
    // ivars is `protected` so cast to access. The point: the tuple
    // shape matches Rails' `[@attribute, @values, @type]`.
    const ivars = (node as unknown as { ivars(): [Nodes.Node, unknown[], "in" | "notin"] }).ivars();
    expect(ivars[0]).toBe(attr);
    expect(ivars[1]).toEqual([1, 2, 3]);
    expect(ivars[2]).toBe("in");
  });
});
