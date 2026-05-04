import { describe, it, expect } from "vitest";
import { Types, ValueType, IntegerType, FloatType, DecimalType, BigIntegerType } from "../index.js";

describe("ValueTest", () => {
  it("type equality", () => {
    const type1 = Types.typeRegistry.lookup("value");
    const type2 = Types.typeRegistry.lookup("value");
    expect(type1.constructor).toBe(type2.constructor);
  });

  it("as json not defined", () => {
    const type = Types.typeRegistry.lookup("value");
    // Value type passes through without transformation
    expect(type.cast("hello")).toBe("hello");
    expect(type.cast(42)).toBe(42);
    expect(type.cast(null)).toBe(null);
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
        new DecimalType({ precision: 8, scale: 2 }).equals(new DecimalType({ precision: 8, scale: 2 }))
      ).toBe(true);
    });

    it("same class, different precision: not equal", () => {
      expect(
        new DecimalType({ precision: 8 }).equals(new DecimalType({ precision: 4 }))
      ).toBe(false);
    });

    it("same class, different scale: not equal", () => {
      expect(
        new DecimalType({ scale: 2 }).equals(new DecimalType({ scale: 4 }))
      ).toBe(false);
    });

    it("same class, different limit: not equal", () => {
      expect(
        new IntegerType({ limit: 8 }).equals(new IntegerType({ limit: 4 }))
      ).toBe(false);
    });

    it("subclass and parent: not equal", () => {
      expect(new IntegerType().equals(new BigIntegerType())).toBe(false);
    });
  });
});
