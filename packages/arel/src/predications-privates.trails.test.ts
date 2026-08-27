import { describe, it, expect } from "vitest";
import { Table, Nodes, SelectManager } from "./index.js";
import { Predications } from "./predications.js";

const users = new Table("users");

describe("Predications.groupingAny / groupingAll", () => {
  it("groupingAny dispatches by method-id and folds with OR (Grouping)", () => {
    const out = Predications.groupingAny.call(users.get("id"), "eq", [1, 2, 3]);
    expect(out).toBeInstanceOf(Nodes.Grouping);
    const inner = out.expr as Nodes.Or;
    expect(inner).toBeInstanceOf(Nodes.Or);
  });

  it("groupingAll dispatches by method-id and folds with AND", () => {
    const out = Predications.groupingAll.call(users.get("id"), "gt", [1, 2]);
    expect(out).toBeInstanceOf(Nodes.Grouping);
    expect(out.expr).toBeInstanceOf(Nodes.And);
  });

  it("groupingAny accepts a closure variant (no stringly-typed dispatch)", () => {
    const attr = users.get("id");
    const out = Predications.groupingAny.call(attr, (expr: unknown) => attr.eq(expr), [10, 20]);
    expect(out).toBeInstanceOf(Nodes.Grouping);
  });

  it("folds an empty `others` to Grouping(NULL) / Grouping(And([]))", () => {
    const attr = users.get("id");
    const any = Predications.groupingAny.call(attr, "eq", []);
    expect(any.expr).toBeInstanceOf(Nodes.SqlLiteral);
    expect((any.expr as Nodes.SqlLiteral).value).toBe("NULL");
    expect(attr.eqAny([])).toEqual(any);

    const all = Predications.groupingAll.call(attr, "eq", []);
    expect(all.expr).toBeInstanceOf(Nodes.And);
    expect((all.expr as Nodes.And).children).toHaveLength(0);
    expect(attr.eqAll([])).toEqual(all);
  });

  it("threads *extras through to the dispatched predicate", () => {
    const attr = users.get("name");

    const m = attr.matchesAny(["a%"], "!", true).expr as Nodes.Matches;
    expect(m.escape).toEqual(new Nodes.Quoted("!"));
    expect(m.caseSensitive).toBe(true);

    const d = attr.doesNotMatchAny(["a%"], "!").expr as Nodes.DoesNotMatch;
    expect(d.escape).toEqual(new Nodes.Quoted("!"));
    expect(d.caseSensitive).toBe(false);
  });

  it("groupingAny throws a clear TypeError when the method-id isn't callable", () => {
    const attr = users.get("id");
    expect(() => Predications.groupingAny.call(attr, "noSuchMethod", [1])).toThrowError(
      /noSuchMethod.*Attribute/,
    );
  });
});

describe("Predications.isInfinity / isUnboundable / isOpenEnded", () => {
  const host = {
    quotedNode: (v: unknown): Nodes.Node => v as Nodes.Node,
    quotedArray: (vs: unknown[]): Nodes.Node[] => vs as Nodes.Node[],
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
    expect(isInfinity(new Nodes.Quoted({ isInfinite: () => 1 as const }))).toBe(1);
    expect(isInfinity(new Nodes.Quoted({ isInfinite: () => -1 as const }))).toBe(-1);
    expect(isInfinity(new Nodes.Quoted(3))).toBe(0);
  });

  it("isInfinity does not unwrap Casted, which defines no infinite? in Rails", () => {
    expect(isInfinity(new Nodes.Casted(Infinity, users.get("id")))).toBe(0);
    expect(isOpenEnded(new Nodes.Casted(Infinity, users.get("id")))).toBe(false);
  });

  it("isUnboundable duck-types the protocol and yields the sign", () => {
    expect(isUnboundable({ isUnboundable: () => 1 as const })).toBe(1);
    expect(isUnboundable({ isUnboundable: () => -1 as const })).toBe(-1);
    expect(isUnboundable({ isUnboundable: () => false as const })).toBe(0);
  });

  it("isUnboundable is 0 for values with no unboundable? — including ±Infinity", () => {
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
    const overridden = { ...host, isInfinity: () => 1 as const };
    expect(Predications.isOpenEnded.call(overridden, 42)).toBe(true);
    expect(Predications.isOpenEnded.call(host, 42)).toBe(false);
  });

  it("isOpenEnded dispatches Ruby's leading `value.nil?` onto the node", () => {
    expect(isOpenEnded(new Nodes.BindParam(null))).toBe(true);
    expect(isOpenEnded(new Nodes.Quoted(null))).toBe(true);
    expect(isOpenEnded(new Nodes.Casted(null, users.get("id")))).toBe(true);
    expect(isOpenEnded(new Nodes.Quoted(3))).toBe(false);
    expect(isOpenEnded(new Nodes.Casted(3, users.get("id")))).toBe(false);
  });
});

