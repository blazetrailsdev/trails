import { describe, it, expect, beforeEach } from "vitest";
import { DescendantsTracker } from "./descendants-tracker.js";

describe("DescendantsTrackerTest", () => {
  let Parent: Function;
  let Child1: Function;
  let Child2: Function;
  let Grandchild1: Function;
  let Grandchild2: Function;

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
    const parentDescendants = DescendantsTracker.descendants(Parent);
    expect(new Set(parentDescendants)).toEqual(new Set([Child1, Grandchild1, Grandchild2, Child2]));

    const child1Descendants = DescendantsTracker.descendants(Child1);
    expect(new Set(child1Descendants)).toEqual(new Set([Grandchild1, Grandchild2]));

    expect(DescendantsTracker.descendants(Child2)).toEqual([]);
  });

  it.skip(".descendants with garbage collected classes");

  it(".subclasses", () => {
    expect(new Set(DescendantsTracker.subclasses(Parent))).toEqual(new Set([Child1, Child2]));
    expect(new Set(DescendantsTracker.subclasses(Child1))).toEqual(
      new Set([Grandchild1, Grandchild2]),
    );
    expect(DescendantsTracker.subclasses(Child2)).toEqual([]);
  });

  it(".clear(classes) deletes the given classes only", () => {
    DescendantsTracker.clear([Child2, Grandchild1]);

    const parentDescendants = DescendantsTracker.descendants(Parent);
    expect(new Set(parentDescendants)).toEqual(new Set([Child1, Grandchild2]));

    const child1Descendants = DescendantsTracker.descendants(Child1);
    expect(new Set(child1Descendants)).toEqual(new Set([Grandchild2]));
  });
});
