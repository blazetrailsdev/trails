import { describe, it, expect } from "vitest";
import { Table, Nodes, SelectManager } from "./index.js";
import { Predications } from "./predications.js";

// Audit follow-up: cover the Predications private helpers that mirror
// Arel::Predications' private API (grouping_any, grouping_all,
// infinity?, unboundable?, open_ended?). Trails surfaces them on the
// mixin object for Rails-fidelity / api:compare privates coverage;
// these tests pin their behavior.

const users = new Table("users");

describe("Predications.groupingAny / groupingAll", () => {
  it("groupingAny dispatches by method-id and folds with OR (Grouping)", () => {
    const out = Predications.groupingAny.call(users.attr("id"), "eq", [1, 2, 3]);
    expect(out).toBeInstanceOf(Nodes.Grouping);
    // The grouped expression is an Or chain over three Equality nodes.
    const inner = (out as Nodes.Grouping).expr as Nodes.Or;
    expect(inner).toBeInstanceOf(Nodes.Or);
  });

  it("groupingAll dispatches by method-id and folds with AND", () => {
    const out = Predications.groupingAll.call(users.attr("id"), "gt", [1, 2]);
    expect(out).toBeInstanceOf(Nodes.Grouping);
    expect((out as Nodes.Grouping).expr).toBeInstanceOf(Nodes.And);
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
  // Build a minimal PredicationHost-shaped object with public
  // isInfinity / isUnboundable so isOpenEnded's `this`-dispatch
  // typechecks. Mirrors how the methods would be reachable on a
  // class that included Predications via the runtime mixin.
  const host = {
    quotedNode: (v: unknown): Nodes.Node => v as Nodes.Node,
    isInfinity(this: unknown, v: unknown): boolean {
      return Predications.isInfinity.call(this as never, v);
    },
    isUnboundable(this: unknown, v: unknown): boolean {
      return Predications.isUnboundable.call(this as never, v);
    },
  };

  it("isInfinity is true for ±Infinity, false otherwise", () => {
    expect(host.isInfinity(Infinity)).toBe(true);
    expect(host.isInfinity(-Infinity)).toBe(true);
    expect(host.isInfinity(0)).toBe(false);
    expect(host.isInfinity("x")).toBe(false);
  });

  it("isUnboundable is always false (no Ruby-style protocol in TS)", () => {
    expect(host.isUnboundable(undefined)).toBe(false);
    expect(host.isUnboundable(1)).toBe(false);
  });

  it("isOpenEnded is true for null/undefined/Infinity, false otherwise", () => {
    expect(Predications.isOpenEnded.call(host, null)).toBe(true);
    expect(Predications.isOpenEnded.call(host, undefined)).toBe(true);
    expect(Predications.isOpenEnded.call(host, Infinity)).toBe(true);
    expect(Predications.isOpenEnded.call(host, -Infinity)).toBe(true);
    expect(Predications.isOpenEnded.call(host, 0)).toBe(false);
    expect(Predications.isOpenEnded.call(host, "x")).toBe(false);
  });

  it("isOpenEnded dispatches through `this` so host overrides win", () => {
    // Regression for the `this`-vs-direct-module-call concern: a host
    // that overrides isInfinity to claim everything is infinite should
    // see isOpenEnded honor that override.
    const overridden = {
      ...host,
      isInfinity: () => true,
    };
    expect(Predications.isOpenEnded.call(overridden, 42)).toBe(true);
  });
});

describe("Attribute private helpers (mirror Predications)", () => {
  // The helpers are `protected` for Rails-fidelity / api:compare
  // coverage, not as a public surface. Tests cast to access them —
  // same pattern as HomogeneousIn#ivars / SelectManager#collapse.
  type AttributePrivates = Nodes.Attribute & {
    groupingAny: (methodId: string, others: unknown[]) => Nodes.Grouping;
    groupingAll: (methodId: string, others: unknown[]) => Nodes.Grouping;
    isInfinity: (value: unknown) => boolean;
    isUnboundable: (value: unknown) => boolean;
    isOpenEnded: (value: unknown) => boolean;
  };

  it("groupingAny / groupingAll work via method dispatch on Attribute", () => {
    const attr = users.attr("id") as AttributePrivates;
    expect(attr.groupingAny("eq", [1, 2])).toBeInstanceOf(Nodes.Grouping);
    expect(attr.groupingAll("eq", [1, 2])).toBeInstanceOf(Nodes.Grouping);
  });

  it("isInfinity / isUnboundable / isOpenEnded match Predications semantics", () => {
    const attr = users.attr("id") as AttributePrivates;
    expect(attr.isInfinity(Infinity)).toBe(true);
    expect(attr.isInfinity(0)).toBe(false);
    expect(attr.isUnboundable(0)).toBe(false);
    expect(attr.isOpenEnded(null)).toBe(true);
    expect(attr.isOpenEnded(Infinity)).toBe(true);
    expect(attr.isOpenEnded(0)).toBe(false);
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
