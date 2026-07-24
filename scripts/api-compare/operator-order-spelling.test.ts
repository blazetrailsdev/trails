import { describe, it, expect } from "vitest";
import { operatorSpelling, OPERATOR_SPELLING_BY_FQN } from "./operator-order-spelling.js";
import { OPERATORS } from "./conventions.js";

describe("operatorSpelling", () => {
  it("resolves `[]` to the class-specific spelling per fqn", () => {
    // Same operator, different port: `get` vs the Map-compat invention's slot.
    expect(operatorSpelling("Arel::Table", "[]")).toEqual(["get"]);
    expect(operatorSpelling("ActiveModel::AttributeSet", "[]")).toEqual(["getAttribute"]);
    expect(operatorSpelling("ActiveModel::Errors", "[]")).toEqual(["get"]);
    expect(operatorSpelling("ActiveModel::AttributeSet::LazyAttributeHash", "[]")).toEqual(["get"]);
  });

  it("does NOT pull the AttributeSet `get` invention into the `[]` slot", () => {
    expect(operatorSpelling("ActiveModel::AttributeSet", "[]")).not.toContain("get");
  });

  it("returns undefined for an unlisted class (stays unmapped)", () => {
    expect(operatorSpelling("Arel::Nodes::Casted", "[]")).toBeUndefined();
    expect(operatorSpelling("Arel::Table", "==")).toBeUndefined();
  });

  it("returns undefined for a non-operator name", () => {
    expect(operatorSpelling("Arel::Table", "having")).toBeUndefined();
    expect(operatorSpelling("Arel::Table", "hash")).toBeUndefined();
  });

  it("only keys operators recognised by api-compare's OPERATORS set", () => {
    for (const ops of Object.values(OPERATOR_SPELLING_BY_FQN)) {
      for (const op of Object.keys(ops)) expect(OPERATORS.has(op)).toBe(true);
    }
  });
});
