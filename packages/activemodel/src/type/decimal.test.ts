import { describe, it, expect } from "vitest";
import { Model, Types } from "../index.js";

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

  it("convertFloatToBigDecimal: precision rounds significant digits before scale", () => {
    // Mirrors Rails BigDecimal(value, float_precision) — Type::Decimal.new(precision: 3).cast(1.2346)
    // rounds the input to 3 significant digits ("1.23") before any scale: pass.
    const type = new Types.DecimalType({ precision: 3 });
    expect(type.cast(1.2346)).toBe("1.23");
    // 1234.5 → 3 significant digits → "1230"
    expect(type.cast(1234.5)).toBe("1230");
    // No precision configured: pass through (preserves the existing default).
    const noPrec = new Types.DecimalType();
    expect(noPrec.cast(1.2346)).toBe("1.2346");
  });

  it("scale is applied before precision to prevent rounding errors", () => {
    // Rails decimal_test.rb: Type::Decimal.new(precision: 5, scale: 3).cast(1.2346)
    // rounds to BigDecimal("1.235") via apply_scale before storage.
    const type = new Types.DecimalType({ precision: 5, scale: 3 });
    expect(type.cast(1.2346)).toBe("1.235");
    expect(type.cast("1.2346")).toBe("1.235");
    expect(type.cast("1.23")).toBe("1.230");
  });

  it("apply_scale handles leading-dot and trailing-dot numeric forms", () => {
    const type = new Types.DecimalType({ scale: 2 });
    // `_castWithoutScale` can emit forms like ".5" or "1." — apply_scale
    // must normalize them, not silently pass through.
    expect(type.cast(".5")).toBe("0.50");
    expect(type.cast("1.")).toBe("1.00");
  });

  it("apply_scale does not OOM on adversarial exponents", () => {
    // `"1e10000000"` would force splitDecimal to allocate a ~10M-digit
    // string if expanded naively. The cap leaves the raw form alone.
    const type = new Types.DecimalType({ scale: 2 });
    expect(type.cast("1e10000000")).toBe("1e10000000");
  });

  it("apply_scale ignores non-integer/negative scale values", () => {
    // Ruby BigDecimal#round(n) requires an Integer; rather than invent
    // new semantics, leave the raw value alone for scale = 2.5 / -1.
    expect(new Types.DecimalType({ scale: 2.5 }).cast("1.234")).toBe("1.234");
    expect(new Types.DecimalType({ scale: -1 }).cast("1.234")).toBe("1.234");
  });

  it("apply_scale rounds half away from zero", () => {
    // Ruby BigDecimal#round default is ROUND_HALF_UP (away from zero).
    const type = new Types.DecimalType({ scale: 2 });
    expect(type.cast("1.005")).toBe("1.01");
    expect(type.cast("-1.005")).toBe("-1.01");
    expect(type.cast("9.999")).toBe("10.00");
    expect(type.cast("-9.999")).toBe("-10.00");
  });

  it("type cast decimal", () => {
    const type = new Types.DecimalType();
    expect(type.cast(42.5)).toBe("42.5");
    expect(type.cast("3.14")).toBe("3.14");
  });

  it("type cast decimal from invalid string", () => {
    // Mirrors Rails' decimal_test.rb#test_type_cast_decimal_from_invalid_string:
    // empty string -> nil, leading-numeric prefix keeps the prefix,
    // non-numeric leading chars return BigDecimal(0).
    const type = new Types.DecimalType();
    expect(type.cast("")).toBe(null);
    expect(type.cast("1ignore")).toBe("1");
    expect(type.cast("bad1")).toBe("0");
    expect(type.cast("bad")).toBe("0");
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
describe("DecimalType", () => {
  const type = new Types.DecimalType();

  it("has name 'decimal'", () => {
    expect(type.name).toBe("decimal");
  });

  it("type cast decimal", () => {
    expect(type.cast(42.5)).toBe("42.5");
  });

  it("casts string number to string", () => {
    expect(type.cast("3.14")).toBe("3.14");
  });

  it("casts integer to string", () => {
    expect(type.cast(100)).toBe("100");
  });

  it("casts null to null", () => {
    expect(type.cast(null)).toBe(null);
  });

  it("type cast decimal from invalid string", () => {
    // Mirrors Rails decimal_test.rb — "" nils out; leading-numeric
    // prefix is kept; no-numeric-prefix returns BigDecimal(0).
    expect(type.cast("")).toBe(null);
    expect(type.cast("1ignore")).toBe("1");
    expect(type.cast("bad1")).toBe("0");
    expect(type.cast("bad")).toBe("0");
  });
});
