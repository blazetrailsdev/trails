import { describe, it, expect } from "vitest";
import { ParameterFilter } from "./parameter-filter.js";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";
import { withIndifferentAccess } from "./core-ext/hash/indifferent-access.js";

/**
 * Behaviour Rails asserts inside its own `test "process parameter filter"`
 * table (parameter_filter_test.rb:8-44) — deep dot-notation keys and block
 * filters — kept here so the enrolled test names stay Rails' own, plus cases
 * with no Rails counterpart at all: JS value shapes (`Date`, class instances,
 * null-prototype objects) that Ruby's `Hash#each` walk never meets, and the
 * `HashWithIndifferentAccess` recursion Rails covers from ActionDispatch.
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

  it("folds a case-insensitive pattern the flag expansion must rewrite into the one group Regexp", () => {
    // Ruby folds every pattern of a group into ONE Regexp with an inline
    // `(?i:...)` group (parameter_filter.rb:58-65), which V8 also spells — so a
    // case-insensitive member keeps its own flag inside the joined Regexp, down
    // to case-folding a `\p{Lu}` property escape.
    for (const pattern of [/[xy]z/i, /\p{Lu}q/iu, /(?<tail>vw)/i, /[a-c]z/i]) {
      const precompiled = ParameterFilter.precompileFilters([/plain/, pattern]);
      expect(precompiled.length).toBe(1);
      expect(precompiled[0]).not.toBe(pattern);
    }

    const filter = new ParameterFilter(
      ParameterFilter.precompileFilters([/[xy]z/i, /(?<tail>vw)/i, /[a-c]q/i, "ccC"]),
    );
    expect(filter.filterParam("XZ", "v")).toBe("[FILTERED]");
    expect(filter.filterParam("VW", "v")).toBe("[FILTERED]");
    expect(filter.filterParam("BQ", "v")).toBe("[FILTERED]");
    expect(filter.filterParam("cCc", "v")).toBe("[FILTERED]");
    expect(filter.filterParam("zzz", "v")).toBe("v");
    expect(filter.filterParam("dq", "v")).toBe("v");

    // The property escape only means a property under `u`, so the joined
    // Regexp carries the flag its members were written with.
    const unicode = new ParameterFilter(ParameterFilter.precompileFilters([/\p{Lu}q/iu]));
    expect(unicode.filterParam("aQ", "v")).toBe("[FILTERED]");
    expect(unicode.filterParam("1q", "v")).toBe("v");
  });

  it("folds a deep case-insensitive pattern the flag expansion must rewrite into the one group Regexp", () => {
    const precompiled = ParameterFilter.precompileFilters([/a\.a/, /[xy]\.z/i]);
    expect(precompiled.length).toBe(1);
    const filter = new ParameterFilter(precompiled);
    expect(filter.filter({ X: { Z: "v" } }).X).toEqual({ Z: "[FILTERED]" });
    expect(filter.filter({ a: { a: "v" } }).a).toEqual({ a: "[FILTERED]" });
    expect(filter.filter({ a: { b: "v" } }).a).toEqual({ b: "v" });
  });
  it("recurses into nested plain objects", () => {
    const filter = new ParameterFilter(["secret"]);
    const result = filter.filter({ outer: { secret: "hidden", public: "visible" } });
    expect((result.outer as any).secret).toBe("[FILTERED]");
    expect((result.outer as any).public).toBe("visible");
  });

  it("recurses into arrays", () => {
    const filter = new ParameterFilter(["secret"]);
    const result = filter.filter({ items: [{ secret: "a" }, { secret: "b", x: 1 }] });
    expect((result.items as any[])[0].secret).toBe("[FILTERED]");
    expect((result.items as any[])[1].secret).toBe("[FILTERED]");
    expect((result.items as any[])[1].x).toBe(1);
  });

  it("preserves Date instances without corruption", () => {
    const filter = new ParameterFilter(["secret"]);
    const d = new Date("2024-01-15T10:00:00.000Z");
    expect(filter.filterParam("created_at", d)).toBe(d);
  });

  it("preserves non-plain class instances without corruption", () => {
    class Foo {
      constructor(public val: number) {}
    }
    const filter = new ParameterFilter(["secret"]);
    const obj = new Foo(42);
    expect(filter.filterParam("foo", obj)).toBe(obj);
  });

  it("filters null-prototype objects", () => {
    const filter = new ParameterFilter(["secret"]);
    const params = Object.assign(Object.create(null), { secret: "hidden", name: "alice" });
    const result = filter.filter(params as Record<string, unknown>);
    expect(result.secret).toBe("[FILTERED]");
    expect(result.name).toBe("alice");
  });

  it("filters a nested HashWithIndifferentAccess in place", () => {
    const filter = new ParameterFilter(["secret"]);
    const params = withIndifferentAccess({ outer: withIndifferentAccess({ secret: "hidden" }) });
    const result = filter.filter(params as unknown as Record<string, unknown>);
    expect((result as unknown as HashWithIndifferentAccess<any>).get("outer").get("secret")).toBe(
      "[FILTERED]",
    );
  });
});
