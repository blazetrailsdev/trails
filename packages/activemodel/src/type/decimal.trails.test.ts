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
    // 1234.5 → 3 significant digits → "1230"
    expect(type.cast(1234.5)).toEqual(bd("1230"));
    // No precision configured: pass through (preserves the existing default).
    const noPrec = new Types.DecimalType();
    expect(noPrec.cast(1.2346)).toEqual(bd("1.2346"));
  });

  it("apply_scale handles leading-dot and trailing-dot numeric forms", () => {
    const type = new Types.DecimalType({ scale: 2 });
    // `_castWithoutScale` can emit forms like ".5" or "1." — apply_scale
    // must normalize them, not silently pass through.
    expect(type.cast(".5")).toEqual(bd("0.50"));
    expect(type.cast("1.")).toEqual(bd("1.00"));
  });

  it("apply_scale does not OOM on adversarial exponents", () => {
    // `"1e10000000"` would force splitDecimal to allocate a ~10M-digit
    // string if expanded naively. The cap leaves the raw form alone — and
    // BigDecimal can't hold it either, so the raw string passes through.
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
    m.writeAttribute("price", "1.0");
    expect(m.attributeChanged("price")).toBe(false);
  });
});
