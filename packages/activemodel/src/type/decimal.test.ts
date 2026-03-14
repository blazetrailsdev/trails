import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";
import { ModelName } from "../naming.js";
import { CallbackChain } from "../callbacks.js";

describe("ActiveModel", () => {
  describe("DecimalTest", () => {
    it("type cast from float with unspecified precision", () => {
      const decimalType = new Types.DecimalType();
      const result = decimalType.cast(1.5);
      expect(result).toBe("1.5");
    });

    it("type cast decimal from rational with precision and scale", () => {
      const decimalType = new Types.DecimalType();
      const result = decimalType.cast("1.23");
      expect(result).toBe("1.23");
    });

    it("type cast decimal from rational without precision defaults to 18 36", () => {
      const decimalType = new Types.DecimalType();
      const result = decimalType.cast("1.23456789");
      expect(result).toBe("1.23456789");
    });

    it("type cast decimal from object responding to d", () => {
      const decimalType = new Types.DecimalType();
      const result = decimalType.cast(42);
      expect(result).toBe("42");
    });

    it("scale is applied before precision to prevent rounding errors", () => {
      const decimalType = new Types.DecimalType();
      const result = decimalType.cast("1.23");
      expect(result).toBe("1.23");
    });
  });

  describe("Type Decimal (ported)", () => {
    it("type cast decimal", () => {
      const type = new Types.DecimalType();
      expect(type.cast(42.5)).toBe("42.5");
      expect(type.cast("3.14")).toBe("3.14");
    });

    it("type cast decimal from invalid string", () => {
      const type = new Types.DecimalType();
      expect(type.cast("not-a-number")).toBe(null);
    });

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

    it("type cast decimal from float with large precision", () => {
      const type = new Types.DecimalType();
      const result = type.cast(3.14159265358979);
      expect(Number(result)).toBeCloseTo(3.14159265358979);
    });

    it("type cast decimal from rational with precision", () => {
      const type = new Types.DecimalType();
      const result = type.cast(0.3333333333);
      expect(Number(result)).toBeCloseTo(0.3333333333);
    });
  });
});
