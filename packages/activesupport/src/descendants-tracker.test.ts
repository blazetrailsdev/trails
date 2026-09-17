import { describe, it, expect, beforeEach } from "vitest";
import { DescendantsTracker } from "./descendants-tracker.js";

describe("DescendantsTrackerTest", () => {
  function assertEqualSets(expected: unknown[], actual: unknown[]): void {
    expect(new Set(actual)).toEqual(new Set(expected));
  }

  let Parent: abstract new (...args: unknown[]) => unknown;
  let Child1: abstract new (...args: unknown[]) => unknown;
  let Child2: abstract new (...args: unknown[]) => unknown;
  let Grandchild1: abstract new (...args: unknown[]) => unknown;
  let Grandchild2: abstract new (...args: unknown[]) => unknown;

  beforeEach(() => {
    Parent = class Parent {};
    Child1 = class Child1 extends (Parent as any) {};
    Child2 = class Child2 extends (Parent as any) {};
    Grandchild1 = class Grandchild1 extends (Child1 as any) {};
    Grandchild2 = class Grandchild2 extends (Child1 as any) {};

    DescendantsTracker.registerSubclass(Parent, Child1);
    DescendantsTracker.registerSubclass(Parent, Child2);
    DescendantsTracker.registerSubclass(Child1, Grandchild1);
    DescendantsTracker.registerSubclass(Child1, Grandchild2);
  });

  it(".descendants", () => {
    assertEqualSets(
      [Child1, Grandchild1, Grandchild2, Child2],
      DescendantsTracker.descendants(Parent),
    );

    assertEqualSets([Grandchild1, Grandchild2], DescendantsTracker.descendants(Child1));

    assertEqualSets([], DescendantsTracker.descendants(Child2));
  });

  it(".subclasses", () => {
    assertEqualSets([Child1, Child2], DescendantsTracker.subclasses(Parent));
    assertEqualSets([Grandchild1, Grandchild2], DescendantsTracker.subclasses(Child1));
    assertEqualSets([], DescendantsTracker.subclasses(Child2));
  });

  it(".clear(classes) deletes the given classes only", () => {
    DescendantsTracker.clear([Child2, Grandchild1]);

    assertEqualSets([Child1, Grandchild2], DescendantsTracker.descendants(Parent));

    assertEqualSets([Grandchild2], DescendantsTracker.descendants(Child1));
  });
});
