import { describe, expect, it } from "vitest";
import { assertionValueMismatch, VALUE_BEARING_KINDS } from "./assertion-values.js";

describe("assertionValueMismatch", () => {
  it("returns null when both sides assert the same literal values", () => {
    expect(
      assertionValueMismatch(["assert_equal"], ["n:5"], ["toEqual"], ["n:5"], false),
    ).toBeNull();
  });

  it("flags a divergence when the literal expected values differ", () => {
    const deltas = assertionValueMismatch(["assert_equal"], ["n:5"], ["toEqual"], ["n:4"], false);
    expect(deltas).toEqual([{ kind: "equal", rails: ["n:5"], trails: ["n:4"] }]);
  });

  it("compares as an order-independent multiset per kind", () => {
    // Same two equality values, asserted in a different order → no divergence.
    expect(
      assertionValueMismatch(
        ["assert_equal", "assert_equal"],
        ["n:1", "n:2"],
        ["toEqual", "toEqual"],
        ["n:2", "n:1"],
        false,
      ),
    ).toBeNull();
  });

  it("normalizes Ruby nil to TS null and Ruby symbol to string", () => {
    // Both sides carry the same normalized tokens (x:nil, s:foo), so equal.
    expect(
      assertionValueMismatch(
        ["assert_equal", "assert_equal"],
        ["x:nil", "s:foo"],
        ["toEqual", "toEqual"],
        ["x:nil", "s:foo"],
        false,
      ),
    ).toBeNull();
  });

  it("distinguishes multisets whose tokens contain spaces (no join-delimiter collision)", () => {
    // `["s:a b"]` vs `["s:a", "b"]` — a naive join(" ") would read both as
    // "s:a b" and miss the divergence; the element-wise compare catches it.
    const deltas = assertionValueMismatch(["assert_equal"], ["s:a b"], ["toEqual"], ["s:a"], false);
    // Equal count (1 each), both literal, but different tokens → flagged.
    expect(deltas).toEqual([{ kind: "equal", rails: ["s:a b"], trails: ["s:a"] }]);
  });

  it("skips a kind when either side has a non-literal (null) expected value", () => {
    // Rails equality value is a non-literal (null) → can't statically compare;
    // the pair is not flagged even though trails asserts a concrete literal.
    expect(
      assertionValueMismatch(["assert_equal"], [null], ["toEqual"], ["n:4"], false),
    ).toBeNull();
  });

  it("skips a kind whose counts differ (owned by the kind histogram)", () => {
    expect(
      assertionValueMismatch(
        ["assert_equal", "assert_equal"],
        ["n:1", "n:2"],
        ["toEqual"],
        ["n:9"],
        false,
      ),
    ).toBeNull();
  });

  it("ignores non-value-bearing kinds (truthiness has no comparable value)", () => {
    expect(VALUE_BEARING_KINDS.has("truthy")).toBe(false);
    expect(assertionValueMismatch(["assert"], [null], ["toBeTruthy"], [null], false)).toBeNull();
  });

  it("compares the includes membership value", () => {
    const deltas = assertionValueMismatch(
      ["assert_includes"],
      ["s:a"],
      ["toContain"],
      ["s:b"],
      false,
    );
    expect(deltas).toEqual([{ kind: "includes", rails: ["s:a"], trails: ["s:b"] }]);
  });

  it("value-compares the same kind now that both sides have a live capture path", () => {
    // Rails `assert_same 5, x` (self-call, arg 0) vs trails `assertSame(4, x)`
    // (helper callee, arg 0). Previously same was excluded from VALUE_BEARING_KINDS
    // because the trails helper captured no value; it now does.
    expect(VALUE_BEARING_KINDS.has("same")).toBe(true);
    const deltas = assertionValueMismatch(["assert_same"], ["n:5"], ["assertSame"], ["n:4"], false);
    expect(deltas).toEqual([{ kind: "same", rails: ["n:5"], trails: ["n:4"] }]);
  });

  it("returns null for a pending stub or missing kind data", () => {
    expect(
      assertionValueMismatch(["assert_equal"], ["n:5"], ["toEqual"], ["n:4"], true),
    ).toBeNull();
    expect(assertionValueMismatch(undefined, undefined, ["toEqual"], ["n:4"], false)).toBeNull();
  });
});
