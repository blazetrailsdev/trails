import { describe, it, expect } from "vitest";
import { inherited } from "@blazetrails/ruby-compat";
import { DescendantsTracker } from "../lib/descendants-tracker.js";

describe("DescendantsTracker.registerSubclass", () => {
  it("calls the parent's inherited hook once per new subclass", () => {
    const calls: unknown[] = [];
    class Parent {
      static [inherited](subclass: unknown): void {
        calls.push([this, subclass]);
      }
    }
    class Child extends Parent {}

    DescendantsTracker.registerSubclass(Parent, Child);
    DescendantsTracker.registerSubclass(Parent, Child);

    expect(calls).toEqual([[Parent, Child]]);
    expect(DescendantsTracker.subclasses(Parent)).toEqual([Child]);
  });

  it("registers without a hook", () => {
    class Parent {}
    class Child extends Parent {}

    DescendantsTracker.registerSubclass(Parent, Child);

    expect(DescendantsTracker.subclasses(Parent)).toEqual([Child]);
  });
});
