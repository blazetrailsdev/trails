import { describe, it, expect } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { include } from "@blazetrails/activesupport";
import { Numeric } from "../../../lib/type/helpers/numeric.js";
import { ValueType } from "../../../lib/type/value.js";

describe("Helpers::Numeric private predicates", () => {
  describe("isNonNumericString", () => {
    it("returns false for strings starting with a digit", () => {
      expect(Numeric.isNonNumericString("1")).toBe(false);
      expect(Numeric.isNonNumericString("1abc")).toBe(false);
      expect(Numeric.isNonNumericString("  42")).toBe(false);
    });

    it("returns false for signed numeric strings", () => {
      expect(Numeric.isNonNumericString("+1")).toBe(false);
      expect(Numeric.isNonNumericString("-42")).toBe(false);
      expect(Numeric.isNonNumericString("  -7")).toBe(false);
    });

    it("returns true for strings without a leading digit", () => {
      expect(Numeric.isNonNumericString("wibble")).toBe(true);
      expect(Numeric.isNonNumericString("")).toBe(true);
      expect(Numeric.isNonNumericString("abc1")).toBe(true);
      expect(Numeric.isNonNumericString(".5")).toBe(true);
    });
  });

  describe("isNumberToNonNumber", () => {
    it("returns false when oldValue is null/undefined", () => {
      expect(Numeric.isNumberToNonNumber(null, "wibble")).toBe(false);
      expect(Numeric.isNumberToNonNumber(undefined, "wibble")).toBe(false);
    });

    it("returns false when newValueBeforeTypeCast is numeric", () => {
      expect(Numeric.isNumberToNonNumber(5, 7)).toBe(false);
      expect(Numeric.isNumberToNonNumber(5, 7n)).toBe(false);
    });

    it("returns true when oldValue is set and new raw input is non-numeric string", () => {
      expect(Numeric.isNumberToNonNumber(5, "wibble")).toBe(true);
      expect(Numeric.isNumberToNonNumber(0, "")).toBe(true);
    });

    it("returns false when new raw input is a numeric string", () => {
      expect(Numeric.isNumberToNonNumber(5, "7")).toBe(false);
      expect(Numeric.isNumberToNonNumber(5, "-3.14")).toBe(false);
    });
  });

  describe("isEqualNan", () => {
    it("returns true when both values are NaN", () => {
      expect(Numeric.isEqualNan(NaN, NaN)).toBe(true);
    });

    it("returns false when only one side is NaN", () => {
      expect(Numeric.isEqualNan(NaN, 0)).toBe(false);
      expect(Numeric.isEqualNan(0, NaN)).toBe(false);
    });

    it("returns false when neither side is NaN", () => {
      expect(Numeric.isEqualNan(1, 1)).toBe(false);
      expect(Numeric.isEqualNan(1, 2)).toBe(false);
    });

    it("returns false for non-number inputs", () => {
      expect(Numeric.isEqualNan(null, null)).toBe(false);
      expect(Numeric.isEqualNan("nan", "nan")).toBe(false);
      expect(Numeric.isEqualNan("NaN", NaN)).toBe(false);
      expect(Numeric.isEqualNan(NaN, "NaN")).toBe(false);
    });

    it('treats the decimal "NaN" sentinel as BigDecimal NaN on both sides', () => {
      expect(Numeric.isEqualNan(BigDecimal.NAN, BigDecimal.NAN)).toBe(true);
    });
  });
});

describe("Numeric", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
  interface ConcreteNumeric extends Omit<Numeric, "cast" | "serialize" | "serializeCastValue"> {}
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  class ConcreteNumeric extends ValueType<number> {
    readonly name = "test_numeric";
    type() {
      return this.name;
    }
    protected castValue(value: unknown): number | null {
      if (typeof value === "number") return value;
      const n = Number(value);
      return isNaN(n) ? null : n;
    }
  }

  include(ConcreteNumeric, Numeric);

  const type = new ConcreteNumeric();

  it("cast returns null for blank strings", () => {
    expect(type.cast("")).toBeNull();
    expect(type.cast("   ")).toBeNull();
  });

  it("cast converts true to 1 and false to 0", () => {
    expect(type.cast(true)).toBe(1);
    expect(type.cast(false)).toBe(0);
  });

  it("serialize delegates to cast", () => {
    expect(type.serialize(42)).toBe(42);
    expect(type.serialize("")).toBeNull();
  });

  it("isChanged returns false for NaN → NaN", () => {
    expect(type.isChanged(NaN, NaN, NaN)).toBe(false);
  });

  it("isChanged returns true for number-to-non-number — number_to_non_number? forces change", () => {
    expect(type.isChanged(0, null, "abc")).toBe(true);
  });
});
