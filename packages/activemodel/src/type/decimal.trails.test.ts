import { describe, it, expect } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { Model, Types } from "../index.js";

const bd = (value: string) => new BigDecimal(value);

describe("DecimalTypeTrails", () => {
  it("convertFloatToBigDecimal: precision rounds significant digits before scale", () => {
    // Mirrors Rails BigDecimal(value, float_precision) — Type::Decimal.new(precision: 3).cast(1.2346)
    // rounds the input to 3 significant digits ("1.23") before any scale: pass.
    const type = new Types.DecimalType({ precision: 3 });
    expect(type.cast(1.2346)).toEqual(bd("1.23"));
    expect(type.cast(1234.5)).toEqual(bd("1230"));
    const noPrec = new Types.DecimalType();
    expect(noPrec.cast(1.2346)).toEqual(bd("1.2346"));
  });

  it("apply_scale handles leading-dot and trailing-dot numeric forms", () => {
    const type = new Types.DecimalType({ scale: 2 });
    expect(type.cast(".5")).toEqual(bd("0.50"));
    expect(type.cast("1.")).toEqual(bd("1.00"));
  });

  it("apply_scale does not OOM on adversarial exponents", () => {
    const type = new Types.DecimalType({ scale: 2 });
    expect(type.cast("1e10000000")).toBe("1e10000000");
  });

  it("apply_scale rounds to a multiple of ten for a negative scale", () => {
    // Ruby `BigDecimal#round(-1)` rounds to a multiple of 10 ** 1, so
    // apply_scale passes a negative `scale:` straight through to it.
    expect(new Types.DecimalType({ scale: -1 }).cast("14")).toEqual(bd("10"));
    expect(new Types.DecimalType({ scale: -1 }).cast("15")).toEqual(bd("20"));
    expect(new Types.DecimalType({ scale: -1 }).cast("-15")).toEqual(bd("-20"));
  });

  it("apply_scale rounds half away from zero", () => {
    // Ruby BigDecimal#round default is ROUND_HALF_UP (away from zero).
    const type = new Types.DecimalType({ scale: 2 });
    expect(type.cast("1.005")).toEqual(bd("1.01"));
    expect(type.cast("-1.005")).toEqual(bd("-1.01"));
    expect(type.cast("9.999")).toEqual(bd("10.00"));
    expect(type.cast("-9.999")).toEqual(bd("-10.00"));
  });

  it("treats a reverted decimal as unchanged", () => {
    class MyModel extends Model {
      static {
        this.attribute("price", "decimal");
      }
    }
    const m = new MyModel({ price: "1.0" });
    m._writeAttribute("price", "1.0");
    expect(m.attributeChanged("price")).toBe(false);
  });
});

describe("DecimalType cast and serialize coverage", () => {
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
