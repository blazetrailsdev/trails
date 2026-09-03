import { describe, it, expect } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { Types } from "../index.js";

describe("FloatTest", () => {
  it("type cast float", () => {
    const type = new Types.FloatType();
    expect(type.cast("1")).toBe(1.0);
  });

  it("type cast float from invalid string", () => {
    const type = new Types.FloatType();
    expect(type.cast("")).toBeNull();
    expect(type.cast("1ignore")).toBe(1.0);
    expect(type.cast("bad1")).toBe(0.0);
    expect(type.cast("bad")).toBe(0.0);
  });

  it("changing float", () => {
    const type = new Types.FloatType();

    expect(type.isChanged(0.0, 0, "wibble")).toBeTruthy();
    expect(type.isChanged(5.0, 0, "wibble")).toBeTruthy();
    expect(type.isChanged(5.0, 5.0, "5wibble")).toBeFalsy();
    expect(type.isChanged(5.0, 5.0, "5")).toBeFalsy();
    expect(type.isChanged(5.0, 5.0, "5.0")).toBeFalsy();
    expect(type.isChanged(500.0, 500.0, "0.5E+4")).toBeFalsy();
    expect(type.isChanged(null, null, null)).toBeFalsy();
    expect(type.isChanged(NaN, NaN, NaN)).toBeFalsy();
    expect(type.isChanged(NaN, BigDecimal.NAN, BigDecimal.NAN)).toBeTruthy();
  });
});
