import { describe, it, expect } from "vitest";
import { ValueType, IntegerType } from "../index.js";
import { NoMethodError } from "../attribute-assignment.js";

describe("ValueTest", () => {
  it("type equality", () => {
    expect(new ValueType().equals(new ValueType())).toEqual(true);
    expect(new ValueType().equals(new IntegerType())).not.toEqual(true);
    expect(new ValueType({ precision: 1 }).equals(new ValueType({ precision: 2 }))).not.toEqual(
      true,
    );
  });

  it("as json not defined", () => {
    expect(() => new ValueType().asJson()).toThrow(NoMethodError);
  });
});
