import { describe, it, expect } from "vitest";
import { ParameterFilter } from "./parameter-filter.js";

/**
 * Behaviour Rails asserts inside its own `test "process parameter filter"`
 * table (parameter_filter_test.rb:8-44) — deep dot-notation keys and block
 * filters — kept here so the enrolled test names stay Rails' own.
 */
describe("ParameterFilter (trails)", () => {
  it("filters a deep key only under its parent", () => {
    const f = new ParameterFilter(["credit_card.code"]);
    const result = f.filter({
      credit_card: { code: "xxxx", number: "1" },
      file: { code: "xxxx" },
    });
    expect((result.credit_card as Record<string, unknown>).code).toBe("[FILTERED]");
    expect((result.credit_card as Record<string, unknown>).number).toBe("1");
    expect((result.file as Record<string, unknown>).code).toBe("xxxx");
  });

  it("passes each key and value to a block filter", () => {
    const seen: string[] = [];
    const f = new ParameterFilter([
      (key: string, value: unknown) => {
        seen.push(key);
        return key === "secret" ? String(value).split("").reverse().join("") : undefined;
      },
    ]);
    const result = f.filter({ secret: "abc", other: "abc" });
    expect(result.secret).toBe("cba");
    expect(result.other).toBe("abc");
    expect(seen).toEqual(["secret", "other"]);
  });

  it("keeps a case-insensitive pattern the flag expansion cannot rewrite as its own Regexp", () => {
    // Ruby folds every pattern of a group into ONE Regexp with an inline
    // `(?i:...)` group (parameter_filter.rb:58-65). JS has no inline flag
    // group, so the port expands each cased character to `[aA]` — which is
    // unsafe for a source carrying a character class, a Unicode property
    // escape or a named group. Those keep their own `i`-flagged Regexp
    // instead of being folded in, which is the one case where a group ends
    // up with more than one Regexp.
    const unexpandable = [/[xy]z/i, /\p{L}q/iu, /(?<tail>vw)/i];
    for (const pattern of unexpandable) {
      const precompiled = ParameterFilter.precompileFilters([/plain/, pattern]);
      expect(precompiled).toContain(pattern);
      expect(precompiled.length).toBe(2);
      expect((precompiled[0] as RegExp).source).toBe("plain");
    }

    // Riding along as its own Regexp keeps the `i` flag, so `new
    // ParameterFilter(precompiled)` still matches case-insensitively.
    const filter = new ParameterFilter(ParameterFilter.precompileFilters([/[xy]z/i, "ccC"]));
    expect(filter.filterParam("XZ", "v")).toBe("[FILTERED]");
    expect(filter.filterParam("cCc", "v")).toBe("[FILTERED]");
    expect(filter.filterParam("zzz", "v")).toBe("v");
  });

  it("keeps a deep case-insensitive pattern the flag expansion cannot rewrite as its own Regexp", () => {
    const precompiled = ParameterFilter.precompileFilters([/a\.a/, /[xy]\.z/i]);
    expect(precompiled.length).toBe(2);
    const filter = new ParameterFilter(precompiled);
    expect(filter.filter({ X: { Z: "v" } }).X).toEqual({ Z: "[FILTERED]" });
    expect(filter.filter({ a: { a: "v" } }).a).toEqual({ a: "[FILTERED]" });
    expect(filter.filter({ a: { b: "v" } }).a).toEqual({ b: "v" });
  });
});
