import { describe, it, expect } from "vitest";
import { isNonNumericString, isNumberToNonNumber, isEqualNan } from "./numeric.js";

describe("Helpers::Numeric private predicates", () => {
  describe("isNonNumericString", () => {
    it("returns false for strings starting with a digit", () => {
      expect(isNonNumericString("1")).toBe(false);
      expect(isNonNumericString("1abc")).toBe(false);
      expect(isNonNumericString("  42")).toBe(false);
    });

    it("returns false for signed numeric strings", () => {
      expect(isNonNumericString("+1")).toBe(false);
      expect(isNonNumericString("-42")).toBe(false);
      expect(isNonNumericString("  -7")).toBe(false);
    });

    it("returns true for strings without a leading digit", () => {
      expect(isNonNumericString("wibble")).toBe(true);
      expect(isNonNumericString("")).toBe(true);
      expect(isNonNumericString("abc1")).toBe(true);
      expect(isNonNumericString(".5")).toBe(true);
    });
  });

  describe("isNumberToNonNumber", () => {
    it("returns false when oldValue is null/undefined", () => {
      expect(isNumberToNonNumber(null, "wibble")).toBe(false);
      expect(isNumberToNonNumber(undefined, "wibble")).toBe(false);
    });

    it("returns false when newValueBeforeTypeCast is numeric", () => {
      expect(isNumberToNonNumber(5, 7)).toBe(false);
      expect(isNumberToNonNumber(5, 7n)).toBe(false);
    });

    it("returns true when oldValue is set and new raw input is non-numeric string", () => {
      expect(isNumberToNonNumber(5, "wibble")).toBe(true);
      expect(isNumberToNonNumber(0, "")).toBe(true);
    });

    it("returns false when new raw input is a numeric string", () => {
      expect(isNumberToNonNumber(5, "7")).toBe(false);
      expect(isNumberToNonNumber(5, "-3.14")).toBe(false);
    });
  });

  describe("isEqualNan", () => {
    it("returns true when both values are NaN", () => {
      expect(isEqualNan(NaN, NaN)).toBe(true);
    });

    it("returns false when only one side is NaN", () => {
      expect(isEqualNan(NaN, 0)).toBe(false);
      expect(isEqualNan(0, NaN)).toBe(false);
    });

    it("returns false when neither side is NaN", () => {
      expect(isEqualNan(1, 1)).toBe(false);
      expect(isEqualNan(1, 2)).toBe(false);
    });

    it("returns false for non-number inputs", () => {
      expect(isEqualNan("NaN", "NaN")).toBe(false);
      expect(isEqualNan(null, null)).toBe(false);
    });
  });
});
