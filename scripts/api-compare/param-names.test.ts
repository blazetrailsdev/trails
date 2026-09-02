import { describe, it, expect } from "vitest";
import {
  bareIdentifier,
  compareParamNames,
  isNestedConstructorHomonym,
  matchParamNamesAgainst,
} from "./param-names.js";
import type { ParamInfo } from "@blazetrails/parity/types";

const req = (name: string, type?: string): ParamInfo => ({ name, kind: "required", type });
const opt = (name: string): ParamInfo => ({ name, kind: "optional", default: "…" });
const rest = (name: string): ParamInfo => ({ name, kind: "rest" });
const kwopt = (name: string): ParamInfo => ({ name, kind: "keyword", default: "…" });
const kwrest = (name: string): ParamInfo => ({ name, kind: "keyword_rest" });
const blk = (name: string): ParamInfo => ({ name, kind: "block" });

describe("compareParamNames", () => {
  it("flags a renamed parameter", () => {
    // arel/factory_methods.rb:49 `cast(name, type)` ported as `cast(expr, type)`.
    expect(compareParamNames([req("name"), req("type")], [req("expr"), req("type")])).toEqual([
      { position: 0, ruby: "name", ts: "expr" },
    ]);
  });

  it("accepts the camelCased Rails identifier", () => {
    // arel/nodes/join_source.rb:9 `initialize(single_source, joinop = [])`.
    expect(
      compareParamNames(
        [req("single_source"), opt("joinop")],
        [req("singleSource"), opt("joinop")],
      ),
    ).toEqual([]);
  });

  it("does not flag a Ruby name TypeScript reserves", () => {
    expect(compareParamNames([req("default")], [req("defaultValue")])).toEqual([]);
    // schema_definitions.rb `column(name, type, index: nil, **options)` — `null`
    // is not a valid binding identifier, so the port spells it `null_`.
    expect(compareParamNames([req("null")], [req("null_")])).toEqual([]);
    // …and `klass`, the substitute Rails itself uses for the same clash.
    expect(compareParamNames([req("class")], [req("klass")])).toEqual([]);
  });

  it("still flags a reserved Ruby name ported as a free rename", () => {
    // The exemption is for a workaround, not a licence: the TS name has to keep
    // the word it cannot spell, or be the settled substitute for it.
    expect(compareParamNames([req("default")], [req("fallback")])).toEqual([
      { position: 0, ruby: "default", ts: "fallback" },
    ]);
  });

  it("does not flag a splat collapsed into an options object", () => {
    expect(compareParamNames([req("sql"), rest("binds")], [req("sql"), req("options")])).toEqual(
      [],
    );
  });

  it("does not flag a kwarg group collapsed into an options object", () => {
    expect(
      compareParamNames([req("string"), kwopt("retryable")], [req("string"), req("options")]),
    ).toEqual([]);
    expect(compareParamNames([req("sql"), kwrest("opts")], [req("sql"), req("options")])).toEqual(
      [],
    );
  });

  it("does not flag a MULTI-kwarg group collapsed into one options object", () => {
    // abstract_adapter.rb:983 `with_raw_connection(allow_retry: false,
    // materialize_transactions: true)` + block, ported as
    // `withRawConnection(options, block)`: the two kwargs share one slot, so the
    // second one has no TS position to be renamed at.
    expect(
      compareParamNames(
        [kwopt("allow_retry"), kwopt("materialize_transactions")],
        [req("options"), req("block")],
      ),
    ).toEqual([]);
  });

  it("still flags a rename under the collapsed kwarg form", () => {
    expect(
      compareParamNames(
        [kwopt("allow_retry"), kwopt("materialize_transactions")],
        [req("adapterOpts"), req("block")],
      ),
    ).toEqual([{ position: 0, ruby: "options", ts: "adapterOpts" }]);
  });

  it("skips a `this:` receiver parameter", () => {
    expect(compareParamNames([req("value")], [req("this"), req("value")])).toEqual([]);
  });

  it("skips a leading explicit-receiver parameter", () => {
    expect(compareParamNames([req("value")], [req("relation", "Relation"), req("value")])).toEqual(
      [],
    );
  });

  it("does not read a rename off a RECEIVER-stripped form", () => {
    // relation.rb:125 `Relation#new(attributes, &block)` — aliased `build` on
    // :133, so the conventions score the alias a second time against a
    // constructor, and the only candidate that lines up is
    // `ExplainProxy#initialize(relation, options)` (relation.rb:7) minus its
    // receiver. Both signatures spell their own Rails identifiers.
    expect(
      compareParamNames([req("attributes")], [req("relation", "Relation"), req("options")]),
    ).toEqual([]);
    expect(
      matchParamNamesAgainst([req("attributes")], [[req("relation", "Relation"), req("options")]]),
    ).toEqual({ aligned: false, rows: [] });
  });

  it("skips a trailing callback ported from a bare yield", () => {
    expect(compareParamNames([req("value")], [req("value"), req("block")])).toEqual([]);
  });

  it("excludes a Ruby block parameter from the aligned positions", () => {
    expect(compareParamNames([req("value"), blk("block")], [req("value")])).toEqual([]);
  });

  it("reports nothing when no form lines up — that is arity's finding", () => {
    expect(compareParamNames([req("a"), req("b")], [req("z")])).toEqual([]);
  });

  it("reports every differing position", () => {
    expect(compareParamNames([req("left"), req("right")], [req("a"), req("b")])).toEqual([
      { position: 0, ruby: "left", ts: "a" },
      { position: 1, ruby: "right", ts: "b" },
    ]);
  });
});

