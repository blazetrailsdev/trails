import { describe, it, expect } from "vitest";
import { compareLiteral, compareDefaults, constantNameMatches } from "./literals.js";
import type { LiteralValue, ParamInfo } from "./types.js";

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

  it("matches a Ruby symbol against a TS string of the same value", () => {
    expect(compareLiteral({ kind: "symbol", value: "asc" }, { kind: "string", value: "asc" })).toBe(
      "match",
    );
  });

  it("treats nil as equal to both null and undefined (TS undefined → nil)", () => {
    expect(compareLiteral({ kind: "nil" }, { kind: "nil" })).toBe("match");
  });

  it("skips a nil sentinel against a concrete TS default", () => {
    expect(compareLiteral({ kind: "nil" }, { kind: "bool", value: false })).toBe("skip");
  });

  it("matches Ruby raw source escapes against TS resolved control chars", () => {
    expect(
      compareLiteral({ kind: "string", value: "\\e[31m" }, { kind: "string", value: "[31m" }),
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

  it("flags a differing default value", () => {
    const res = compareDefaults(
      [ruby("order", { kind: "symbol", value: "asc" })],
      [[tsp("order", { kind: "string", value: "desc" })]],
    );
    expect(res.mismatches).toEqual([{ name: "order", rubyValue: '"asc"', tsValue: '"desc"' }]);
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
