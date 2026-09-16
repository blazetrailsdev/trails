import { describe, it, expect } from "vitest";
import { DescendantsTracker } from "../descendants-tracker.js";
import { assertNot } from "../testing/assertions.js";

class Parent {}
class Foo extends Parent {}
class Bar extends Foo {}
class Baz extends Bar {}

class A extends Parent {}
class B extends A {}
class C extends B {}

DescendantsTracker.registerSubclass(Parent, Foo);
DescendantsTracker.registerSubclass(Foo, Bar);
DescendantsTracker.registerSubclass(Bar, Baz);
DescendantsTracker.registerSubclass(Parent, A);
DescendantsTracker.registerSubclass(A, B);
DescendantsTracker.registerSubclass(B, C);

describe("ClassTest", () => {
  it("descendants", () => {
    const parentDesc = new Set(DescendantsTracker.descendants(Parent));
    expect(parentDesc).toEqual(new Set([Foo, Bar, Baz, A, B, C]));

    const fooDesc = new Set(DescendantsTracker.descendants(Foo));
    expect(fooDesc).toEqual(new Set([Bar, Baz]));

    expect(DescendantsTracker.descendants(Bar)).toEqual([Baz]);
    expect(DescendantsTracker.descendants(Baz)).toEqual([]);
  });

  it("subclasses", () => {
    const parentSubs = new Set(DescendantsTracker.subclasses(Parent));
    expect(parentSubs).toEqual(new Set([Foo, A]));

    expect(DescendantsTracker.subclasses(Foo)).toEqual([Bar]);
    expect(DescendantsTracker.subclasses(Bar)).toEqual([Baz]);
    expect(DescendantsTracker.subclasses(Baz)).toEqual([]);
  });

  it("descendants excludes singleton classes", () => {
    const klass = Object.getPrototypeOf(new Parent()).constructor;
    assertNot(
      DescendantsTracker.descendants(Parent).includes(klass),
      "descendants should not include singleton classes",
    );
  });

  it("subclasses excludes singleton classes", () => {
    const klass = Object.getPrototypeOf(new Parent()).constructor;
    assertNot(
      DescendantsTracker.subclasses(Parent).includes(klass),
      "subclasses should not include singleton classes",
    );
  });

  it("subclasses exclude reloaded classes", () => {
    class Temp extends Parent {}
    DescendantsTracker.registerSubclass(Parent, Temp);
    expect(DescendantsTracker.subclasses(Parent)).toContain(Temp);
    DescendantsTracker.clear([Temp]);
    expect(DescendantsTracker.subclasses(Parent)).not.toContain(Temp);
  });

  it("descendants exclude reloaded classes", () => {
    class Temp2 extends Parent {}
    DescendantsTracker.registerSubclass(Parent, Temp2);
    expect(DescendantsTracker.descendants(Parent)).toContain(Temp2);
    DescendantsTracker.clear([Temp2]);
    expect(DescendantsTracker.descendants(Parent)).not.toContain(Temp2);
  });
});
