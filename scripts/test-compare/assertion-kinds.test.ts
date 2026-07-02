import { describe, expect, it } from "vitest";
import {
  buildHistogram,
  diffHistograms,
  normalizeRailsKind,
  normalizeTrailsKind,
} from "./assertion-kinds.js";

describe("normalizeRailsKind", () => {
  it("maps core assert_* names to canonical kinds", () => {
    expect(normalizeRailsKind("assert_equal")).toBe("equal");
    expect(normalizeRailsKind("assert_nil")).toBe("nil");
    expect(normalizeRailsKind("assert")).toBe("truthy");
    expect(normalizeRailsKind("assert_not")).toBe("falsy");
  });

  it("maps refute_* to the negated kind", () => {
    expect(normalizeRailsKind("refute_equal")).toBe("notEqual");
    expect(normalizeRailsKind("refute_nil")).toBe("notNil");
    expect(normalizeRailsKind("refute")).toBe("falsy");
  });

  it("maps minitest must_*/wont_* spec forms via their assert_*/refute_* twin", () => {
    expect(normalizeRailsKind("must_equal")).toBe("equal");
    expect(normalizeRailsKind("wont_equal")).toBe("notEqual");
  });

  it("returns null for an unmapped assertion helper", () => {
    expect(normalizeRailsKind("assert_queries_count")).toBeNull();
    expect(normalizeRailsKind("assert_cycle")).toBeNull();
  });
});

describe("normalizeTrailsKind", () => {
  it("maps vitest matchers to canonical kinds", () => {
    expect(normalizeTrailsKind("toEqual")).toBe("equal");
    expect(normalizeTrailsKind("toBe")).toBe("equal");
    expect(normalizeTrailsKind("toBeNull")).toBe("nil");
    expect(normalizeTrailsKind("toBeTruthy")).toBe("truthy");
    expect(normalizeTrailsKind("toThrow")).toBe("raises");
  });

  it("folds a not: chain onto the negated kind", () => {
    expect(normalizeTrailsKind("not:toBeNull")).toBe("notNil");
    expect(normalizeTrailsKind("not:toEqual")).toBe("notEqual");
    expect(normalizeTrailsKind("not:toBeTruthy")).toBe("falsy");
  });

  it("maps helper callees that mirror a Rails name via snake-case", () => {
    expect(normalizeTrailsKind("refuteEqual")).toBe("notEqual");
    expect(normalizeTrailsKind("mustEqual")).toBe("equal");
  });

  it("returns null for an unmapped matcher or helper", () => {
    expect(normalizeTrailsKind("toHaveBeenCalled")).toBeNull();
    expect(normalizeTrailsKind("expectQuotedColumnInSql")).toBeNull();
  });
});

describe("buildHistogram", () => {
  it("counts normalized kinds and collects unmapped tokens", () => {
    const h = buildHistogram(
      ["assert_equal", "assert_equal", "assert_nil", "assert_cycle"],
      "rails",
    );
    expect(h.histogram).toEqual({ equal: 2, nil: 1 });
    expect(h.unmapped).toEqual(["assert_cycle"]);
  });

  it("normalizes the trails side onto comparable kinds", () => {
    const h = buildHistogram(["toEqual", "toEqual", "toEqual"], "trails");
    expect(h.histogram).toEqual({ equal: 3 });
  });
});

describe("diffHistograms", () => {
  it("returns per-kind deltas where counts differ", () => {
    // Rails asserts 2 equalities + 1 nil; trails collapses to 3 truthiness checks.
    const rails = buildHistogram(["assert_equal", "assert_equal", "assert_nil"], "rails");
    const trails = buildHistogram(["toBeTruthy", "toBeTruthy", "toBeTruthy"], "trails");
    expect(diffHistograms(rails.histogram, trails.histogram)).toEqual([
      { kind: "equal", rails: 2, trails: 0 },
      { kind: "nil", rails: 1, trails: 0 },
      { kind: "truthy", rails: 0, trails: 3 },
    ]);
  });

  it("is empty when normalized kinds line up exactly", () => {
    const rails = buildHistogram(["assert_equal", "assert_nil"], "rails");
    // toBe ~ equal, toBeNull ~ nil — same normalized histogram despite different names.
    const trails = buildHistogram(["toBe", "toBeNull"], "trails");
    expect(diffHistograms(rails.histogram, trails.histogram)).toEqual([]);
  });
});
