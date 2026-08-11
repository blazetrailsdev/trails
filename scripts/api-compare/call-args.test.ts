import { describe, it, expect } from "vitest";
import type { CallSite, ParamInfo } from "@blazetrails/parity/types";
import { compareCallArgs, normalizeArg, normalizeArgs, pairCallSites } from "./call-args.js";

function site(name: string, args: string[], flags: string[] = []): CallSite {
  return { name, args, flags };
}

describe("normalizeArg", () => {
  it("camelizes identifiers", () => {
    expect(normalizeArg("id:join_str")).toBe("ref:joinStr");
  });

  it("collapses id: and call: into one ref: bucket", () => {
    expect(normalizeArg("call:table_name")).toBe(normalizeArg("id:table_name"));
  });

  it("reads Ruby new as constructor", () => {
    expect(normalizeArg("call:new")).toBe("ref:constructor");
    expect(normalizeArg("call:constructor")).toBe("ref:constructor");
  });

  it("reads Ruby self as this", () => {
    expect(normalizeArg("id:self")).toBe("ref:this");
  });

  it("strips a Ruby ivar sigil", () => {
    expect(normalizeArg("id:@ast")).toBe(normalizeArg("id:ast"));
  });

  it("keeps a name that merely starts with is", () => {
    expect(normalizeArg("id:is_valid")).toBe("ref:isValid");
    expect(normalizeArg("id:isolation_level")).toBe("ref:isolationLevel");
  });

  it("spells a symbol as its JS string", () => {
    expect(normalizeArg("sym:dump")).toBe("str:dump");
  });

  it("compares the colon-kept symbol spelling equal to the bare one", () => {
    expect(normalizeArg("str::dump")).toBe(normalizeArg("sym:dump"));
  });

  it("camelizes an identifier-shaped string", () => {
    expect(normalizeArg("str:join_str")).toBe("str:joinStr");
  });

  it("compares a non-identifier string byte-for-byte", () => {
    expect(normalizeArg("str: GROUP BY ")).toBe("str: GROUP BY ");
    expect(normalizeArg("str:AND ")).toBe("str:AND ");
  });

  it("canonicalizes an escape through literals.ts", () => {
    expect(normalizeArg("str:\\n")).toBe(normalizeArg("str:\n"));
  });

  it("normalizes numbers through one numeric key", () => {
    expect(normalizeArg("num:1.0")).toBe("num:1");
    expect(normalizeArg("num:1_000")).toBe("num:1000");
  });

  it("passes booleans, nil and constants through", () => {
    expect(normalizeArg("bool:true")).toBe("bool:true");
    expect(normalizeArg("nil")).toBe("nil");
    expect(normalizeArg("const:Arel")).toBe("const:Arel");
  });

  it("normalizes kwargs keys and values, order-insensitively", () => {
    expect(normalizeArg("kwargs{inverse_of=sym:posts,auto_include=bool:true}")).toBe(
      normalizeArg("kwargs{autoInclude=bool:true,inverseOf=str:posts}"),
    );
  });

  it("normalizes a kwarg key through the option-key renames", () => {
    expect(normalizeArg("kwargs{constructor=id:klass}")).toBe(
      normalizeArg("kwargs{constructorFn=id:klass}"),
    );
  });

  it("is uncomparable for a numeric token it cannot parse", () => {
    expect(normalizeArg("num:123n")).toBeNull();
  });

  it("is uncomparable for an opaque descriptor", () => {
    for (const opaque of ["?", "array", "hash", "str-interp", "ternary", "binop:+", "unaryid:x"]) {
      expect(normalizeArg(opaque)).toBeNull();
    }
  });

  it("is uncomparable for an opaque descriptor nested inside kwargs", () => {
    expect(normalizeArg("kwargs{scope=?}")).toBeNull();
    expect(normalizeArg("kwargs{on=array}")).toBeNull();
    expect(normalizeArg("kwargs{opts=kwargs{k=str-interp}}")).toBeNull();
  });

  it("unescapes a descriptor delimiter inside a string value", () => {
    expect(normalizeArg("str:%2C ")).toBe("str:, ");
    expect(normalizeArg("str:a%3Db%7Bc%7Dd")).toBe("str:a=b{c}d");
    expect(normalizeArg("str:100%25")).toBe("str:100%");
  });

  it("splits kwargs on the delimiters a string value does not carry", () => {
    expect(normalizeArg("kwargs{last_word_connector=str:%2C or ,sep=str:a%3Db%7Bc%7Dd}")).toBe(
      "kwargs{lastWordConnector=str:, or ,sep=str:a=b{c}d}",
    );
  });

  it("is uncomparable for a double-splat kwarg", () => {
    expect(normalizeArg("kwargs{**splat}")).toBeNull();
  });
});

