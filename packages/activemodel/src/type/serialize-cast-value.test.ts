import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("ActiveModel", () => {
  describe("SerializeCastValueTest", () => {
    it("provides a default #serialize_cast_value implementation", () => {
      const type = new Types.ValueType();
      expect(type.serialize("hello")).toBe("hello");
    });

    it("uses #serialize when a class does not include SerializeCastValue", () => {
      const type = new Types.StringType();
      expect(type.serialize(123)).toBe("123");
    });

    it("uses #serialize_cast_value when a class includes SerializeCastValue", () => {
      const type = new Types.IntegerType();
      const cast = type.cast("42");
      expect(type.serialize(cast)).toBe(42);
    });

    it("uses #serialize_cast_value when a subclass inherits both #serialize and #serialize_cast_value", () => {
      class CustomType extends Types.IntegerType {}
      const type = new CustomType();
      expect(type.serialize("42")).toBe(42);
    });

    it("uses #serialize when a subclass defines a newer #serialize implementation", () => {
      class CustomType extends Types.IntegerType {
        override serialize(value: unknown) {
          return `custom:${value}`;
        }
      }
      const type = new CustomType();
      expect(type.serialize(42)).toBe("custom:42");
    });

    it("uses #serialize_cast_value when a subclass defines a newer #serialize_cast_value implementation", () => {
      class CustomType extends Types.IntegerType {}
      const type = new CustomType();
      const cast = type.cast("5");
      expect(type.serialize(cast)).toBe(5);
    });

    it("uses #serialize when a subclass defines a newer #serialize implementation via a module", () => {
      class CustomType extends Types.StringType {
        override serialize(value: unknown) {
          return `mod:${value}`;
        }
      }
      const type = new CustomType();
      expect(type.serialize("test")).toBe("mod:test");
    });

    it("uses #serialize_cast_value when a subclass defines a newer #serialize_cast_value implementation via a module", () => {
      const type = new Types.FloatType();
      const cast = type.cast("3.14");
      expect(type.serialize(cast)).toBe(3.14);
    });

    it("uses #serialize when a delegate class does not include SerializeCastValue", () => {
      const type = new Types.BooleanType();
      expect(type.serialize("true")).toBe(true);
    });

    it("uses #serialize_cast_value when a delegate class prepends SerializeCastValue", () => {
      const type = new Types.DecimalType();
      const cast = type.cast("3.14");
      expect(type.serialize(cast)).toBe(cast);
    });

    it("uses #serialize_cast_value when a delegate class subclass includes SerializeCastValue", () => {
      class CustomDecimal extends Types.DecimalType {}
      const type = new CustomDecimal();
      const cast = type.cast("2.71");
      expect(type.serialize(cast)).toBe(cast);
    });
  });
});
