import { describe, it, expect } from "vitest";
import {
  compareLiteral,
  compareDefaults,
  constantNameMatches,
  normalizeConstantSpelling,
} from "./literals.js";
import type { LiteralValue, ParamInfo } from "@blazetrails/parity/types";

describe("compareLiteral", () => {
  it("matches numeric values written with different underscores (1000 === 1_000)", () => {
    expect(compareLiteral({ kind: "int", value: "1000" }, { kind: "int", value: "1_000" })).toBe(
      "match",
    );
    // float 1.0 and int 1 also collapse to the same numeric key
    expect(compareLiteral({ kind: "float", value: "1.0" }, { kind: "int", value: "1" })).toBe(
      "match",
    );
  });

  it("matches negative numeric defaults across languages (-1 === -1)", () => {
    expect(compareLiteral({ kind: "int", value: "-1" }, { kind: "int", value: "-1" })).toBe(
      "match",
    );
    // negative float and negative int collapse to the same numeric key
    expect(compareLiteral({ kind: "float", value: "-1.0" }, { kind: "int", value: "-1" })).toBe(
      "match",
    );
  });

  it("flags a negative value differing from its positive counterpart (-1 !== 1)", () => {
    expect(compareLiteral({ kind: "int", value: "-1" }, { kind: "int", value: "1" })).toBe(
      "mismatch",
    );
  });

  it("matches a Ruby symbol against a TS string carrying its leading colon", () => {
    expect(
      compareLiteral({ kind: "symbol", value: "default" }, { kind: "string", value: ":default" }),
    ).toBe("match");
  });

  it("matches a Ruby symbol against a bare TS string of the same value", () => {
    expect(
      compareLiteral({ kind: "symbol", value: "default" }, { kind: "string", value: "default" }),
    ).toBe("match");
  });

  it("flags a Ruby symbol against a TS string naming a different value", () => {
    expect(
      compareLiteral({ kind: "symbol", value: "default" }, { kind: "string", value: ":short" }),
    ).toBe("mismatch");
  });

  it("matches a Symbol-discriminated default only against the colon-prefixed string", () => {
    expect(
      compareLiteral(
        { kind: "symbol", value: "default" },
        { kind: "string", value: ":default" },
        true,
      ),
    ).toBe("match");
    expect(
      compareLiteral(
        { kind: "symbol", value: "default" },
        { kind: "string", value: "default" },
        true,
      ),
    ).toBe("mismatch");
  });

  it("treats nil as equal to both null and undefined (TS undefined → nil)", () => {
    expect(compareLiteral({ kind: "nil" }, { kind: "nil" })).toBe("match");
  });

  it("skips a nil sentinel against a concrete TS default", () => {
    expect(compareLiteral({ kind: "nil" }, { kind: "bool", value: false })).toBe("skip");
  });

  it("matches Ruby raw source escapes against TS resolved control chars", () => {
    expect(
      compareLiteral({ kind: "string", value: "\\e[31m" }, { kind: "string", value: "\x1b[31m" }),
    ).toBe("match");
    expect(
      compareLiteral({ kind: "string", value: "\\r\\n" }, { kind: "string", value: "\r\n" }),
    ).toBe("match");
  });

  it("skips when either side is a non-literal expr (exclusion)", () => {
    expect(compareLiteral({ kind: "expr" }, { kind: "int", value: "1" })).toBe("skip");
  });
});

describe("compareDefaults", () => {
  const ruby = (name: string, literal: LiteralValue): ParamInfo => ({
    name,
    kind: "optional",
    default: "...",
    literal,
  });
  const tsp = (name: string, literal?: LiteralValue): ParamInfo => ({
    name,
    kind: "optional",
    ...(literal ? { default: "...", literal } : {}),
  });

  it("matches a snake_case Ruby param to its camelCase TS param by name", () => {
    const res = compareDefaults(
      [ruby("batch_size", { kind: "int", value: "1000" })],
      [[tsp("batchSize", { kind: "int", value: "1_000" })]],
    );
    expect(res.mismatches).toEqual([]);
    expect(res.compared).toBe(1);
  });

  it("matches a negative default through the by-name path (-1 === -1)", () => {
    const res = compareDefaults(
      [ruby("limit", { kind: "int", value: "-1" })],
      [[tsp("limit", { kind: "int", value: "-1" })]],
    );
    expect(res.mismatches).toEqual([]);
    expect(res.compared).toBe(1);
  });

  it("flags a differing default value", () => {
    const res = compareDefaults(
      [ruby("order", { kind: "symbol", value: "asc" })],
      [[tsp("order", { kind: "string", value: "desc" })]],
    );
    expect(res.mismatches).toEqual([{ name: "order", rubyValue: ":asc", tsValue: '"desc"' }]);
  });

  it("flags a Symbol-discriminated default ported as a bare string", () => {
    const res = compareDefaults(
      [{ ...ruby("format", { kind: "symbol", value: "default" }), symbolDiscriminated: true }],
      [[tsp("format", { kind: "string", value: "default" })]],
    );
    expect(res.mismatches).toEqual([
      { name: "format", rubyValue: ":default", tsValue: '"default"' },
    ]);
  });

  it("excludes a non-literal default (skipped, not mismatched)", () => {
    const res = compareDefaults([ruby("at", { kind: "expr" })], [[tsp("at", { kind: "expr" })]]);
    expect(res.mismatches).toEqual([]);
    expect(res.compared).toBe(0);
    expect(res.skipped).toBe(1);
  });

  it("ignores a Ruby default the TS param doesn't record", () => {
    const res = compareDefaults([ruby("n", { kind: "int", value: "5" })], [[tsp("n")]]);
    expect(res).toEqual({ compared: 0, skipped: 0, mismatches: [] });
  });
});

describe("constantNameMatches", () => {
  it("passes SCREAMING_SNAKE constants through unchanged", () => {
    expect(constantNameMatches("MAX_IDENTIFIER_LENGTH", "MAX_IDENTIFIER_LENGTH")).toBe(true);
    expect(constantNameMatches("MAX_IDENTIFIER_LENGTH", "MIN_LENGTH")).toBe(false);
  });

  it("accepts a camelized port of a lowercase Ruby constant", () => {
    expect(constantNameMatches("default_timeout", "defaultTimeout")).toBe(true);
  });
});

describe("normalizeConstantSpelling", () => {
  it("gives Ruby Float::INFINITY and every JS spelling of it one key", () => {
    const infinity = normalizeConstantSpelling("INFINITY");
    expect(infinity).not.toBeNull();
    expect(normalizeConstantSpelling("Infinity")).toBe(infinity);
    expect(normalizeConstantSpelling("POSITIVE_INFINITY")).toBe(infinity);
  });

  it("gives Ruby Float::NAN and every JS spelling of it one key", () => {
    const nan = normalizeConstantSpelling("NAN");
    expect(nan).not.toBeNull();
    expect(normalizeConstantSpelling("NaN")).toBe(nan);
  });

  it("keeps the negative infinity spelling apart from the positive one", () => {
    expect(normalizeConstantSpelling("NEGATIVE_INFINITY")).not.toBe(
      normalizeConstantSpelling("POSITIVE_INFINITY"),
    );
  });

  it("is a closed table — a constant that differs in VALUE is not folded", () => {
    for (const name of ["MAX", "MAX_VALUE", "MIN", "MIN_VALUE", "EPSILON", "PI"]) {
      expect(normalizeConstantSpelling(name)).toBeNull();
    }
  });
});
