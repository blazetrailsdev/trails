import { describe, it, expect } from "vitest";
import { DescendantsTracker } from "../descendants-tracker.js";

class Parent {}
class Foo extends Parent {}
class Bar extends Foo {}
class Baz extends Bar {}

class A extends Parent {}
class B extends A {}
class C extends B {}

// Register the hierarchy
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
    // JS doesn't have singleton classes; verify regular instances aren't included
    const desc = DescendantsTracker.descendants(Parent);
    for (const d of desc) {
      expect(typeof d).toBe("function");
    }
  });

  it("subclasses excludes singleton classes", () => {
    const subs = DescendantsTracker.subclasses(Parent);
    for (const s of subs) {
      expect(typeof s).toBe("function");
    }
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
