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

  it("reads a blockless reverse_each chained into drop_while as the one loop drop_while lowers to", () => {
    const ts = ["ref:parts", "ref:reverse", "loop", "if"];
    expect(
      foldSkeletonTokens(["ref:parts", "ref:reverse_each", "ref:drop_while"], "ruby", ts),
    ).toEqual(["ref:parts", "loop", "if"]);
    expect(foldSkeletonTokens(["ref:reverse_each", "ref:save"])).toEqual(["loop", "ref:save"]);
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

  it("splices a same-named same-file function a method delegates to", () => {
    expect(
      sameFileHelperSkeletons("markOccurrence", ["ref:markOccurrence"], resolve, "ts", [
        "if",
        "ref:set",
      ]),
    ).toEqual({ markOccurrence: ["if", "ref:set"] });
  });

  it("resolves a reach named after an Object.prototype member", () => {
    expect(sameFileHelperSkeletons("build", ["ref:constructor"], () => ["if"])).toEqual({
      constructor: ["if"],
    });
  });

  it("records nothing when no reach resolves", () => {
    expect(sameFileHelperSkeletons("build", ["ref:elsewhere", "if"], resolve)).toBeUndefined();
  });
  it("folds the rest of the block-iterator family, not just each", () => {
    expect(
      foldSkeletonTokens([
        "ref:each_key",
        "ref:each_value",
        "ref:each_pair",
        "ref:each_with_index",
        "ref:each_with_object",
        "ref:reverse_each",
      ]),
    ).toEqual(["loop", "loop", "loop", "loop", "loop", "loop"]);
  });

  it("leaves an iterator whose faithful port keeps a call alone", () => {
    expect(foldSkeletonTokens(["ref:map", "ref:select", "ref:inject"])).toEqual([
      "ref:map",
      "ref:select",
      "ref:inject",
    ]);
  });

  it("folds a stdlib idiom onto the loop AND guard its faithful port is forced to spell", () => {
    expect(
      foldSkeletonTokens(["ref:filter_map", "ref:push"], "ruby", ["loop", "if", "ref:push"]),
    ).toEqual(["loop", "if", "ref:push"]);
  });

  it("credits nothing for a stdlib idiom whose port has a token-free JS spelling", () => {
    expect(foldSkeletonTokens(["ref:uniq"], "ruby", ["new:Set"])).toEqual([]);
  });

  it("takes the alternative lowering the counterpart stream supports", () => {
    expect(foldSkeletonTokens(["ref:compact"], "ruby", ["ref:filter", "if"])).toEqual(["if"]);
    expect(foldSkeletonTokens(["ref:compact"], "ruby", ["loop", "if"])).toEqual(["loop", "if"]);
  });

  it("folds `dig` onto nothing where the port is an optional chain", () => {
    expect(foldSkeletonTokens(["ref:dig"], "ruby", ["ref:get"])).toEqual([]);
  });

  it("reads the idiom table on the Ruby side only, so a TS `concat` is not a loop", () => {
    expect(foldSkeletonTokens(["ref:concat"], "ts")).toEqual(["ref:concat"]);
    expect(foldSkeletonTokens(["ref:concat"], "ruby", ["loop", "ref:push"])).toEqual(["loop"]);
  });

  it("cannot hide an if the TS side dropped: the folded Ruby stream still runs one over", () => {
    const ruby = foldSkeletonTokens(["ref:filter_map", "if", "ref:save"], "ruby", [
      "loop",
      "if",
      "ref:save",
    ]);
    const ts = foldSkeletonTokens(["loop", "if", "ref:save"], "ts");
    expect(ruby.filter((t) => t === "if")).toHaveLength(2);
    expect(ts.filter((t) => t === "if")).toHaveLength(1);
  });
});
