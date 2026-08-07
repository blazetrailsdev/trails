import { describe, expect, it } from "vitest";

import { foldSkeletonTokens } from "./compare.js";

describe("foldSkeletonTokens", () => {
  it("matches Ruby `xs.each { |x| save(x) }` against its `for (const x of xs) this.save(x)` port", () => {
    const ruby = ["ref:each", "ref:save"];
    const ts = ["loop", "ref:save"];

    expect(foldSkeletonTokens(ruby)).toEqual(foldSkeletonTokens(ts));
  });

  it("folds the JS iteration callee too, so a forEach port reads the same", () => {
    expect(foldSkeletonTokens(["ref:forEach", "ref:save"])).toEqual(["loop", "ref:save"]);
  });

  it("leaves the no-JS-call-form names that are not loops alone, such as `key?`", () => {
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
