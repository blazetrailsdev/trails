import { describe, it, expect } from "vitest";
import { bareIdentifier, compareParamNames, matchParamNamesAgainst } from "./param-names.js";
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

  it("skips a `this:` receiver parameter", () => {
    expect(compareParamNames([req("value")], [req("this"), req("value")])).toEqual([]);
  });

  it("skips a leading explicit-receiver parameter", () => {
    expect(compareParamNames([req("value")], [req("relation", "Relation"), req("value")])).toEqual(
      [],
    );
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
});
