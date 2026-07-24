import { describe, it, expect } from "vitest";
import { Nodes, Visitors } from "../index.js";

describe("DispatchContaminationTest", () => {
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
    // Rails' thread/CyclicBarrier machinery has no analogue: JS is
    // single-threaded and dispatch is not interruptible. The portable core of
    // the race is that the corrective write lands on the shared per-class
    // cache, so a second visitor resolves the same handler the first resolved
    // by ancestor fallthrough.
    class DummySuperNode {}
    class DummySubNode extends DummySuperNode {}

    class DummyVisitor extends Visitors.Visitor {
      protected visitArelVisitorsDummySuperNode(_node: unknown): number {
        return 42;
      }
    }
    const cache = DummyVisitor.dispatchCache();
    cache.set(DummySuperNode, "visitArelVisitorsDummySuperNode");
    expect(cache.has(DummySubNode)).toBe(false);

    const visitor = new DummyVisitor();
    const racingVisitor = new DummyVisitor();

    expect(visitor.accept(new DummySubNode())).toBe(42);
    expect(cache.get(DummySubNode)).toBe("visitArelVisitorsDummySuperNode");
    expect(racingVisitor.accept(new DummySubNode())).toBe(42);
  });
});
