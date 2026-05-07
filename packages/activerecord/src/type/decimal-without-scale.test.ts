import { BigIntegerType } from "@blazetrails/activemodel";
import { describe, expect, it } from "vitest";
import { DecimalWithoutScale } from "./decimal-without-scale.js";

describe("DecimalWithoutScale", () => {
  it("inherits from BigIntegerType", () => {
    expect(new DecimalWithoutScale()).toBeInstanceOf(BigIntegerType);
  });

  it("reports type as decimal", () => {
    const type = new DecimalWithoutScale();
    expect(type.type()).toBe("decimal");
    expect(type.name).toBe("decimal");
  });

  it("casts integer strings", () => {
    const type = new DecimalWithoutScale();
    expect(type.cast("42")).toBe(42);
    expect(type.cast("-7")).toBe(-7);
    expect(type.cast("")).toBeNull();
  });

  it("casts numbers by truncating", () => {
    const type = new DecimalWithoutScale();
    expect(type.cast(3.9)).toBe(3);
    expect(type.cast(-3.9)).toBe(-3);
  });

  it("returns null for non-finite numbers", () => {
    const type = new DecimalWithoutScale();
    expect(type.cast(Infinity)).toBeNull();
    expect(type.cast(-Infinity)).toBeNull();
    expect(type.cast(NaN)).toBeNull();
  });

  it("accepts large values beyond 32-bit range without truncation", () => {
    const type = new DecimalWithoutScale();
    // Values above 2^31-1 would throw ActiveModelRangeError under 4-byte IntegerType.
    // BigIntegerType's maxValue=Infinity bypasses that check. JS precision is exact up to 2^53.
    expect(type.cast("2147483648")).toBe(2147483648);
    expect(type.cast("9999999999")).toBe(9999999999);
  });

  it("typeCastForSchema quotes the value as a string", () => {
    const type = new DecimalWithoutScale();
    expect(type.typeCastForSchema("1.5")).toBe('"1.5"');
    expect(type.typeCastForSchema(null)).toBe('""');
    expect(type.typeCastForSchema(undefined)).toBe('""');
  });
});