describe("normalizeArgs", () => {
  it("is uncomparable when any member is opaque", () => {
    expect(normalizeArgs(["id:x", "?"])).toBeNull();
    expect(normalizeArgs(["id:x", "sym:foo"])).toEqual(["ref:x", "str:foo"]);
  });
});

describe("compareCallArgs block-tail nil padding", () => {
  const optional = (name: string): ParamInfo => ({ name, kind: "optional", default: "..." });
  const required = (name: string): ParamInfo => ({ name, kind: "required" });
  // sqlite3_adapter.rb:561 `alter_table(table_name, foreign_keys = …,
  // check_constraints = …, **options)`, called as `alter_table(t) do |d| … end`.
  const rubyCall = site("alter_table", ["id:table_name"], ["block"]);
  const tsCall = site("alterTable", ["id:tableName", "nil", "nil", "nil"], ["block"]);
  const sig = [
    required("tableName"),
    optional("overrideForeignKeys"),
    optional("overrideCheckConstraints"),
    optional("options"),
    optional("block"),
  ];

  it("ignores the padding when the callee defaults every padded parameter", () => {
    expect(compareCallArgs(rubyCall, tsCall, [sig]).verdict).toBe("match");
  });

  it("still flags the padding when the callee treats a padded parameter as a value", () => {
    const valued = [...sig];
    valued[2] = required("overrideCheckConstraints");
    expect(compareCallArgs(rubyCall, tsCall, [valued]).verdict).toBe("mismatch");
  });

  it("does not fire without a callee signature to prove the padding inert", () => {
    expect(compareCallArgs(rubyCall, tsCall).verdict).toBe("mismatch");
  });

  it("does not fire when neither side carries a block", () => {
    expect(
      compareCallArgs(
        site("alter_table", ["id:table_name"]),
        site("alterTable", ["id:tableName", "nil"]),
        [sig],
      ).verdict,
    ).toBe("mismatch");
  });

  it("does not fire on a nil Rails itself passes in the middle of the list", () => {
    expect(
      compareCallArgs(
        site("alter_table", ["id:table_name"], ["block"]),
        site("alterTable", ["id:tableName", "nil", "id:options"], ["block"]),
        [sig],
      ).verdict,
    ).toBe("mismatch");
  });

  it("looks past a leading this receiver on a mixin signature", () => {
    expect(compareCallArgs(rubyCall, tsCall, [[required("this"), ...sig]]).verdict).toBe("match");
  });
});

