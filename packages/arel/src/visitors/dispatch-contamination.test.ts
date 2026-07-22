import { describe, it, expect } from "vitest";
import { testConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors } from "../index.js";

describe("DispatchContaminationTest", () => {
  const users = new Table("users");
  it("dispatches properly after failing upwards", () => {
    const node = new Nodes.Union(new Nodes.True(), new Nodes.False());
    expect(node.toSql()).toBe("( TRUE UNION FALSE )");

    // Rails' anonymous `Class.new(Visitor)` with `visit_Arel_Nodes_Union` and
    // its True/False aliases. Ruby derives dispatch names from class names, so
    // defining the methods is registration; trails' Visitor routes through an
    // explicit per-class cache instead, so registering on the subclass's own
    // `dispatchCache()` is the analogue. The Union handler is registered under
    // `Binary` (Union's superclass) so that accepting the node exercises
    // `resolveDispatch`'s ancestor fallthrough and memoizes the corrected
    // entry — the write that must land in the subclass's cache, never the
    // shared one ToSql dispatches through.
    class ContaminatingVisitor extends Visitors.Visitor {
      protected visitArelNodesUnion(_node: unknown): void {}
    }
    const cache = ContaminatingVisitor.dispatchCache();
    cache.set(Nodes.Binary, "visitArelNodesUnion");
    cache.set(Nodes.True, "visitArelNodesUnion");
    cache.set(Nodes.False, "visitArelNodesUnion");

    new ContaminatingVisitor().accept(node);
    expect(cache.get(Nodes.Union)).toBe("visitArelNodesUnion");

    expect(node.toSql()).toBe("( TRUE UNION FALSE )");
  });

  it("is threadsafe when implementing superclass fallback", () => {
    const v1 = new Visitors.ToSql(testConnection);
    const v2 = new Visitors.ToSql(testConnection);
    const n1 = users.get("id").eq(1);
    const n2 = users.get("id").eq(2);
    expect(v1.compile(n1)).toBe('"users"."id" = 1');
    expect(v2.compile(n2)).toBe('"users"."id" = 2');
  });
});
