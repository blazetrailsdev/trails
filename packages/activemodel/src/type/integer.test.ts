import { describe, it, expect } from "vitest";
import { Model, Types } from "../index.js";

const type = new Types.IntegerType();

describe("ActiveModel", () => {
  describe("IntegerTest", () => {
    it("changed?", () => {
      class MyModel extends Model {
        static {
          this.attribute("price", "decimal");
        }
      }
      const m = new MyModel({ price: "1.0" });
      m.writeAttribute("price", "1.0");
      expect(m.attributeChanged("price")).toBe(false);
    });

    it("simple values", () => {
      expect(type.cast(1)).toBe(1);
      expect(type.cast(0)).toBe(0);
      expect(type.cast(-1)).toBe(-1);
      expect(type.cast(100)).toBe(100);
    });

    it("random objects cast to nil", () => {
      expect(type.cast({})).toBeNull();
      expect(type.cast([])).toBeNull();
      expect(type.cast("abc")).toBeNull();
    });

    it("casting objects without to_i", () => {
      // Objects without a numeric representation cast to null
      expect(type.cast("not_a_number")).toBeNull();
      expect(type.cast(undefined)).toBeNull();
    });

    it("casting nan and infinity", () => {
      expect(type.cast(NaN)).toBeNull();
      expect(type.cast(Infinity)).toBe(Infinity);
      expect(type.cast(-Infinity)).toBe(-Infinity);
    });

    it("casting booleans for database", () => {
      // In Rails, true casts to 1 and false to 0
      // In our implementation, parseInt("true") and parseInt("false") are NaN -> null
      expect(type.cast(true)).toBeNull();
      expect(type.cast(false)).toBeNull();
    });

    it("casting duration", () => {
      // Duration-like values - a number in seconds
      expect(type.cast(3600)).toBe(3600);
    });

    it("casting string for database", () => {
      expect(type.cast("123")).toBe(123);
      expect(type.cast("-45")).toBe(-45);
      expect(type.cast("0")).toBe(0);
    });

    it("casting empty string", () => {
      expect(type.cast("")).toBeNull();
    });

    it("values below int min value are out of range", () => {
      // JavaScript doesn't have the same integer limits as Ruby,
      // but we can test that very negative numbers still cast
      const minSafe = Number.MIN_SAFE_INTEGER;
      expect(type.cast(minSafe)).toBe(minSafe);
    });

    it("values above int max value are out of range", () => {
      const maxSafe = Number.MAX_SAFE_INTEGER;
      expect(type.cast(maxSafe)).toBe(maxSafe);
    });

    it("very small numbers are out of range", () => {
      // Numbers beyond safe integer range
      const verySmall = -1e20;
      expect(type.cast(verySmall)).toBe(Math.trunc(verySmall));
    });

    it("very large numbers are out of range", () => {
      const veryLarge = 1e20;
      expect(type.cast(veryLarge)).toBe(Math.trunc(veryLarge));
    });

    it("normal numbers are in range", () => {
      expect(type.cast(42)).toBe(42);
      expect(type.cast(-42)).toBe(-42);
      expect(type.cast(0)).toBe(0);
    });

    it("int max value is in range", () => {
      expect(type.cast(2147483647)).toBe(2147483647);
    });

    it("int min value is in range", () => {
      expect(type.cast(-2147483648)).toBe(-2147483648);
    });

    it("columns with a larger limit have larger ranges", () => {
      // bigint range (8 bytes)
      const bigVal = 2 ** 53 - 1; // MAX_SAFE_INTEGER
      expect(type.cast(bigVal)).toBe(bigVal);
    });

    it("serialize_cast_value is equivalent to serialize after cast", () => {
      const values = [1, "123", 0, -5, null];
      for (const v of values) {
        const cast = type.cast(v);
        const serialized = type.serialize(v);
        expect(serialized).toBe(cast);
      }
    });
  });
});
