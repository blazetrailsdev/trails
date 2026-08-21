import { describe, it, expect } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { Rational } from "@blazetrails/date";
import { Types } from "../index.js";
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
describe("DecimalType", () => {
  const type = new Types.DecimalType();

  it("has name 'decimal'", () => {
    expect(type.name).toBe("decimal");
  });

  it("type cast decimal", () => {
    expect(type.cast(42.5)).toEqual(bd("42.5"));
  });

  it("casts string number to string", () => {
    expect(type.cast("3.14")).toEqual(bd("3.14"));
  });

  it("casts integer to string", () => {
    expect(type.cast(100)).toEqual(bd("100"));
  });

  it("casts null to null", () => {
    expect(type.cast(null)).toBe(null);
  });

  it("type cast decimal from invalid string", () => {
    // Mirrors Rails decimal_test.rb — "" nils out; leading-numeric
    // prefix is kept; no-numeric-prefix returns BigDecimal(0).
    expect(type.cast("")).toBe(null);
    expect(type.cast("1ignore")).toEqual(bd("1"));
    expect(type.cast("bad1")).toEqual(bd("0"));
    expect(type.cast("bad")).toEqual(bd("0"));
  });

  it("blank string casts to null via Helpers::Numeric", () => {
    const type = new Types.DecimalType();
    expect(type.cast("   ")).toBeNull();
  });

  it("serialize delegates to cast via Helpers::Numeric", () => {
    const type = new Types.DecimalType();
    expect(type.serialize("1.5")).toEqual(bd("1.5"));
    expect(type.serialize("")).toBeNull();
  });

  it("casting booleans via Helpers::Numeric — true → '1', false → '0'", () => {
    const type = new Types.DecimalType();
    expect(type.cast(true)).toEqual(bd("1"));
    expect(type.cast(false)).toEqual(bd("0"));
  });

  it("isChanged returns true for number_to_non_number? path — same cast value, non-numeric raw", () => {
    const type = new Types.DecimalType();
    expect(type.isChanged("0", "0", "wibble")).toBe(true);
  });

  it("isChanged returns false for genuine revert — same cast and numeric raw", () => {
    const type = new Types.DecimalType();
    expect(type.isChanged("5", "5", "5")).toBe(false);
  });

  it("casts NaN (BigDecimal NaN sentinel) — number and string forms", () => {
    const type = new Types.DecimalType();
    expect(type.cast(NaN)).toBe("NaN");
    expect(type.cast("NaN")).toBe("NaN");
  });

  it("casts ±Infinity (BigDecimal Infinity sentinel) — number and string forms", () => {
    // Rails routes Float through `value.to_d`, and `Float::INFINITY.to_d`
    // yields BigDecimal::INFINITY ("Infinity") rather than nil. With decimals
    // modelled as strings the value round-trips as the "Infinity"/"-Infinity"
    // sentinel (the JS ±Infinity on assignment, the string from PG on load).
    const type = new Types.DecimalType();
    expect(type.cast(Infinity)).toBe("Infinity");
    expect(type.cast(-Infinity)).toBe("-Infinity");
    expect(type.cast("Infinity")).toBe("Infinity");
    expect(type.cast("-Infinity")).toBe("-Infinity");
  });

  it("serialize bridges to BigDecimal F-form for quoting", () => {
    const type = new Types.DecimalType();
    expect((type.serialize(42) as BigDecimal).toString("F")).toBe("42.0");
    expect((type.serialize("1.5") as BigDecimal).toString("F")).toBe("1.5");
    expect(type.serialize(null)).toBeNull();
  });

  it("serialize keeps the NaN sentinel as a string (BigDecimal has no NaN)", () => {
    const type = new Types.DecimalType();
    expect(type.serialize(NaN)).toBe("NaN");
  });

  it("serialize leaves adversarial exponents as the raw cast string", () => {
    const type = new Types.DecimalType({ scale: 2 });
    expect(type.serialize("1e10000000")).toBe("1e10000000");
  });

  it("applyScale leaves the NaN sentinel untouched", () => {
    const type = new Types.DecimalType({ precision: 10, scale: 2 });
    expect(type.cast(NaN)).toBe("NaN");
    expect(type.cast("NaN")).toBe("NaN");
  });

  it("applyScale leaves the Infinity sentinel untouched", () => {
    const type = new Types.DecimalType({ precision: 10, scale: 2 });
    expect(type.cast(Infinity)).toBe("Infinity");
    expect(type.cast(-Infinity)).toBe("-Infinity");
  });
});
