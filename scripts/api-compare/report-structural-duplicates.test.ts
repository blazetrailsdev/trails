import { describe, expect, it } from "vitest";
import type { TsApi } from "./report-ruby-compat.js";
import { literalArgs, matches, renderReport, shapeOf } from "./report-structural-duplicates.js";

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
    const decl = { name: "x", callArgs: [{ name: "f", args: ["id:a", "?", "num:1"] }] };
    expect(literalArgs(decl)).toEqual(["num:1"]);
  });
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
