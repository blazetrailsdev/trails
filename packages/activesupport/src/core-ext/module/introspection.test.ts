import { describe, expect, it } from "vitest";
import { moduleParentName } from "../../module-ext.js";

describe("IntrospectionTest", () => {
  function namedFn(name: string): { name: string } {
    const f = function () {};
    Object.defineProperty(f, "name", { value: name, configurable: true });
    return f as unknown as { name: string };
  }

  it("module parent name", () => {
    expect(moduleParentName(class FooBar {})).toBeNull(); // no ::
    expect(moduleParentName(namedFn("Foo::Bar"))).toBe("Foo");
  });

  it("module parent name when frozen", () => {
    expect(moduleParentName(namedFn("Foo::Bar::Baz"))).toBe("Foo::Bar");
  });

  it("module parent name notice changes", () => {
    expect(moduleParentName(namedFn("A::B::C"))).toBe("A::B");
    expect(moduleParentName(namedFn("A::B"))).toBe("A");
    expect(moduleParentName(namedFn("A"))).toBeNull();
  });

  it("module parent", () => {
    class Animal {}
    class Dog extends Animal {}
    expect(Object.getPrototypeOf(Dog)).toBe(Animal);
  });

  it("module parents", () => {
    class A {}
    class B extends A {}
    class C extends B {}
    const chain: unknown[] = [];
    let proto = Object.getPrototypeOf(C);
    while (proto && proto !== Function.prototype) {
      chain.push(proto);
      proto = Object.getPrototypeOf(proto);
    }
    expect(chain).toContain(B);
    expect(chain).toContain(A);
  });

  it("module parent notice changes", () => {
    expect(moduleParentName(namedFn("Outer::Inner"))).toBe("Outer");
  });
});
