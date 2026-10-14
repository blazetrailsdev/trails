import { describe, expect, it } from "vitest";
import { GATE_ENFORCED_PACKAGES } from "../test-compare/compare.js";
import { RULES as DEP_RULES } from "./lint-deps.js";
import { GATED_PACKAGES as PARAM_NAME_GATED } from "./param-name-mark.js";
import { inScope, scopeMismatch, scopeOf, scopedMarks } from "./scope.js";

describe("scopeOf", () => {
  it("is null without --package, and the named package with it", () => {
    expect(scopeOf(["--no-regen"])).toBeNull();
    expect(scopeOf(["--no-regen", "--package", "thor"])).toBe("thor");
  });

  it("rejects a missing or unknown package", () => {
    expect(() => scopeOf(["--package"])).toThrow(/got nothing/);
    expect(() => scopeOf(["--package", "thorough"])).toThrow(/got thorough/);
  });

  it("refuses to combine with a flag that rewrites the committed marks", () => {
    expect(() => scopeOf(["--package", "thor", "--write"])).toThrow(/--write rewrites marks/);
    expect(() => scopeOf(["--tighten", "--package", "thor"])).toThrow(/--tighten rewrites marks/);
  });
});

describe("inScope", () => {
  const rows = [{ package: "thor" }, { package: "arel" }, { package: "thor" }];

  it("keeps only the scope's rows, so another package's never read as stale", () => {
    expect(inScope(rows, "thor")).toEqual([{ package: "thor" }, { package: "thor" }]);
  });

  it("keeps every row unscoped", () => {
    expect(inScope(rows, null)).toEqual(rows);
  });
});

describe("scopeMismatch", () => {
  it("accepts an artifact that compared exactly the scope", () => {
    expect(scopeMismatch("gate", ["thor"], "thor")).toBeNull();
    expect(scopeMismatch("gate", ["thor", "thor"], "thor")).toBeNull();
  });

  it("refuses a narrower, wider or different population", () => {
    expect(scopeMismatch("gate", undefined, "thor")).toMatch(/compared no package/);
    expect(scopeMismatch("gate", ["arel", "thor"], "thor")).toMatch(/compared arel, thor/);
    expect(scopeMismatch("gate", ["arel"], "thor")).toMatch(/scoped to thor/);
  });
});

describe("scopedMarks", () => {
  it("holds only the scope's mark against a scoped measurement", () => {
    expect(scopedMarks({ actiondispatch: 1, thor: 2 }, "thor")).toEqual({ thor: 2 });
    expect(scopedMarks({ actiondispatch: 1, thor: 0 }, "thor")).toEqual({ thor: 0 });
    expect(scopedMarks({ actiondispatch: 1 }, "thor")).toEqual({});
    expect(scopedMarks({ actiondispatch: 1 }, null)).toEqual({ actiondispatch: 1 });
  });
});

describe("the gates scripts/ci/thor-comparison.sh skips", () => {
  it("judge populations thor is outside of", () => {
    expect(PARAM_NAME_GATED).not.toContain("thor");
    expect([...GATE_ENFORCED_PACKAGES]).not.toContain("thor");
    expect(DEP_RULES.map((rule) => rule.package)).not.toContain("thor");
  });
});
