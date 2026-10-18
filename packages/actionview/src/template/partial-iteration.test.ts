import { describe, it } from "vitest";
import { assertEqual, assertNot, assertPredicate } from "@blazetrails/activesupport";
import { PartialIteration } from "../renderer/collection-renderer.js";

describe("PartialIterationTest", () => {
  it("has size and index", () => {
    const iteration = new PartialIteration(3);
    assertEqual(0, iteration.index, "should be at the first index");
    assertEqual(3, iteration.size, "should have the size");
  });

  it("first is true when current is at the first index", () => {
    const iteration = new PartialIteration(3);
    assertPredicate(iteration, (i) => i.isFirst(), "first when current is 0");
  });

  it("first is false unless current is at the first index", () => {
    const iteration = new PartialIteration(3);
    iteration.iterateBang();
    assertNot(iteration.isFirst(), "not first when current is 1");
  });

  it("last is true when current is at the last index", () => {
    const iteration = new PartialIteration(3);
    iteration.iterateBang();
    iteration.iterateBang();
    assertPredicate(iteration, (i) => i.isLast(), "last when current is 2");
  });

  it("last is false unless current is at the last index", () => {
    const iteration = new PartialIteration(3);
    assertNot(iteration.isLast(), "not last when current is 0");
  });
});
