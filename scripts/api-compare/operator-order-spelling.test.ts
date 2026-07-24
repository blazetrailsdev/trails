import { describe, it, expect } from "vitest";
import { operatorSpelling, OPERATOR_SPELLING_BY_FQN } from "./operator-order-spelling.js";
import { OPERATORS } from "./conventions.js";

describe("operatorSpelling", () => {
  it("resolves `[]` to the class-specific spelling per fqn", () => {
    // Same operator, different port: `get` vs the Map-compat invention's slot.
    expect(operatorSpelling("Arel::Table", "[]")).toEqual(["get"]);
    expect(operatorSpelling("ActiveModel::AttributeSet", "[]")).toEqual(["getAttribute"]);
    expect(operatorSpelling("ActiveModel::Errors", "[]")).toEqual(["get"]);
    expect(operatorSpelling("ActiveModel::LazyAttributeHash", "[]")).toEqual(["get"]);
  });

  it("does NOT pull the AttributeSet `get` invention into the `[]` slot", () => {
    expect(operatorSpelling("ActiveModel::AttributeSet", "[]")).not.toContain("get");
  });

  it("leaves the AttributeSet `[]=` Map-compat sibling unmapped", () => {
    expect(operatorSpelling("ActiveModel::AttributeSet", "[]=")).toBeUndefined();
    expect(operatorSpelling("ActiveModel::LazyAttributeHash", "[]=")).toEqual(["set"]);
  });

  it("resolves `==` to each class's equality port", () => {
    expect(operatorSpelling("ActiveModel::Attribute", "==")).toEqual(["equals"]);
    expect(operatorSpelling("ActiveModel::Type::Value", "==")).toEqual(["equals"]);
    expect(operatorSpelling("ActiveRecord::Result::IndexedRow", "==")).toEqual(["equals"]);
    expect(operatorSpelling("ActiveRecord::Reflection::MacroReflection", "==")).toEqual(["equals"]);
  });

  it("resolves `<=>` to the comparison port", () => {
    expect(operatorSpelling("ActiveModel::Name", "<=>")).toEqual(["compare"]);
  });

  it("resolves `[]` / `[]=` pairs to distinct accessor spellings", () => {
    const pool = "ActiveRecord::ConnectionAdapters::StatementPool";
    expect(operatorSpelling(pool, "[]")).toEqual(["get"]);
    expect(operatorSpelling(pool, "[]=")).toEqual(["set"]);
    expect(operatorSpelling("ActiveRecord::Result", "[]")).toEqual(["at"]);
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
