import { describe, expect, it } from "vitest";

import { foldSkeletonTokens } from "./compare.js";

describe("foldSkeletonTokens", () => {
  it("folds a Ruby block iteration onto the loop its for-of port tokens", () => {
    // Ruby `xs.each { |x| save(x) }` — walk_for_skeleton records the `each`
    // call, then the block body inline.
    const ruby = ["ref:each", "ref:save"];
    // Its faithful port, `for (const x of xs) this.save(x)` — extractSkeleton
    // records the ForOfStatement as `loop`.
    const ts = ["loop", "ref:save"];

    expect(foldSkeletonTokens(ruby)).toEqual(foldSkeletonTokens(ts));
  });

  it("folds the JS iteration callee too, so a forEach port reads the same", () => {
    expect(foldSkeletonTokens(["ref:forEach", "ref:save"])).toEqual(["loop", "ref:save"]);
  });

  it("leaves the other no-JS-call-form names alone", () => {
    // `key?` is in NO_JS_CALL_FORM but ports to the `in` operator, not a loop.
    expect(foldSkeletonTokens(["ref:key?", "if", "ref:to_s"])).toEqual([
      "ref:key?",
      "if",
      "ref:to_s",
    ]);
  });

  it("leaves control tokens and constructors untouched", () => {
    const skeleton = ["if", "new:Relation", "try", "throw", "ref:get"];
    expect(foldSkeletonTokens(skeleton)).toEqual(skeleton);
  });
});
