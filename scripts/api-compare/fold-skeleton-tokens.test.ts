import { describe, expect, it } from "vitest";

import { foldSkeletonTokens, sameFileHelperSkeletons } from "./compare.js";

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

  it("folds Ruby's catch/throw onto the try/throw its TS lowering is forced to use", () => {
    expect(foldSkeletonTokens(["ref:catch", "ref:load", "ref:throw"])).toEqual([
      "try",
      "ref:load",
      "throw",
    ]);
  });
});

describe("sameFileHelperSkeletons", () => {
  const resolve = (name: string) =>
    ({ helper: ["if", "ref:save"], other: ["throw"] })[name] ?? undefined;

  it("records one folded entry per reach that resolves to a same-file method", () => {
    expect(
      sameFileHelperSkeletons("build", ["ref:helper", "ref:elsewhere", "ref:other"], resolve),
    ).toEqual({ helper: ["if", "ref:save"], other: ["throw"] });
  });

  it("folds the entry, so a helper's block iteration reads as a loop", () => {
    expect(sameFileHelperSkeletons("build", ["ref:each"], () => ["ref:each"])).toEqual({
      each: ["loop"],
    });
  });

  it("skips the body's own name, so a self-recursive call cannot splice a body into itself", () => {
    expect(sameFileHelperSkeletons("helper", ["ref:helper"], resolve)).toBeUndefined();
  });

  it("resolves a reach named after an Object.prototype member", () => {
    expect(sameFileHelperSkeletons("build", ["ref:constructor"], () => ["if"])).toEqual({
      constructor: ["if"],
    });
  });

  it("records nothing when no reach resolves", () => {
    expect(sameFileHelperSkeletons("build", ["ref:elsewhere", "if"], resolve)).toBeUndefined();
  });
});
