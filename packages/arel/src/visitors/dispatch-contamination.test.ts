import { describe, it, expect } from "vitest";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Nodes, Visitors } from "../index.js";

describe("DispatchContaminationTest", () => {
  it("dispatches properly after failing upwards", () => {
    const node = new Nodes.Union(new Nodes.True(), new Nodes.False());
    expect(node.toSql()).toBe("( TRUE UNION FALSE )");

    class ContaminatingVisitor extends Visitors.Visitor {
      protected visitArelNodesUnion(_o: unknown): void {}
      protected visitArelNodesTrue = this.visitArelNodesUnion;
      protected visitArelNodesFalse = this.visitArelNodesUnion;
    }

    new ContaminatingVisitor().accept(node);

    expect(node.toSql()).toBe("( TRUE UNION FALSE )");
  });

  it("is threadsafe when implementing superclass fallback", () => {
    class DummySuperNode {}
    class DummySubNode extends DummySuperNode {}
    rbSetClassPathString(DummySuperNode, Visitors, "DummySuperNode");
    rbSetClassPathString(DummySubNode, Visitors, "DummySubNode");

    class DummyVisitor extends Visitors.Visitor {
      protected visitArelVisitorsDummySuperNode(_node: unknown): number {
        return 42;
      }
    }

    const visitor = new DummyVisitor();
    const racingVisitor = new DummyVisitor();

    expect(visitor.accept(new DummySubNode())).toBe(42);
    expect(racingVisitor.accept(new DummySubNode())).toBe(42);
  });
});