describe("Attribute private helpers (mirror Predications)", () => {
  type AttributePrivates = Nodes.Attribute & {
    groupingAny: (methodId: string, others: unknown[]) => Nodes.Grouping;
    groupingAll: (methodId: string, others: unknown[]) => Nodes.Grouping;
    isInfinity: (value: unknown) => 1 | -1 | 0;
    isUnboundable: (value: unknown) => 1 | -1 | 0;
    isOpenEnded: (value: unknown) => boolean;
  };

  it("groupingAny / groupingAll work via method dispatch on Attribute", () => {
    const attr = users.get("id") as AttributePrivates;
    expect(attr.groupingAny("eq", [1, 2])).toBeInstanceOf(Nodes.Grouping);
    expect(attr.groupingAll("eq", [1, 2])).toBeInstanceOf(Nodes.Grouping);
  });

  it("isInfinity / isUnboundable / isOpenEnded match Predications semantics", () => {
    const attr = users.get("id") as AttributePrivates;
    expect(attr.isInfinity(Infinity)).toBe(1);
    expect(attr.isInfinity(-Infinity)).toBe(-1);
    expect(attr.isInfinity(0)).toBe(0);
    expect(attr.isUnboundable(0)).toBe(0);
    expect(attr.isOpenEnded(null)).toBe(true);
    expect(attr.isOpenEnded(Infinity)).toBe(true);
    expect(attr.isOpenEnded(0)).toBe(false);
  });

  it("isUnboundable duck-types the protocol rather than always returning false", () => {
    const attr = users.get("id") as AttributePrivates;
    expect(attr.isUnboundable({ isUnboundable: () => -1 as const })).toBe(-1);
    expect(attr.isOpenEnded({ isUnboundable: () => 1 as const })).toBe(true);
  });
});

describe("between / notBetween self-dispatch (mirror Rails' implicit self)", () => {
  class OverridingAttribute extends Nodes.Attribute {
    override isInfinity(_value: unknown): 1 | -1 | 0 {
      return 1;
    }
  }

  it("between honors a host override of isInfinity", () => {
    const attr = new OverridingAttribute(users, "id");
    expect(attr.between({ begin: 1, end: 2, excludeEnd: false })).toBeInstanceOf(Nodes.In);
  });

  it("notBetween honors a host override of isInfinity", () => {
    const attr = new OverridingAttribute(users, "id");
    expect(attr.notBetween({ begin: 1, end: 2, excludeEnd: false })).toBeInstanceOf(Nodes.NotIn);
  });

  it("an un-overridden attribute is unaffected", () => {
    const attr = users.get("id");
    expect(attr.between({ begin: 1, end: 2, excludeEnd: false })).toBeInstanceOf(Nodes.Between);
  });
});

describe("SelectManager#collapse (Rails-fidelity helper)", () => {
  class TestManager extends SelectManager {
    callCollapse(exprs: unknown[]): Nodes.Node {
      return (this as unknown as { collapse(e: unknown[]): Nodes.Node }).collapse(exprs);
    }
  }

  const mgr = new TestManager(users);

  it("returns the single survivor when there's only one non-null expr", () => {
    const out = mgr.callCollapse([null, users.get("id").eq(1), undefined]);
    expect(out).toBeInstanceOf(Nodes.Equality);
  });

  it("wraps a bare string as SqlLiteral", () => {
    const out = mgr.callCollapse(["LOWER(name) = 'x'"]);
    expect(out).toBeInstanceOf(Nodes.SqlLiteral);
    expect((out as Nodes.SqlLiteral).value).toBe("LOWER(name) = 'x'");
  });

  it("folds multiple exprs into an And via createAnd", () => {
    const out = mgr.callCollapse([users.get("id").eq(1), users.get("name").eq("a")]);
    expect(out).toBeInstanceOf(Nodes.And);
    expect((out as Nodes.And).children).toHaveLength(2);
  });

  it("returns an empty And when every input is null/undefined (Rails parity)", () => {
    const out = mgr.callCollapse([null, undefined]);
    expect(out).toBeInstanceOf(Nodes.And);
    expect((out as Nodes.And).children).toHaveLength(0);
  });
});

describe("HomogeneousIn#ivars (Rails-fidelity helper)", () => {
  it("returns the [attribute, values, type] tuple Rails uses for hash/eql", () => {
    const attr = users.get("id");
    const node = new Nodes.HomogeneousIn([1, 2, 3], attr, "in");
    const ivars = (node as unknown as { ivars(): [Nodes.Node, unknown[], "in" | "notin"] }).ivars();
    expect(ivars[0]).toBe(attr);
    expect(ivars[1]).toEqual([1, 2, 3]);
    expect(ivars[2]).toBe("in");
  });
});
