import { describe, expect, it } from "vitest";
import { Node, NodeVisitor } from "../nodes/node.js";
import { Visitor } from "./visitor.js";
import { UnsupportedVisitError } from "../errors.js";

class A extends Node {
  accept<T>(v: NodeVisitor<T>): T {
    return v.visit(this);
  }
}
class B extends A {}
class B2 extends B {}
class C extends Node {
  accept<T>(v: NodeVisitor<T>): T {
    return v.visit(this);
  }
}

class TestVisitor extends Visitor {
  visited: Array<{ node: string; collector: unknown }> = [];
  visitA(node: A, collector?: unknown): string {
    this.visited.push({ node: node.constructor.name, collector });
    return "A";
  }
  static {
    this.dispatchCache().set(A, "visitA");
  }
}

describe("Visitor dispatch", () => {
  it("dispatches to a registered method", () => {
    const v = new TestVisitor();
    expect(v.accept(new A())).toBe("A");
    expect(v.visited[0]?.node).toBe("A");
  });

  it("walks the prototype chain to find an ancestor's handler", () => {
    const v = new TestVisitor();
    expect(v.accept(new B())).toBe("A");
    expect(v.visited).toEqual([{ node: "B", collector: undefined }]);
  });

  it("walks more than one level up the prototype chain", () => {
    const v = new TestVisitor();
    expect(v.accept(new B2())).toBe("A");
    expect(v.visited[0]?.node).toBe("B2");
  });

  it("memoizes ancestor lookups in the cache", () => {
    // Use a fresh subclass so we own the dispatch cache start state —
    // earlier tests may already have populated TestVisitor's cache for B.
    class FreshVisitor extends Visitor {
      visitA(_n: A): string {
        return "A";
      }
      static {
        this.dispatchCache().set(A, "visitA");
      }
    }
    expect(FreshVisitor.dispatchCache().has(B)).toBe(false);
    new FreshVisitor().accept(new B());
    expect(FreshVisitor.dispatchCache().get(B)).toBe("visitA");
  });

  it("throws UnsupportedVisitError for nodes with no handler", () => {
    const v = new TestVisitor();
    expect(() => v.accept(new C())).toThrow(UnsupportedVisitError);
    expect(() => v.accept(new C())).toThrow(/Unknown node type: C/);
  });

  it("distinguishes a mis-registered method from an unknown node type", () => {
    class BadVisitor extends Visitor {
      static {
        this.dispatchCache().set(A, "visitTypoed");
      }
    }
    const v = new BadVisitor();
    expect(() => v.accept(new A())).toThrow(
      /Dispatch method 'visitTypoed' is not defined on BadVisitor for node A/,
    );
  });

  it("propagates the collector argument from accept through to the visit method", () => {
    const v = new TestVisitor();
    const collector = { sentinel: true };
    v.accept(new A(), collector);
    expect(v.visited[0]?.collector).toBe(collector);
  });

  it("each subclass has its own cache seeded from the parent", () => {
    class Sub extends TestVisitor {
      visitC(_n: C): string {
        return "C";
      }
      static {
        this.dispatchCache().set(C, "visitC");
      }
    }
    const sub = new Sub();
    expect(sub.accept(new A())).toBe("A");
    expect(sub.accept(new C())).toBe("C");
    expect(TestVisitor.dispatchCache().has(C)).toBe(false);
  });

  it("a subclass override of the visit method dispatches polymorphically", () => {
    class Sub extends TestVisitor {
      override visitA(_n: A): string {
        return "Sub-A";
      }
    }
    expect(new Sub().accept(new A())).toBe("Sub-A");
    // Parent visitor still uses its own implementation.
    expect(new TestVisitor().accept(new A())).toBe("A");
  });
});