describe("compareCallArgs", () => {
  it("matches identical argument lists across the naming pipeline", () => {
    expect(
      compareCallArgs(
        site("visit", ["id:o", "id:collector"]),
        site("visit", ["id:o", "id:collector"]),
      ).verdict,
    ).toBe("match");
    expect(
      compareCallArgs(
        site("infix_value", ["id:o", "id:join_str"]),
        site("infixValue", ["id:o", "id:joinStr"]),
      ).verdict,
    ).toBe("match");
  });

  it("flags a reordered argument list as shape", () => {
    const result = compareCallArgs(
      site("inject_join", ["id:list", "id:collector", "str: AND "]),
      site("injectJoin", ["id:list", "str: AND ", "id:collector"]),
    );
    expect(result.verdict).toBe("mismatch");
    expect(result.class).toBe("shape");
  });

  it("flags a differing argument count as shape", () => {
    const result = compareCallArgs(
      site("quote_table_name", ["id:name"]),
      site("quoteTableName", []),
    );
    expect(result.verdict).toBe("mismatch");
    expect(result.class).toBe("shape");
  });

  it("flags a changed literal as shape", () => {
    const result = compareCallArgs(
      site("assert_valid_value", ["id:object", "kwargs{action=sym:dump}"]),
      site("assertValidValue", ["id:object", "kwargs{action=str:load}"]),
    );
    expect(result.verdict).toBe("mismatch");
    expect(result.class).toBe("shape");
  });

  it("flags a changed kwarg key as shape", () => {
    const result = compareCallArgs(
      site("build", ["kwargs{inverse_of=id:reflection}"]),
      site("build", ["kwargs{inverse=id:reflection}"]),
    );
    expect(result.verdict).toBe("mismatch");
    expect(result.class).toBe("shape");
  });

  it("matches a predicate against either candidate spelling", () => {
    for (const ts of ["isAbleToTypeCast", "ableToTypeCast"]) {
      expect(
        compareCallArgs(site("visit", ["call:able_to_type_cast?"]), site("visit", [`call:${ts}`]))
          .verdict,
      ).toBe("match");
    }
    expect(
      compareCallArgs(site("save", ["call:save!"]), site("save", ["call:saveBang"])).verdict,
    ).toBe("match");
  });

  it("does not match an is_ predicate to the doubled isIs spelling", () => {
    expect(
      compareCallArgs(site("check", ["call:is_number?"]), site("check", ["call:isIsNumber"]))
        .verdict,
    ).toBe("mismatch");
    expect(
      compareCallArgs(site("check", ["call:is_number?"]), site("check", ["call:isNumber"])).verdict,
    ).toBe("match");
  });

  it("does not hide a rename of a non-predicate is_ identifier", () => {
    const result = compareCallArgs(site("check", ["id:is_valid"]), site("check", ["id:valid"]));
    expect(result.verdict).toBe("mismatch");
    expect(result.class).toBe("naming");
  });

  it("flags a renamed identifier as naming", () => {
    const result = compareCallArgs(
      site("visit", ["id:o", "id:collector"]),
      site("visit", ["id:node", "id:collector"]),
    );
    expect(result.verdict).toBe("mismatch");
    expect(result.class).toBe("naming");
  });

  it("flags a reordering of the same identifiers as shape, not naming", () => {
    const result = compareCallArgs(
      site("inject_join", ["id:nodes", "id:collector", "id:connector"]),
      site("injectJoin", ["id:nodes", "id:connector", "id:collector"]),
    );
    expect(result.verdict).toBe("mismatch");
    expect(result.class).toBe("shape");
  });

  it("skips a splat on either side", () => {
    expect(
      compareCallArgs(site("build", ["*splat"], ["splat"]), site("build", ["id:x"])).verdict,
    ).toBe("skip");
    expect(
      compareCallArgs(site("build", ["id:x"]), site("build", ["*splat"], ["splat"])).verdict,
    ).toBe("skip");
  });

  it("skips a block-pass", () => {
    expect(
      compareCallArgs(site("map", ["id:x"], ["blockpass"]), site("map", ["id:y"])).verdict,
    ).toBe("skip");
  });

  it("skips a zsuper", () => {
    expect(compareCallArgs(site("super", [], ["zsuper"]), site("super", [])).verdict).toBe("skip");
  });

  it("skips super", () => {
    expect(compareCallArgs(site("super", ["id:x"]), site("super", ["id:y"])).verdict).toBe("skip");
  });

  it("skips a NO_JS_CALL_FORM name", () => {
    expect(compareCallArgs(site("to_s", ["id:x"]), site("to_s", ["id:y"])).verdict).toBe("skip");
    expect(compareCallArgs(site("present?", ["id:x"]), site("present?", ["id:y"])).verdict).toBe(
      "skip",
    );
  });

  it("skips an Enumerable idiom", () => {
    expect(compareCallArgs(site("detect", ["id:x"]), site("find", ["id:y"])).verdict).toBe("skip");
  });

  it("skips a site with an opaque argument", () => {
    expect(compareCallArgs(site("where", ["hash"]), site("where", ["hash"])).verdict).toBe("skip");
  });

  it("reports the skip reason for an excluded call name", () => {
    expect(compareCallArgs(site("super", ["id:x"]), site("super", ["id:y"])).reason).toBe(
      "excludedCallName",
    );
    expect(compareCallArgs(site("to_s", ["id:x"]), site("to_s", ["id:y"])).reason).toBe(
      "excludedCallName",
    );
  });

  it("reports the skip reason for an uncomparable flag", () => {
    expect(
      compareCallArgs(site("build", ["*splat"], ["splat"]), site("build", ["id:x"])).reason,
    ).toBe("uncomparableFlag");
  });

  it("reports the skip reason for an opaque Ruby argument", () => {
    expect(compareCallArgs(site("where", ["hash"]), site("where", ["id:x"])).reason).toBe(
      "opaqueRubyArg",
    );
  });

  it("reports the skip reason for an opaque TS argument", () => {
    expect(compareCallArgs(site("where", ["id:x"]), site("where", ["hash"])).reason).toBe(
      "opaqueTsArg",
    );
  });

  it("reports the skip reason for an unparseable literal", () => {
    expect(compareCallArgs(site("limit", ["num:1"]), site("limit", ["num:123n"])).reason).toBe(
      "unparseableLiteral",
    );
  });

  it("carries no skip reason on a match or a mismatch", () => {
    expect(
      compareCallArgs(site("visit", ["id:o"]), site("visit", ["id:o"])).reason,
    ).toBeUndefined();
    expect(
      compareCallArgs(site("visit", ["id:o"]), site("visit", ["id:o", "id:x"])).reason,
    ).toBeUndefined();
  });

  it("compares the non-block arguments of a block-flagged site", () => {
    expect(
      compareCallArgs(
        site("inject_join", ["id:list"], ["block"]),
        site("injectJoin", ["id:list"], ["block"]),
      ).verdict,
    ).toBe("match");
  });

  it("drops the leading this-mixin receiver the port adds", () => {
    expect(
      compareCallArgs(
        site("delete_through_records", ["id:records"]),
        site("deleteThroughRecords", ["id:this", "id:records"]),
      ).verdict,
    ).toBe("match");
  });

  it("keeps a genuine extra argument visible", () => {
    const result = compareCallArgs(
      site("delete_through_records", ["id:records"]),
      site("deleteThroughRecords", ["id:this", "id:records", "id:method"]),
    );
    expect(result.verdict).toBe("mismatch");
    expect(result.class).toBe("shape");
  });

  it("resolves __callee__ to the enclosing method name the port passes", () => {
    expect(
      compareCallArgs(
        site("check_if_method_has_arguments!", ["id:__callee__", "id:args"]),
        site("checkIfMethodHasArgumentsBang", ["str:eager_load", "id:args"]),
        "eager_load",
      ).verdict,
    ).toBe("match");
    expect(
      compareCallArgs(
        site("check_if_method_has_arguments!", ["id:__callee__", "id:args"]),
        site("checkIfMethodHasArgumentsBang", ["str:eagerLoad", "id:args"]),
        "eager_load",
      ).verdict,
    ).toBe("match");
  });

  it("resolves __method__ the same way, and accepts a symbol or identifier spelling", () => {
    expect(
      compareCallArgs(
        site("send", ["id:__method__"]),
        site("send", ["sym:optimizer_hints"]),
        "optimizer_hints",
      ).verdict,
    ).toBe("match");
    expect(
      compareCallArgs(
        site("send", ["id:__method__"]),
        site("send", ["id:optimizerHints"]),
        "optimizer_hints",
      ).verdict,
    ).toBe("match");
  });

  it("still flags a port that passes some OTHER method's name", () => {
    const result = compareCallArgs(
      site("check_if_method_has_arguments!", ["id:__callee__", "id:args"]),
      site("checkIfMethodHasArgumentsBang", ["str:preload", "id:args"]),
      "eager_load",
    );
    expect(result.verdict).toBe("mismatch");
    expect(result.class).toBe("shape");
    expect(result.rubyArgs).toEqual(["ref:__callee__", "ref:args"]);
  });

  it("leaves __callee__ unresolved when the enclosing method is unknown", () => {
    expect(
      compareCallArgs(
        site("check_if_method_has_arguments!", ["id:__callee__"]),
        site("checkIfMethodHasArgumentsBang", ["str:eager_load"]),
      ).verdict,
    ).toBe("mismatch");
  });

  it("reports the normalized lists on a mismatch", () => {
    const result = compareCallArgs(site("visit", ["id:o"]), site("visit", ["id:node"]));
    expect(result.rubyArgs).toEqual(["ref:o"]);
    expect(result.tsArgs).toEqual(["ref:node"]);
  });
});

