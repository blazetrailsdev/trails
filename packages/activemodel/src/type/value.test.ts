import { describe, it, expect } from "vitest";
import { ValueType, IntegerType, FloatType, DecimalType, BigIntegerType } from "../index.js";
import { NoMethodError } from "../attribute-assignment.js";

describe("ValueTest", () => {
  it("type equality", () => {
    expect(new ValueType().equals(new ValueType())).toEqual(true);
    expect(new ValueType().equals(new IntegerType())).not.toEqual(true);
    expect(new ValueType({ precision: 1 }).equals(new ValueType({ precision: 2 }))).not.toEqual(
      true,
    );
  });

  it("type is nil for the unmapped default", () => {
    // Mirrors ActiveModel::Type::Value#type returning nil (value.rb:32-35).
    expect(new ValueType().type()).toBeUndefined();
  });

  it("as json not defined", () => {
    expect(() => new ValueType().asJson()).toThrow(NoMethodError);
  });

  describe("equals", () => {
    it("same class, no metadata: equal", () => {
      expect(new ValueType().equals(new ValueType())).toBe(true);
    });

    it("different class: not equal", () => {
      expect(new IntegerType().equals(new FloatType())).toBe(false);
    });

    it("same class, same precision and scale: equal", () => {
      expect(
        new DecimalType({ precision: 8, scale: 2 }).equals(
          new DecimalType({ precision: 8, scale: 2 }),
        ),
      ).toBe(true);
    });

    it("same class, different precision: not equal", () => {
      expect(new DecimalType({ precision: 8 }).equals(new DecimalType({ precision: 4 }))).toBe(
        false,
      );
    });

    it("same class, different scale: not equal", () => {
      expect(new DecimalType({ scale: 2 }).equals(new DecimalType({ scale: 4 }))).toBe(false);
    });

    it("same class, different limit: not equal", () => {
      expect(new IntegerType({ limit: 8 }).equals(new IntegerType({ limit: 4 }))).toBe(false);
    });

    it("subclass and parent: not equal", () => {
      expect(new IntegerType().equals(new BigIntegerType())).toBe(false);
    });
  });
});
