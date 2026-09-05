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

  it("folds trails' colon-prefixed symbol spelling onto the Ruby symbol token", () => {
    // Ruby `assert_equal :short, …` extracts as `s:short`; trails spells the
    // same Symbol VALUE as the string `":short"`, which extracts as `s::short`.
    expect(
      assertionValueMismatch(["assert_equal"], ["s:short"], ["toBe"], ["s::short"], false),
    ).toBeNull();
    // A genuinely different symbol still diverges.
    expect(
      assertionValueMismatch(["assert_equal"], ["s:short"], ["toBe"], ["s::long"], false),
    ).toEqual([{ kind: "equal", rails: ["s:short"], trails: ["s:long"] }]);
  });

  it("folds a snake_case attribute-name literal onto its camelCase spelling", () => {
    // Rails' `assert_equal :author_name, t.errors.attribute_names[1]`
    // (vendor/rails/activemodel/test/cases/validations_test.rb:237-244) against
    // the trails port, which must spell the shared Topic's accessor
    // `authorName`.
    expect(
      assertionValueMismatch(
        ["assert_equal"],
        ["s:author_name"],
        ["toEqual"],
        ["s:authorName"],
        false,
      ),
    ).toBeNull();
    // The colon-prefixed Symbol spelling folds the same way.
    expect(
      assertionValueMismatch(
        ["assert_equal"],
        ["s:author_name"],
        ["toEqual"],
        ["s::authorName"],
        false,
      ),
    ).toBeNull();
    // A genuinely different name still diverges.
    expect(
      assertionValueMismatch(
        ["assert_equal"],
        ["s:author_name"],
        ["toEqual"],
        ["s:titleName"],
        false,
      ),
    ).toEqual([{ kind: "equal", rails: ["s:authorName"], trails: ["s:titleName"] }]);
    // A non-identifier string is compared verbatim — no underscore squashing in
    // a sentence or a SQL fragment.
    expect(
      assertionValueMismatch(
        ["assert_equal"],
        ["s:is too short (minimum is 5 characters)"],
        ["toEqual"],
        ["s:is too short (minimum is 5 characters)"],
        false,
      ),
    ).toBeNull();
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

  it("never flags an RFC 0088 Temporal-vs-Ruby-temporal expected value", () => {
    // `assert_equal Date.new(2001, 2, 3), …` vs
    // `expect(…).toEqual(Temporal.PlainDate.from("2001-02-03"))`: both extractors
    // emit `null` for a method call, so the kind is skipped and `date.value`
    // cannot rise for RFC 0088's intended shape. See the module header.
    expect(assertionValueMismatch(["assert_equal"], [null], ["toEqual"], [null], false)).toBeNull();
    // A one-sided capture is skipped too: the sides are not both fully literal.
    expect(
      assertionValueMismatch(["assert_equal"], [null], ["toEqual"], ["s:2001-02-03"], false),
    ).toBeNull();
  });

  it("returns null for a pending stub or missing kind data", () => {
    expect(
      assertionValueMismatch(["assert_equal"], ["n:5"], ["toEqual"], ["n:4"], true),
    ).toBeNull();
    expect(assertionValueMismatch(undefined, undefined, ["toEqual"], ["n:4"], false)).toBeNull();
  });

  it("folds whitespace for must_be_like, which squeezes both operands", () => {
    expect(
      assertionValueMismatch(
        ["must_be_like"],
        ['s:\n            SELECT id FROM "users"\n          '],
        ["toEqual"],
        ['s:SELECT id FROM "users"'],
        false,
      ),
    ).toBeNull();
  });

  it("still flags a must_be_like pair whose SQL actually differs", () => {
    expect(
      assertionValueMismatch(
        ["must_be_like"],
        ['s: SELECT id FROM "users" '],
        ["toEqual"],
        ['s:SELECT * FROM "users"'],
        false,
      ),
    ).toEqual([
      { kind: "equal", rails: ['s:SELECT id FROM "users"'], trails: ['s:SELECT * FROM "users"'] },
    ]);
  });

  it("does not fold whitespace for an ordinary must_equal pair", () => {
    expect(
      assertionValueMismatch(["must_equal"], ["s:a  b"], ["toEqual"], ["s:a b"], false),
    ).toEqual([{ kind: "equal", rails: ["s:a  b"], trails: ["s:a b"] }]);
  });

  it("squeezes only the must_be_like operand, not a must_equal beside it", () => {
    expect(
      assertionValueMismatch(
        ["must_be_like", "must_equal"],
        ['s: SELECT id FROM "users" ', "s:a  b"],
        ["toEqual", "toEqual"],
        ['s:SELECT id FROM "users"', "s:a b"],
        false,
      ),
    ).toEqual([
      {
        kind: "equal",
        rails: ['s:SELECT id FROM "users"', "s:a  b"],
        trails: ['s:SELECT id FROM "users"', "s:a b"],
      },
    ]);
  });

  it("passes a mixed pair when the must_equal operand matches verbatim", () => {
    expect(
      assertionValueMismatch(
        ["must_be_like", "must_equal"],
        ['s:\n  SELECT id FROM "users"\n', "s:a  b"],
        ["toEqual", "toEqual"],
        ["s:a  b", 's:SELECT id FROM "users"'],
        false,
      ),
    ).toBeNull();
  });
});
