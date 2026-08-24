import { describe, it, expect } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { Rational } from "@blazetrails/date";
import { DecimalType as Decimal } from "./decimal.js";

// DecimalType#cast returns a BigDecimal (Rails: cast_value -> BigDecimal), so
// decimal binds quote in fixed "F" form rather than as a 'string' literal.
const bd = (value: string) => new BigDecimal(value);

describe("DecimalTest", () => {
  it("type cast decimal", () => {
    const type = new Decimal();
    expect(type.cast(bd("0"))).toEqual(bd("0"));
    expect(type.cast(123.0)).toEqual(bd("123"));
    // Rails casts the Symbol `:"1"`; a Ruby Symbol is a JS string in trails.
    expect(type.cast("1")).toEqual(bd("1"));
  });

  it("type cast decimal from invalid string", () => {
    const type = new Decimal();
    expect(type.cast("")).toBeNull();
    expect(type.cast("1ignore")).toEqual(bd("1"));
    expect(type.cast("bad1")).toEqual(bd("0"));
    expect(type.cast("bad")).toEqual(bd("0"));
  });

  it("type cast decimal from float with large precision", () => {
    // Rails: `::Float::DIG + 2` — 17 on IEEE-754 doubles.
    const type = new Decimal({ precision: 17 });
    expect(type.cast(123.0)).toEqual(bd("123.0"));
  });

  it("type cast from float with unspecified precision", () => {
    const type = new Decimal();
    expect(type.cast(22.68)).toEqual(bd("22.68"));
  });

  it("type cast decimal from rational with precision", () => {
    const type = new Decimal({ precision: 2 });
    expect(type.cast(new Rational(1, 3))).toEqual(bd("0.33"));
    expect(type.cast(new Rational(2, 3))).toEqual(bd("0.67"));
  });

  it("type cast decimal from rational with precision and scale", () => {
    const type = new Decimal({ precision: 4, scale: 2 });
    expect(type.cast(new Rational(1, 3))).toEqual(bd("0.33"));
    expect(type.cast(new Rational(2, 3))).toEqual(bd("0.67"));
  });

  it("type cast decimal from rational without precision defaults to 18 36", () => {
    const type = new Decimal();
    expect(type.cast(new Rational(1, 3))).toEqual(bd("0.333333333333333333E0"));
    expect(type.cast(new Rational(2, 3))).toEqual(bd("0.666666666666666667E0"));
  });

  it("type cast decimal from object responding to d", () => {
    const value = {
      toD() {
        return bd("1");
      },
    };
    const type = new Decimal();
    expect(type.cast(value)).toEqual(bd("1"));
  });

  it("changed?", () => {
    const type = new Decimal();

    expect(type.isChanged(0.0, 0, "wibble")).toBeTruthy();
    expect(type.isChanged(5.0, 0, "wibble")).toBeTruthy();
    expect(type.isChanged(5.0, 5.0, "5.0wibble")).toBeFalsy();
    expect(type.isChanged(5.0, 5.0, "5.0")).toBeFalsy();
    expect(type.isChanged(-5.0, -5.0, "-5.0")).toBeFalsy();
    expect(type.isChanged(5.0, 5.0, "0.5e+1")).toBeFalsy();
    // Rails passes `BigDecimal("0.0") / 0`; trails' NaN decimal is the "NaN" sentinel.
    expect(type.isChanged("NaN", "NaN", "NaN")).toBeFalsy();
    expect(type.isChanged("NaN", NaN, NaN)).toBeTruthy();
  });

  it("scale is applied before precision to prevent rounding errors", () => {
    const type = new Decimal({ precision: 5, scale: 3 });

    expect(type.cast(1.250473853637869)).toEqual(bd("1.250"));
    expect(type.cast("1.250473853637869")).toEqual(bd("1.250"));
  });
});