describe("bareIdentifier", () => {
  it("strips the intentionally-unused underscore prefix on either side", () => {
    expect(bareIdentifier("__value")).toBe("value");
    expect(compareParamNames([req("value")], [req("_value")])).toEqual([]);
    // dirty.rb spells the Ruby param `_new_value_before_type_cast`.
    expect(compareParamNames([req("_new_value")], [req("newValue")])).toEqual([]);
  });
});

describe("matchParamNamesAgainst", () => {
  it("is clean when ANY candidate spells the Rails identifiers", () => {
    expect(matchParamNamesAgainst([req("name")], [[req("expr")], [req("name")]])).toEqual({
      aligned: true,
      rows: [],
    });
  });

  it("ignores a candidate that lines up under no form", () => {
    // A 0-arg re-export binding sharing the name must not clear the rename on
    // the real implementation beside it.
    const verdict = matchParamNamesAgainst([req("name")], [[], [req("expr")]]);
    expect(verdict).toEqual({ aligned: true, rows: [{ position: 0, ruby: "name", ts: "expr" }] });
  });

  it("reports the candidate with the fewest differing positions", () => {
    const verdict = matchParamNamesAgainst(
      [req("left"), req("right")],
      [
        [req("a"), req("b")],
        [req("left"), req("b")],
      ],
    );
    expect(verdict.rows).toEqual([{ position: 1, ruby: "right", ts: "b" }]);
  });

  it("is unaligned when no candidate lines up at all", () => {
    expect(matchParamNamesAgainst([req("a"), req("b")], [[req("z")]])).toEqual({
      aligned: false,
      rows: [],
    });
  });
});

describe("positions with no identifier to compare", () => {
  it("does not flag a Ruby anonymous splat or a TS destructured parameter", () => {
    expect(
      compareParamNames([{ name: "**", kind: "keyword_rest" }], [req("constraintName")]),
    ).toEqual([]);
    expect(
      compareParamNames(
        [{ name: "prepare", kind: "keyword", default: "false" }],
        [req("{ prepare = false }")],
      ),
    ).toEqual([]);
  });
  it("lets an anonymous splat cover the positional list the port spells out", () => {
    // connection_adapters/postgresql/column.rb:9
    // `initialize(*, serial: nil, identity: nil, generated: nil, **)` forwards
    // its positionals to `super` without naming them; the port has to spell
    // them out, so the one `*` slot stands for all four.
    expect(
      compareParamNames(
        [
          { name: "*", kind: "rest" },
          kwopt("serial"),
          kwopt("identity"),
          kwopt("generated"),
          kwrest("**"),
        ],
        [req("name"), opt("defaultValue"), opt("sqlTypeMetadata"), opt("null_"), opt("options")],
      ),
    ).toEqual([]);
  });

  it("still flags a rename in the named slot beside a widened anonymous splat", () => {
    expect(
      compareParamNames(
        [{ name: "*", kind: "rest" }, kwopt("serial")],
        [req("name"), opt("defaultValue"), opt("isSerial")],
      ),
    ).toEqual([{ position: 2, ruby: "serial", ts: "isSerial" }]);
  });
});

describe("isNestedConstructorHomonym", () => {
  const declared = new Set(["Core", "InspectionMask"]);
  const defineInitialize = new Set(["Core"]);

  it("rejects a nested class the Ruby file declares without an initialize", () => {
    expect(isNestedConstructorHomonym("InspectionMask", declared, defineInitialize)).toBe(true);
  });

  it("keeps a nested class that declares its own initialize", () => {
    expect(isNestedConstructorHomonym("Core", declared, defineInitialize)).toBe(false);
  });

  it("keeps a TS class the Ruby file never names", () => {
    expect(isNestedConstructorHomonym("Base", declared, defineInitialize)).toBe(false);
  });
});
