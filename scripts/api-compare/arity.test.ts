import { describe, it, expect } from "vitest";
import {
  positionalArity,
  arityMatches,
  matchArityAgainst,
  shouldSkipArity,
  renderSig,
} from "./arity.js";
import type { ParamInfo } from "./types.js";

const req = (name: string, type?: string): ParamInfo => ({ name, kind: "required", type });
const opt = (name: string): ParamInfo => ({ name, kind: "optional", default: "…" });
const rest = (name: string): ParamInfo => ({ name, kind: "rest" });
const kw = (name: string): ParamInfo => ({ name, kind: "keyword" });
const kwrest = (name: string): ParamInfo => ({ name, kind: "keyword_rest" });
const blk = (name: string): ParamInfo => ({ name, kind: "block" });

describe("positionalArity", () => {
  it("counts required as a fixed range", () => {
    expect(positionalArity([req("a"), req("b")], "ruby")).toMatchObject({ min: 2, max: 2 });
  });

  it("widens max for optionals", () => {
    expect(positionalArity([req("a"), opt("b")], "ruby")).toMatchObject({ min: 1, max: 2 });
  });

  it("treats a rest/splat param as unbounded max", () => {
    expect(positionalArity([rest("args")], "ruby")).toMatchObject({ min: 0, max: Infinity });
  });

  it("counts a required param after a splat — def m(*args, value)", () => {
    expect(positionalArity([rest("args"), req("value")], "ruby")).toMatchObject({
      min: 1,
      max: Infinity,
    });
  });

  it("reports keywords without counting them positionally", () => {
    expect(positionalArity([req("a"), kw("b"), kwrest("o")], "ruby")).toMatchObject({
      min: 1,
      max: 1,
      hasKeywords: true,
    });
  });

  it("reports a block without counting it positionally", () => {
    expect(positionalArity([req("a"), blk("b")], "ruby")).toMatchObject({
      min: 1,
      max: 1,
      hasBlock: true,
    });
  });

  it("strips a leading `this` on the TS side but not the Ruby side", () => {
    expect(positionalArity([req("this"), req("a")], "ts").min).toBe(1);
    expect(positionalArity([req("this"), req("a")], "ruby").min).toBe(2);
  });
});

describe("arityMatches", () => {
  it("matches equal arity", () => {
    expect(arityMatches([req("a"), req("b")], [req("a"), req("b")]).ok).toBe(true);
  });

  it("matches when TS defaults widen the optional range", () => {
    // ruby foo(a, b) ; ts foo(a, b = …) → ranges [2,2] vs [1,2] overlap
    expect(arityMatches([req("a"), req("b")], [req("a"), opt("b")]).ok).toBe(true);
  });

  it("matches a rest param against a fixed count", () => {
    expect(arityMatches([rest("args")], [req("a")]).ok).toBe(true);
  });

  it("treats ruby kwargs as satisfied by a trailing TS options object", () => {
    // def foo(a, **o)  ≈  foo(a, o = {})  → ruby [1,1]+slack=[1,2] vs ts [1,2]
    expect(arityMatches([req("a"), kwrest("o")], [req("a"), opt("o")]).ok).toBe(true);
  });

  it("flags a genuinely missing positional arg", () => {
    // def foo(a, b)  vs  foo(a)  → ranges [2,2] vs [1,1] do not overlap
    const m = arityMatches([req("a"), req("b")], [req("a")]);
    expect(m.ok).toBe(false);
    expect(m.rubyRange).toEqual({ min: 2, max: 2 });
    expect(m.tsRange).toEqual({ min: 1, max: 1 });
  });

  it("flags an extra required arg on the TS side", () => {
    expect(arityMatches([req("a")], [req("a"), req("b")]).ok).toBe(false);
  });

  it("ignores the TS `this` receiver when comparing", () => {
    expect(arityMatches([req("a")], [req("this"), req("a")]).ok).toBe(true);
  });

  it("strips a leading host-typed receiver param (incl. generics) to gain a match", () => {
    // ruby clear_aggregation_cache()  vs  clearAggregationCache(record: Base)
    expect(arityMatches([], [req("record", "Base")]).ok).toBe(true);
    expect(arityMatches([], [req("x", "ns.Relation<T>")]).ok).toBe(true);
  });

  it("does NOT strip when the leading param is a real shared arg", () => {
    // ruby set_owner_attributes(record)  vs  setOwnerAttributes(record: Base):
    // as-declared already overlaps, so stripping must not break it.
    expect(arityMatches([req("record")], [req("record", "Base")]).ok).toBe(true);
  });

  it("does not strip a leading non-host param", () => {
    expect(arityMatches([], [req("name", "string")]).ok).toBe(false);
  });

  it("treats a ruby block as satisfied by an explicit TS callback param", () => {
    // def each(&block)  ≈  each(fn)
    expect(arityMatches([blk("block")], [req("fn")]).ok).toBe(true);
  });
});

describe("matchArityAgainst", () => {
  it("matches when ANY candidate overlaps — real impl wins over a 0-arg binding", () => {
    // base.ts exposes `_writeAttribute: ReadonlyAttributes._writeAttribute` as a
    // 0-arg property; the real 2-arg signature lives in the mixin source.
    const real: ParamInfo[] = [req("name"), req("value")];
    expect(matchArityAgainst(real, [[], real])).toEqual({ matched: true });
    expect(matchArityAgainst([req("a")], [])).toEqual({ matched: true });
  });

  it("reports a mismatch (first candidate's ranges) when none overlap", () => {
    const v = matchArityAgainst([req("a"), req("b")], [[req("a")]]);
    expect(v).toMatchObject({ matched: false, rubyRange: { min: 2 }, tsRange: { min: 1 } });
  });
});

describe("shouldSkipArity", () => {
  it("skips when both sides take zero positional args", () => {
    expect(shouldSkipArity([], [])).toBe(true);
    expect(shouldSkipArity([blk("b")], [req("this")])).toBe(true);
  });

  it("does not skip when either side takes args", () => {
    expect(shouldSkipArity([req("a")], [])).toBe(false);
    expect(shouldSkipArity([], [req("a")])).toBe(false);
  });
});

describe("renderSig", () => {
  it("renders kinds readably and drops TS `this`", () => {
    expect(renderSig([req("a"), opt("b"), rest("c"), kwrest("o"), blk("blk")], "ruby")).toBe(
      "(a, b = …, *c, **o, &blk)",
    );
    expect(renderSig([req("this"), req("a")], "ts")).toBe("(a)");
  });
});