describe("pairCallSites", () => {
  it("falls back to source order when the argument lists cannot tell the sites apart", () => {
    const pairs = pairCallSites(
      [site("visit", ["id:o"]), site("visit", ["id:x"])],
      [site("visit", ["id:node"]), site("visit", ["id:n"])],
    );
    expect(pairs.map((p) => p.ts.args)).toEqual([["id:node"], ["id:n"]]);
  });

  it("pairs same-named sites by argument agreement, not source order", () => {
    const pairs = pairCallSites(
      [site("new", ["id:table_name", "id:options"])],
      [site("constructor", ["str:0.0.0"]), site("constructor", ["id:tableName", "id:options"])],
    );
    expect(pairs.map((p) => p.ts.args)).toEqual([["id:tableName", "id:options"]]);
  });

  it("prefers an exact agreement over a longer partial one", () => {
    const pairs = pairCallSites(
      [site("visit", ["id:o"])],
      [site("visit", ["id:o", "id:collector"]), site("visit", ["id:o"])],
    );
    expect(pairs.map((p) => p.ts.args)).toEqual([["id:o"]]);
  });

  it("pairs a Ruby site whose receiver-less arity differs against the site that matches it", () => {
    // through_association.rb:13 `loaded?(owner)` vs :20 `…association(…).loaded?`
    // — one TS site, and the 1-argument Ruby occurrence is its counterpart.
    const pairs = pairCallSites(
      [site("loaded?", []), site("loaded?", ["id:owner"])],
      [site("loaded", ["id:owner"])],
    );
    expect(pairs.map((p) => p.ruby.args)).toEqual([["id:owner"]]);
  });

  it("scores an opaque list on its arity alone rather than dropping it", () => {
    const pairs = pairCallSites(
      [site("visit", ["id:o", "hash"])],
      [site("visit", ["id:o"]), site("visit", ["id:o", "hash"])],
    );
    expect(pairs.map((p) => p.ts.args)).toEqual([["id:o", "hash"]]);
  });

  it("camelizes the Ruby call name to find its TS site", () => {
    const pairs = pairCallSites(
      [site("inject_join", ["id:list"])],
      [site("injectJoin", ["id:list"])],
    );
    expect(pairs).toHaveLength(1);
  });

  it("pairs Ruby new against the TS constructor site", () => {
    const pairs = pairCallSites([site("new", ["id:o"])], [site("constructor", ["id:o"])]);
    expect(pairs).toHaveLength(1);
  });

  it("pairs a predicate against the TS spelling the port chose", () => {
    expect(pairCallSites([site("empty?", [])], [site("isEmpty", [])])).toHaveLength(1);
    expect(pairCallSites([site("empty?", [])], [site("empty", [])])).toHaveLength(1);
  });

  it("drops a Ruby site the TS body never makes", () => {
    expect(pairCallSites([site("visit", ["id:o"])], [])).toEqual([]);
  });

  it("does not reuse one TS site for two Ruby sites", () => {
    const pairs = pairCallSites(
      [site("visit", ["id:o"]), site("visit", ["id:x"])],
      [site("visit", ["id:node"])],
    );
    expect(pairs).toHaveLength(1);
  });
});
