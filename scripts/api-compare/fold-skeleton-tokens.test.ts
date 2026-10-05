import { describe, expect, it } from "vitest";

import { foldSkeletonTokens, sameFileHelperSkeletons } from "./compare.js";
import { compareShortCircuits } from "./report-arms.js";

function shortCircuitsAgree(ruby: string[], ts: string[]): boolean {
  const tsFolded = foldSkeletonTokens(ts, "ts", ruby);
  const rubyFolded = foldSkeletonTokens(ruby, "ruby", tsFolded);
  const row = { package: "arel", rubyFile: "", rubyName: "", tsFile: "", tsName: "" };
  return compareShortCircuits({ ...row, ruby: rubyFolded, ts: tsFolded }) === undefined;
}

describe("foldSkeletonTokens", () => {
  it("folds rbEnsure onto the try Ruby's begin/ensure emits", () => {
    expect(foldSkeletonTokens(["ref:rbEnsure", "ref:block"], "ts", ["try", "ref:block"])).toEqual([
      "try",
      "ref:block",
    ]);
  });

  it("folds Ruby's `loop do … end` onto the loop its `for (;;)` port emits", () => {
    const ruby = ["try", "ref:loop", "ref:wait", "if", "ref:remove"];
    const ts = ["try", "loop", "ref:wait", "if", "ref:remove"];

    expect(foldSkeletonTokens(ruby, "ruby", ts)).toEqual(foldSkeletonTokens(ts, "ts", ruby));
  });

  it("matches Ruby `xs.each { |x| save(x) }` against its `for (const x of xs) this.save(x)` port", () => {
    const ruby = ["ref:each", "ref:save"];
    const ts = ["loop", "ref:save"];

    expect(foldSkeletonTokens(ruby)).toEqual(foldSkeletonTokens(ts));
  });

  it("reads an awaiting collect loop as the `map` or the pushing `each` Ruby spells", () => {
    const ts = ["loop:collect", "ref:clause"];

    expect(foldSkeletonTokens(ts, "ts", ["ref:map", "ref:clause"])).toEqual([
      "ref:map",
      "ref:clause",
    ]);
    expect(foldSkeletonTokens(ts, "ts", ["ref:each", "ref:clause"])).toEqual([
      "loop",
      "ref:clause",
    ]);
    expect(foldSkeletonTokens(["loop", ...ts], "ts", ["ref:each", "ref:map"])).toEqual([
      "loop",
      "ref:map",
      "ref:clause",
    ]);
    expect(foldSkeletonTokens(ts, "ts")).toEqual(["loop", "ref:clause"]);
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

  it("folds the each-family call form a port keeps, so `eachKey(hash, block)` reads as each_key's loop", () => {
    const ruby = foldSkeletonTokens(["ref:values", "ref:each_key", "ref:get"]);
    const ts = foldSkeletonTokens(["ref:eachKey", "ref:values", "ref:getAttribute"], "ts");

    expect(ruby.filter((t) => t === "loop")).toEqual(ts.filter((t) => t === "loop"));
    expect(foldSkeletonTokens(["ref:eachValue", "ref:eachPair"], "ts")).toEqual(["loop", "loop"]);
    expect(foldSkeletonTokens(["ref:eachKey"], "ruby")).toEqual(["ref:eachKey"]);
  });

  it("reads the idiom table on the Ruby side only, so a TS `concat` is not a loop", () => {
    expect(foldSkeletonTokens(["ref:concat"], "ts")).toEqual(["ref:concat"]);
    expect(foldSkeletonTokens(["ref:concat"], "ruby", ["loop", "ref:push"])).toEqual(["loop"]);
  });

  it("reads Ruby's `x || raise` as the `if (!x) throw` its port is forced to spell", () => {
    const ruby = ["ref:detect", "or", "throw:ActiveRecordError"];
    const ts = ["ref:find", "if", "throw:ActiveRecordError"];
    expect(foldSkeletonTokens(ruby, "ruby", ts)).toEqual([
      "ref:detect",
      "if",
      "throw:ActiveRecordError",
    ]);
    expect(foldSkeletonTokens(["or", "throw"], "ruby", ["if", "throw"])).toEqual(["if", "throw"]);
  });

  it("keeps the `or` of `x || raise` when the counterpart has no if left to claim", () => {
    const ruby = ["if", "or", "throw:ArgumentError"];
    expect(foldSkeletonTokens(ruby, "ruby", ["if", "or", "throw:ArgumentError"])).toEqual(ruby);
    expect(foldSkeletonTokens(["or", "throw:ArgumentError"])).toEqual([
      "or",
      "throw:ArgumentError",
    ]);
    expect(foldSkeletonTokens(["or", "ref:save"], "ruby", ["if", "ref:save"])).toEqual([
      "or",
      "ref:save",
    ]);
  });

  it("cannot hide an if the TS side dropped: the two folded streams still disagree", () => {
    const ruby = foldSkeletonTokens(["ref:filter_map", "if", "ref:save"], "ruby", [
      "loop",
      "if",
      "ref:save",
    ]);
    const ts = foldSkeletonTokens(["loop", "if", "ref:save"], "ts");
    expect(ruby).not.toEqual(ts);
  });

  it("credits an idiom only the control tokens the Ruby stream does not already claim", () => {
    const ts = ["ref:isArray", "ref:filter", "if", "ref:find", "if", "ref:filter"];
    expect(
      foldSkeletonTokens(["ref:compact", "ref:uniq", "if", "ref:detect", "if"], "ruby", ts),
    ).toEqual(["if", "ref:detect", "if"]);
    expect(foldSkeletonTokens(["ref:uniq", "ref:uniq"], "ruby", ["if"])).toEqual(["if"]);
    expect(
      foldSkeletonTokens(["ref:each", "ref:save", "ref:delete_if"], "ruby", ["loop", "if"]),
    ).toEqual(["loop", "ref:save"]);
  });

  it("credits one of two identical idioms when the counterpart shows one surplus arm", () => {
    expect(foldSkeletonTokens(["ref:compact", "ref:compact"], "ruby", ["if"])).toEqual(["if"]);
    expect(
      foldSkeletonTokens(["ref:filter_map", "ref:filter_map"], "ruby", ["loop", "if"]),
    ).toEqual(["loop", "if"]);
  });

  it("spends the counterpart's loop on JS_ITERATION_CALLEE (`forEach`) before an idiom can claim it", () => {
    expect(
      foldSkeletonTokens(["ref:forEach", "ref:save", "ref:filter_map"], "ruby", ["loop", "if"]),
    ).toEqual(["loop", "ref:save"]);
  });

  it("folds a TS `each` call onto the loop Ruby's `each` folds onto", () => {
    expect(foldSkeletonTokens(["ref:join_root", "ref:each"])).toEqual(["ref:join_root", "loop"]);
    expect(foldSkeletonTokens(["ref:joinRoot", "ref:each"], "ts")).toEqual([
      "ref:joinRoot",
      "loop",
    ]);
  });

  it("folds a block `scan` onto the `for … of matchAll` loop its port spells, and a blockless one onto nothing", () => {
    expect(foldSkeletonTokens(["ref:scan", "ref:call"], "ruby", ["loop", "ref:matchAll"])).toEqual([
      "loop",
      "ref:call",
    ]);
    expect(foldSkeletonTokens(["ref:scan"], "ruby", ["ref:matchAll"])).toEqual([]);
  });

  it("folds `Set#subtract` onto the `delete` loop its port spells, and onto nothing without one", () => {
    expect(
      foldSkeletonTokens(["ref:subtract", "ref:keys"], "ruby", ["loop", "ref:keys", "ref:delete"]),
    ).toEqual(["loop", "ref:keys"]);
    expect(foldSkeletonTokens(["ref:subtract"], "ruby", ["ref:difference"])).toEqual([]);
    expect(foldSkeletonTokens(["ref:subtract"], "ts")).toEqual(["ref:subtract"]);
  });

  it("folds a block `each_slice` onto the `for … of eachSlice` loop its port spells, and a blockless one onto nothing", () => {
    expect(
      foldSkeletonTokens(["ref:each_slice", "ref:enqueue"], "ruby", ["loop", "ref:eachSlice"]),
    ).toEqual(["loop", "ref:enqueue"]);
    expect(foldSkeletonTokens(["ref:each_slice"], "ruby", ["ref:eachSlice"])).toEqual([]);
  });

  it("spends a single-lowering idiom once, leaving the loops later idioms are owed", () => {
    expect(
      foldSkeletonTokens(["ref:each_with_index", "ref:save", "ref:scan", "ref:scan"], "ruby", [
        "loop",
        "loop",
        "loop",
      ]),
    ).toEqual(["loop", "ref:save", "loop", "loop"]);
  });

  it("reads a nil-guard conditional as `and` unless the Ruby stream still shows an unclaimed `if`", () => {
    const ts = ["ref:super", "if:nil-guard", "new:SqlLiteral"];
    expect(foldSkeletonTokens(ts, "ts", ["ref:super", "and", "new:SqlLiteral"])).toEqual([
      "ref:super",
      "and",
      "new:SqlLiteral",
    ]);
    expect(foldSkeletonTokens(ts, "ts", ["ref:super", "if", "new:SqlLiteral"])).toEqual([
      "ref:super",
      "if",
      "new:SqlLiteral",
    ]);
    expect(foldSkeletonTokens(["if", "if:nil-guard"], "ts", ["if"])).toEqual(["if", "and"]);
    expect(foldSkeletonTokens(ts, "ts")).toEqual(["ref:super", "if", "new:SqlLiteral"]);
  });

  it("drops a retry loop unless the Ruby stream still shows an unclaimed `loop`", () => {
    const ts = ["loop:retry", "try", "ref:send", "rescue"];
    expect(foldSkeletonTokens(ts, "ts", ["try", "ref:send", "rescue"])).toEqual([
      "try",
      "ref:send",
      "rescue",
    ]);
    expect(foldSkeletonTokens(ts, "ts", ["loop", "try", "ref:send", "rescue"])).toEqual([
      "loop",
      "try",
      "ref:send",
      "rescue",
    ]);
    expect(foldSkeletonTokens(ts, "ts")).toEqual(["loop", "try", "ref:send", "rescue"]);
  });

  it("reads a blockless each_with_index chained into map as no loop of its own", () => {
    expect(foldSkeletonTokens(["ref:each_with_index", "ref:map", "new:Column"], "ruby")).toEqual([
      "ref:map",
      "new:Column",
    ]);
    expect(foldSkeletonTokens(["ref:each_with_index", "ref:save"], "ruby")).toEqual([
      "loop",
      "ref:save",
    ]);
  });

  describe("short-circuit marks", () => {
    it("credits an instanceof narrowing a class-equality test on the same operand", () => {
      const ruby = ["ref:class", "ref:class", "and", "ref:left", "ref:left", "and", "ref:right"];
      const ts = [
        "and:class-narrow",
        "ref:constructor",
        "ref:constructor",
        "and",
        "ref:rbEqual",
        "and",
        "ref:rbEqual",
      ];
      expect(shortCircuitsAgree(ruby, ts)).toBe(true);
      expect(
        shortCircuitsAgree(
          ruby,
          ts.map((t) => (t === "and:class-narrow" ? "and" : t)),
        ),
      ).toBe(false);
    });

    it("reads a narrowing `&&` as `and` while the Ruby stream still shows an unclaimed one", () => {
      expect(foldSkeletonTokens(["and:class-narrow"], "ts", ["and"])).toEqual(["and"]);
      expect(foldSkeletonTokens(["and:class-narrow"], "ts", [])).toEqual([]);
      expect(foldSkeletonTokens(["and:class-narrow"], "ts")).toEqual(["and"]);
    });

    it("credits a type-test `||` chain against a when list of the same arity", () => {
      const ruby = ["if", "when:6", "if", "new:Casted", "new:Quoted"];
      expect(shortCircuitsAgree(ruby, ["if", "when:6", "if", "new:Casted", "new:Quoted"])).toBe(
        true,
      );
      expect(foldSkeletonTokens(["when:6"], "ts", ["when:6"])).toEqual([]);
    });

    it("reads an unmatched type-test chain as the `or`s it spells", () => {
      expect(foldSkeletonTokens(["when:3"], "ts", ["when:2"])).toEqual(["or", "or"]);
      expect(foldSkeletonTokens(["when:3"], "ts")).toEqual(["or", "or"]);
      expect(shortCircuitsAgree(["if", "when:3"], ["if", "when:2"])).toBe(false);
    });

    it("drops the Ruby when-list mark, which no other lowering of the clause carries", () => {
      expect(
        foldSkeletonTokens(["if", "when:4", "ref:sized"], "ruby", ["if", "ref:sized"]),
      ).toEqual(["if", "ref:sized"]);
    });

    it('credits a SqlLiteral test beside `typeof x === "string"` against Ruby\'s String arm', () => {
      const ruby = ["if", "when:2"];
      expect(shortCircuitsAgree(ruby, ["if", "or:string-subclass", "when:2"])).toBe(true);
      expect(shortCircuitsAgree(ruby, ["if", "or:string-subclass"])).toBe(true);
    });

    it('credits Ruby\'s `String === x || Symbol === x` against one `typeof x === "string"`', () => {
      const ruby = ["ref:map", "or:string-symbol", "new:SqlLiteral", "ref:to_s"];
      expect(shortCircuitsAgree(ruby, ["ref:map", "if", "new:SqlLiteral"])).toBe(true);
      expect(foldSkeletonTokens(["or:string-symbol"], "ruby", ["or"])).toEqual(["or"]);
      expect(foldSkeletonTokens(["or:string-symbol"], "ruby")).toEqual(["or"]);
    });

    it('credits `typeof x === "string" && !isSymbol(x)` against Ruby\'s `String === x`', () => {
      const ruby = ["loop", "if", "new:SqlLiteral", "if", "new:SqlLiteral", "ref:to_s"];
      const ts = ["loop", "if", "and:string-not-symbol", "ref:isSymbol", "new:SqlLiteral", "if"];
      expect(shortCircuitsAgree(ruby, ts)).toBe(true);
    });
  });
});
