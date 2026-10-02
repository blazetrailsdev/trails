import { describe, expect, it } from "vitest";
import { NoMethodError, TypeError, rbClassOf, rbFSend } from "@blazetrails/ruby-compat";
import { Temporal } from "@blazetrails/date";
import { Node } from "../nodes/node.js";
import { Visitor } from "./visitor.js";
import { UnsupportedVisitError } from "./to-sql.js";

class A extends Node {}
class B extends A {}
class B2 extends B {}
class C extends Node {}

class TestVisitor extends Visitor {
  visited: Array<{ node: string; collector: unknown }> = [];
  visitA(node: A, collector?: unknown): string {
    this.visited.push({ node: node.constructor.name, collector });
    return "A";
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
    class FreshVisitor extends Visitor {
      visitA(_n: A): string {
        return "A";
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

  it("raises TypeError for an anonymous class with no handler, and walks its ancestors for one", () => {
    const v = new TestVisitor();
    expect(() => v.accept(new (class extends C {})())).toThrow(TypeError);
    expect(() => v.accept(new (class extends C {})())).toThrow(/Cannot visit #<Class:0x[0-9a-f]+>/);
    expect(v.accept(new (class extends A {})())).toBe("A");
  });

  it("falls through to an ancestor's handler when its own dispatch entry names a missing method", () => {
    class FallUpVisitor extends Visitor {
      visitA(_n: A): string {
        return "A";
      }
      static {
        this.dispatchCache().set(B, "visitTypoed");
      }
    }
    const v = new FallUpVisitor();
    expect(v.accept(new B())).toBe("A");
    expect(FallUpVisitor.dispatchCache().get(B)).toBe("visitA");
  });

  it("raises TypeError when neither the class nor an ancestor has a responding handler", () => {
    class BadVisitor extends Visitor {
      static {
        this.dispatchCache().set(A, "visitTypoed");
      }
    }
    const v = new BadVisitor();
    expect(() => v.accept(new A())).toThrow(TypeError);
    expect(() => v.accept(new A())).toThrow(/Cannot visit A/);
    expect(() => v.accept(new A())).not.toThrow(UnsupportedVisitError);
  });

  it("re-raises a NoMethodError raised inside a visit method it responds to", () => {
    class RaisingVisitor extends Visitor {
      visitA(o: A): unknown {
        return rbFSend(o, "mumbo");
      }
      visitC(o: C): unknown {
        return (o as unknown as { mumbo(): unknown }).mumbo();
      }
    }
    const v = new RaisingVisitor();
    expect(() => v.accept(new A())).toThrow(NoMethodError);
    expect(() => v.accept(new B())).toThrow(NoMethodError);
    expect(() => v.accept(new C())).toThrow(globalThis.TypeError);
    expect(() => v.accept(new C())).not.toThrow(/Cannot visit/);
  });

  it("walks a core class's ancestors: a DateTime reaches visit_Date", () => {
    class DateVisitor extends Visitor {
      visitDate(): string {
        return "Date";
      }
    }
    expect(new DateVisitor().accept(Temporal.PlainDateTime.from("2024-01-02T03:04:05"))).toBe(
      "Date",
    );
    expect(() => new DateVisitor().accept(1)).toThrow(/Cannot visit Integer/);
  });

  it("keeps an underscore that is part of the class name", () => {
    class Some_Thing {}
    class UnderscoreVisitor extends Visitor {}
    expect(UnderscoreVisitor.dispatchCache().get(Some_Thing)).toBe("visitSome_Thing");
  });

  it("keys the dispatch cache by identity and names a method after the class path", () => {
    class NamingVisitor extends Visitor {}
    const cache = NamingVisitor.dispatchCache();
    expect(cache.isCompareByIdentity()).toBe(true);
    expect(cache.get(Node)).toBe("visitArelNodesNode");
    expect(cache.get(class {})).toBe("visit_");
    expect(cache.get(rbClassOf(1))).toBe("visitInteger");
    expect(NamingVisitor.dispatchCache()).toBe(cache);
  });

  it("propagates the collector argument from accept through to the visit method", () => {
    const v = new TestVisitor();
    const collector = { sentinel: true };
    v.accept(new A(), collector);
    expect(v.visited[0]?.collector).toBe(collector);
  });

  it("each subclass has its own cache", () => {
    class Sub extends TestVisitor {
      visitC(_n: C): string {
        return "C";
      }
    }
    const sub = new Sub();
    expect(sub.accept(new A())).toBe("A");
    expect(sub.accept(new C())).toBe("C");
    expect(Sub.dispatchCache()).not.toBe(TestVisitor.dispatchCache());
    expect(TestVisitor.dispatchCache().get(C)).toBe("visitC");
    expect(() => new TestVisitor().accept(new C())).toThrow(TypeError);
  });

  describe("raw values dispatch on their Ruby class", () => {
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
    }

    it.each([
      [1, "Integer:1"],
      [10n, "Integer:10"],
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
      ["record derived from a plain record", Object.create({ inherited: "x" })],
      ["record derived from a null-prototype record", Object.create(Object.create(null))],
      ["record inheriting a literal constructor key", Object.create({ constructor: "x" })],
    ])("classifies a %s as Hash on a non-Dot visitor", (_label, value) => {
      expect(new ValueVisitor().accept(value)).toBe("Hash");
    });

    it.each([
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
    expect(new TestVisitor().accept(new A())).toBe("A");
  });
});
