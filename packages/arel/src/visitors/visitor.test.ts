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

  it("throws TypeError for nodes with no handler", () => {
    const v = new TestVisitor();
    expect(() => v.accept(new C())).toThrow(TypeError);
    expect(() => v.accept(new C())).toThrow(/Cannot visit C/);
    expect(() => v.accept(new C())).not.toThrow(UnsupportedVisitError);
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

  describe("raw values dispatch on their Ruby class", () => {
    // Rails' `visit` reads `object.class` for every object (visitor.rb:29), so
    // raw values and nodes share one method table and one entry point — there
    // is no separate raw-value path. These pin that the same `accept` that
    // dispatches a Node also resolves a bare JS value to `visit<RubyClass>`.
    // A real class registered in the ctor-keyed dispatch cache. A Hash whose
    // `constructor` property happens to point here must still dispatch as Hash,
    // not be hijacked onto this handler.
    class Registered {}

    class ValueVisitor extends Visitor {
      visitRegistered(): string {
        return "Registered";
      }
      visitInteger(o: number | bigint): string {
        return `Integer:${o}`;
      }
      visitString(o: string): string {
        return `String:${o}`;
      }
      visitFloat(o: number): string {
        return `Float:${o}`;
      }
      visitTrueClass(): string {
        return "TrueClass";
      }
      visitFalseClass(): string {
        return "FalseClass";
      }
      visitNilClass(): string {
        return "NilClass";
      }
      visitHash(): string {
        return "Hash";
      }
      visitTime(): string {
        return "Time";
      }
      static {
        this.dispatchCache().set(Registered, "visitRegistered");
      }
    }

    it.each([
      [1, "Integer:1"],
      // Ruby has no fixnum/bignum split at this layer — both are Integer.
      [10n, "Integer:10"],
      // Ruby splits Integer from Float; a non-integral number is a Float.
      [1.5, "Float:1.5"],
      ["x", "String:x"],
      [true, "TrueClass"],
      [false, "FalseClass"],
      [null, "NilClass"],
      [undefined, "NilClass"],
      [{ a: 1 }, "Hash"],
      [new Date("2024-01-01T00:00:00Z"), "Time"],
    ])("dispatches %o through visit", (value, expected) => {
      expect(new ValueVisitor().accept(value)).toBe(expected);
    });

    it.each([
      // Rails' `visit` walks object.class.ancestors (visitor.rb:36-41), so any
      // record derived from a plain record reaches visit_Hash on every visitor,
      // not just Dot. These are the JS analogues of `class MyHash < Hash`.
      ["record derived from a plain record", Object.create({ inherited: "x" })],
      ["record derived from a null-prototype record", Object.create(Object.create(null))],
      ["record inheriting a literal constructor key", Object.create({ constructor: "x" })],
    ])("classifies a %s as Hash on a non-Dot visitor", (_label, value) => {
      expect(new ValueVisitor().accept(value)).toBe("Hash");
    });

    it.each([
      // Rails reads `object.class` (visitor.rb:28) before it looks inside, and a
      // Hash's `:constructor` key can't change its class. A JS record's
      // `constructor` — whether an own data key on a null-prototype record or an
      // inherited one — must not hijack dispatch to that (registered) ctor's
      // handler; the record is a Hash and routes to visit_Hash regardless.
      [
        "own constructor key pointing at a registered ctor",
        (() => {
          const h: Record<string, unknown> = Object.create(null);
          h.constructor = Registered;
          return h;
        })(),
      ],
      [
        "inherited constructor key pointing at a registered ctor",
        Object.create({ constructor: Registered }),
      ],
    ])("a Hash whose %s still dispatches as Hash", (_label, value) => {
      expect(new ValueVisitor().accept(value)).toBe("Hash");
    });

    it("raises when the value's class has no handler", () => {
      class Arbitrary {}
      expect(() => new ValueVisitor().accept(new Arbitrary())).toThrow(TypeError);
      expect(() => new ValueVisitor().accept(new Arbitrary())).toThrow(/Cannot visit Arbitrary/);
    });
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
