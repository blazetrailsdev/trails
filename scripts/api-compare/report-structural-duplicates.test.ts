import { describe, expect, it } from "vitest";
import type { Decl, TsApi } from "./report-ruby-compat.js";
import { matches, renderReport, shapeOf } from "./report-structural-duplicates.js";

const replace = (name: string, line: number, literal: string) => ({
  name,
  line,
  skeleton: ["ref:replace"],
  callArgs: [{ name: "replace", args: ["?", literal] }],
});

const api: TsApi = {
  packages: {
    "ruby-compat": {
      fileFunctions: {
        "regexp.ts": [replace("regexpEscape", 16, "str:\\$&")],
        "hash.ts": [{ name: "hasKey", line: 42, skeleton: ["ref:hasOwn"] }],
        "index.ts": [replace("regexpEscape", 16, "str:\\$&")],
      },
    },
    activesupport: {
      fileFunctions: {
        "hash-utils.ts": [{ name: "isInclude", line: 120, skeleton: ["ref:hasOwn"] }],
        "strings.ts": [replace("quoteRegex", 27, "str:\\$&"), replace("squish", 40, "str: ")],
      },
    },
  },
};

describe("shapeOf", () => {
  it("keeps the literal arguments the skeleton erases", () => {
    expect(shapeOf(replace("x", 1, "str:a"))).toBe("ref:replace|str:a");
  });

  it("has no shape for a body the extractor recorded no skeleton for", () => {
    expect(shapeOf({ name: "x" })).toBeUndefined();
  });

  it("drops identifiers and unrepresented literals", () => {
    const decl = {
      name: "x",
      skeleton: ["ref:f"],
      callArgs: [{ name: "f", args: ["id:a", "?", "num:1"] }],
    };
    expect(shapeOf(decl)).toBe("ref:f|num:1");
  });

  it("keeps the function a call / apply invokes, which the skeleton records only as ref:call", () => {
    const decl = (recv: string) => ({
      name: "x",
      skeleton: ["ref:call"],
      callArgs: [{ name: "call", args: ["id:this", "id:other"], recv }],
    });
    expect(shapeOf(decl("id:cmpint"))).toBe("ref:call|callee:id:cmpint");
    expect(shapeOf(decl("id:ensureProperType"))).not.toBe(shapeOf(decl("id:cmpint")));
    expect(shapeOf(decl("call:_createRecord"))).toBe("ref:call|callee:call:_createRecord");
  });

  it("separates a constant receiver from a bare call of the same name", () => {
    const resolve = { name: "x", skeleton: ["ref:resolve"] };
    expect(shapeOf({ ...resolve, shapeTokens: ["recv:Promise"] })).not.toBe(shapeOf(resolve));
  });

  it("separates an index read from a Map#get, both ref:get in the skeleton", () => {
    const get = { name: "x", skeleton: ["ref:get"] };
    expect(shapeOf({ ...get, shapeTokens: ["[]"] })).not.toBe(shapeOf(get));
  });

  it("separates two guards by the operators the skeleton erases", () => {
    const guard = { name: "x", skeleton: ["if", "and"] };
    expect(shapeOf({ ...guard, shapeTokens: ["op:!"] })).not.toBe(
      shapeOf({ ...guard, shapeTokens: ["?:"] }),
    );
  });

  it("separates two raises of one error class by the text of their template message", () => {
    const raise = { name: "x", skeleton: ["if", "throw:ArgumentError", "new:ArgumentError"] };
    expect(
      shapeOf({ ...raise, shapeTokens: ["tpl:wrong number of arguments (given ${})"] }),
    ).not.toBe(shapeOf({ ...raise, shapeTokens: ["tpl:tags_format must be one of ${}"] }));
  });

  it("separates two get-or-set memos by what they store", () => {
    const memo = { name: "x", skeleton: ["ref:get", "if", "ref:set"] };
    expect(shapeOf({ ...memo, shapeTokens: ["class"] })).not.toBe(
      shapeOf({ ...memo, shapeTokens: ["op:++"] }),
    );
  });
});

const hosted = (origin: Decl, candidate: Decl, ...siblings: Decl[]): TsApi => ({
  packages: {
    "ruby-compat": {
      classes: { "tempfile.ts:Tempfile": { instanceMethods: [origin, ...siblings] } },
    },
    activerecord: { classes: { "result.ts:Result": { instanceMethods: [candidate] } } },
  },
});

describe("matches", () => {
  it("finds a primitive re-implemented under an unrecognised name", () => {
    expect(matches(api).get("hasKey")).toEqual([
      {
        package: "activesupport",
        tsFile: "hash-utils.ts",
        name: "isInclude",
        line: 120,
        shape: "ref:hasOwn|",
        alias: false,
        delegation: false,
      },
    ]);
  });

  it("separates two bodies of one skeleton by their literals, and counts a barrel re-export once", () => {
    expect(
      matches(api)
        .get("regexpEscape")
        ?.map((s) => s.name),
    ).toEqual(["quoteRegex"]);
  });

  it("never matches a ruby-compat constructor, which is reused by extending its class", () => {
    const ctor = { name: "constructor", line: 1, skeleton: ["ref:super"] };
    expect(matches(hosted(ctor, ctor)).size).toBe(0);
  });

  it("never matches a ruby-compat method whose one step is a member of its own class", () => {
    const length = { name: "length", line: 1, skeleton: ["ref:size"] };
    const size = { name: "size", line: 2, skeleton: ["ref:stat", "ref:size"] };
    expect(matches(hosted(length, length, size)).has("length")).toBe(false);
  });

  it("still matches a one-step ruby-compat method that reaches outside its class", () => {
    const binmode = { name: "binmode", line: 1, skeleton: ["ref:ASCII_8BIT"] };
    expect(
      matches(hosted(binmode, binmode))
        .get("binmode")
        ?.map((s) => s.name),
    ).toEqual(["binmode"]);
  });

  it("never matches a ruby-compat body that is one call on identifiers alone", () => {
    const set = {
      name: "rbDefineAllocFunc",
      line: 1,
      skeleton: ["ref:set"],
      callArgs: [{ name: "set", args: ["id:klass", "id:func"], recv: "id:allocators" }],
    };
    expect(matches(hosted(set, { ...set, name: "registerModule" })).size).toBe(0);
  });

  it("never reports ruby-compat's own definitions as candidates", () => {
    for (const hits of matches(api).values()) {
      expect(hits.map((h) => h.package)).not.toContain("ruby-compat");
    }
  });

  it("counts the candidates and the exports they matched", () => {
    expect(renderReport(api, 20)).toContain(
      "2 candidate(s) across 2 ruby-compat export(s) with a shape match",
    );
  });
});
